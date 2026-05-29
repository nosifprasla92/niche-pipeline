import { z } from "zod";
import {
  supabase,
  type FeedbackPattern,
  type HandlerResult,
  type Idea,
  type IdeaQuestion,
  type ResearchSource,
  type RoutineRun,
} from "../../lib/supabase";
import { generateStructured } from "../claude";

const BRACKET_MRR_CEILING = {
  lifestyle: 4000,
  business: 16000,
} as const;

const QA_LIMIT = 20;
const QA_ANSWER_CHARS = 1500;
const SOURCES_LIMIT = 6;
const SOURCE_DATA_POINTS = 8;

function formatInsights(points: Idea["why_it_works"]): string {
  if (!points?.length) return "(none)";
  return points
    .map((p) => `- ${p.text}${p.important ? " [IMPORTANT]" : ""}`)
    .join("\n");
}

function formatQA(rows: IdeaQuestion[]): string {
  if (rows.length === 0) return "(no Q&A on this idea)";
  const lines: string[] = [];
  for (const r of rows) {
    const ans =
      r.answer.length > QA_ANSWER_CHARS
        ? `${r.answer.slice(0, QA_ANSWER_CHARS)}…`
        : r.answer;
    lines.push(`Q: ${r.question}`);
    lines.push(`A: ${ans}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatSources(sources: ResearchSource[]): string {
  if (sources.length === 0) return "(no tag-matching sources ingested)";
  const lines: string[] = [];
  for (const s of sources) {
    lines.push(`- [${s.title}](${s.url})`);
    lines.push(`  ${s.summary}`);
    const points = s.key_data_points?.slice(0, SOURCE_DATA_POINTS) ?? [];
    for (const p of points) {
      const ctx = p.context ? ` (${p.context})` : "";
      lines.push(`  • ${p.metric}: ${p.value}${ctx}`);
    }
  }
  return lines.join("\n");
}

const TaskDetailSchema = z.object({
  task: z.string().min(3).max(600),
  steps: z.array(z.string().min(10).max(1000)).min(2).max(8),
});

const LaunchWeekSchema = z.object({
  weeks: z.string().min(1).max(20),
  title: z.string().min(3).max(160),
  tasks: z.array(TaskDetailSchema).min(1).max(10),
});

const BusinessPlanSchema = z.object({
  executive_summary: z.string().min(40).max(2000),
  target_customer: z.string().min(40).max(1500),
  value_proposition: z.string().min(40).max(1500),
  offer: z.object({
    product_or_service: z.string().min(20).max(1500),
    pricing_model: z.string().min(20).max(800),
    landing_page_strategy: z.string().min(20).max(1500),
  }),
  go_to_market_zero_paid: z.array(z.string().min(10).max(800)).min(3).max(10),
  go_to_market_paid_after_10_customers: z
    .array(z.string().min(10).max(800))
    .min(2)
    .max(8),
  launch_plan_12_weeks: z.array(LaunchWeekSchema).min(3).max(12),
  tools_stack: z.array(z.string().min(2).max(240)).min(3).max(20),
  financial_projection: z.object({
    months_1_3: z.string().min(10).max(1000),
    months_4_6: z.string().min(10).max(1000),
    month_12: z.string().min(10).max(1000),
  }),
  biggest_risks: z.array(z.string().min(10).max(800)).min(2).max(8),
  kill_conditions: z.array(z.string().min(10).max(800)).min(2).max(6),
});

const PlannerSchema = z.object({
  business_plan: BusinessPlanSchema,
  first_actions: z.array(z.string().min(10).max(600)).length(3),
});

function buildPrompt(
  idea: Idea,
  dislikes: FeedbackPattern[],
  qa: IdeaQuestion[],
  sources: ResearchSource[],
): string {
  const bracket = idea.income_bracket ?? "business";
  const ceiling = BRACKET_MRR_CEILING[bracket];

  const dislikeBlock = dislikes.length
    ? dislikes.map((d) => `- ${d.pattern}`).join("\n")
    : "(none)";

  return `You are the plan-builder for a single-user small-business idea pipeline. The user has researched AND validated this idea (real ad test + interviews) and is ready to commit a quarter to it. Build a concrete 12-week plan.

Use EVERYTHING below — the validation kit's landing copy / interview script / ad plan / decision rubric / distribution beachhead / open questions / pricing anchor, the founder's prior Q&A on this idea (with inline source URLs from WebSearch), the research priors, and any tag-matching ingested sources — to build a plan that respects what's already been learned. Re-use the founder's own framing and customer language wherever possible; the distribution_beachhead from validation should anchor go_to_market_zero_paid; pricing_anchor should anchor offer.pricing_model; the decision_rubric should inform kill_conditions.

IDEA #${idea.id}: ${idea.title}
BRACKET: ${bracket} (month-12 MRR ceiling for projection: $${ceiling})
TAGS: ${idea.tags?.join(", ") || "(none)"}

DESCRIPTION:
${idea.description}

WHY IT WORKS (from generator):
${formatInsights(idea.why_it_works)}

DEVIL'S ADVOCATE (from generator):
${formatInsights(idea.devils_advocate)}

RESEARCH:
- Competitors above price floor: ${idea.competitors_above_50 ?? "?"}
- Competition analysis: ${idea.competition_analysis ?? "(none)"}
- Competitor complaints: ${idea.competitor_complaints ?? "(none)"}
- Effort: ${idea.effort_weeks ?? "?"} weeks. ${idea.effort_breakdown ?? ""}
- Zero-paid path (from research): ${idea.zero_paid_path ?? "(none)"}

VALIDATION KIT (full content — read and integrate, don't just acknowledge):

Landing copy:
${idea.landing_copy ?? "[MISSING — abort]"}

Interview script:
${idea.interview_questions ?? "(missing)"}

Ad test plan:
${idea.ad_test_plan ?? "(missing)"}

Signals to collect:
${idea.validation_signals ?? "(missing)"}

Day-7 decision rubric:
${idea.decision_rubric ?? "(missing)"}

Distribution beachhead (where to find prospects):
${idea.distribution_beachhead ?? "(missing)"}

Pricing anchor:
${idea.pricing_anchor ?? "(missing)"}

Open questions the test must resolve:
${idea.open_questions ?? "(missing)"}

Validation recap (synthesis):
${idea.validation_recap ?? "(missing)"}

FOUNDER Q&A ON THIS IDEA (most recent last; answers may contain inline [URL] citations from WebSearch — treat those as sources):
${formatQA(qa)}

TAG-MATCHING RESEARCH SOURCES (global priors — cite if you use a number):
${formatSources(sources)}

${idea.user_notes ? `FOUNDER NOTES:\n${idea.user_notes}\n\n` : ""}FOUNDER DISLIKES (avoid in plan choices):
${dislikeBlock}

GUARDRAILS:
- Split go-to-market into TWO phases: zero_paid (first 10 customers) and paid_after_10 (scale once you've validated unit economics).
- financial_projection.month_12 MRR must not exceed $${ceiling}. If you'd otherwise project higher, anchor at the ceiling and explain in months_4_6 why scaling slowed.
- launch_plan_12_weeks: 4 phases of ~3 weeks each (weeks 1-3, 4-6, 7-9, 10-12). Each phase has a title and 3-6 concrete tasks.
- Each task has a short label ("task") AND 2-8 detailed step-by-step instructions ("steps"). Steps must be specific enough that the founder can follow them as a daily/weekly checklist — include exact tools, URLs, copy templates, commands, metric thresholds, and time estimates where relevant. Write steps in imperative form ("Open Stripe dashboard…", "Draft 3 variations of…").
- first_actions: exactly 3 TODOs the founder should do TODAY. Specific. Verb-first. ≤ 30 words each.

Output shape (JSON):
{
  "business_plan": {
    "executive_summary": "...",
    "target_customer": "...",
    "value_proposition": "...",
    "offer": {
      "product_or_service": "...",
      "pricing_model": "...",
      "landing_page_strategy": "..."
    },
    "go_to_market_zero_paid": ["...", "...", "..."],
    "go_to_market_paid_after_10_customers": ["...", "..."],
    "launch_plan_12_weeks": [
      {"weeks": "1-3", "title": "...", "tasks": [
        {"task": "Short task label", "steps": ["Step 1: do X using Y…", "Step 2: …"]},
        ...
      ]},
      ...
    ],
    "tools_stack": ["...", "..."],
    "financial_projection": {
      "months_1_3": "...",
      "months_4_6": "...",
      "month_12": "$X MRR — reasoning"
    },
    "biggest_risks": ["...", "..."],
    "kill_conditions": ["...", "..."]
  },
  "first_actions": ["TODO 1", "TODO 2", "TODO 3"]
}`;
}

export async function handlePlanner(run: RoutineRun): Promise<HandlerResult> {
  if (run.idea_context_id == null) {
    throw new Error("planner run has no idea_context_id");
  }
  const ideaId = run.idea_context_id;

  const [ideaRes, patternsRes] = await Promise.all([
    supabase.from("ideas").select("*").eq("id", ideaId).single(),
    supabase
      .from("feedback_patterns")
      .select("*")
      .eq("pattern_type", "dislike"),
  ]);
  if (ideaRes.error) throw new Error(`fetch idea: ${ideaRes.error.message}`);
  if (patternsRes.error)
    throw new Error(`fetch patterns: ${patternsRes.error.message}`);

  const idea = ideaRes.data as Idea;
  const dislikes = (patternsRes.data ?? []) as FeedbackPattern[];

  if (!idea.validated_at) {
    throw new Error(
      `idea #${ideaId} has no validated_at — run validator first`,
    );
  }

  const [qaRes, sourcesRes] = await Promise.all([
    supabase
      .from("idea_questions")
      .select(
        "id, idea_id, question, answer, model, thinking_tokens, input_tokens, output_tokens, created_at",
      )
      .eq("idea_id", ideaId)
      .order("created_at", { ascending: true })
      .limit(QA_LIMIT),
    idea.tags && idea.tags.length > 0
      ? supabase
          .from("research_sources")
          .select(
            "id, url, title, source_type, summary, key_data_points, tags, ingested_at, created_at, updated_at",
          )
          .overlaps("tags", idea.tags)
          .limit(SOURCES_LIMIT)
      : Promise.resolve({ data: [] as ResearchSource[], error: null }),
  ]);
  if (qaRes.error) throw new Error(`fetch qa: ${qaRes.error.message}`);
  if (sourcesRes.error)
    throw new Error(`fetch sources: ${sourcesRes.error.message}`);
  const qa = (qaRes.data ?? []) as IdeaQuestion[];
  const sources = (sourcesRes.data ?? []) as ResearchSource[];

  const { value: out, cost } = await generateStructured({
    prompt: buildPrompt(idea, dislikes, qa, sources),
    schema: PlannerSchema,
    model: "sonnet",
    maxRetries: 2,
  });

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("ideas")
    .update({
      status: "plan_ready",
      business_plan: out.business_plan,
      first_actions: out.first_actions,
      plan_ready_at: nowIso,
    })
    .eq("id", ideaId);
  if (error) throw new Error(`update idea: ${error.message}`);

  return {
    summary: `Built 12-week plan for #${ideaId}`,
    cost,
  };
}
