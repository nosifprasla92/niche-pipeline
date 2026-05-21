import { z } from "zod";
import {
  supabase,
  type FeedbackPattern,
  type Idea,
  type RoutineRun,
} from "../../lib/supabase";
import { generateStructured } from "../claude";

const BRACKET_MRR_CEILING = {
  lifestyle: 4000,
  business: 16000,
} as const;

const LaunchWeekSchema = z.object({
  weeks: z.string().min(1).max(20),
  title: z.string().min(3).max(160),
  tasks: z.array(z.string().min(3).max(600)).min(1).max(10),
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

function buildPrompt(idea: Idea, dislikes: FeedbackPattern[]): string {
  const bracket = idea.income_bracket ?? "business";
  const ceiling = BRACKET_MRR_CEILING[bracket];

  const dislikeBlock = dislikes.length
    ? dislikes.map((d) => `- ${d.pattern}`).join("\n")
    : "(none)";

  return `You are the plan-builder for a single-user small-business idea pipeline. The user has researched AND validated this idea (real ad test + interviews) and is ready to commit a quarter to it. Build a concrete 12-week plan.

IDEA #${idea.id}: ${idea.title}
BRACKET: ${bracket} (month-12 MRR ceiling for projection: $${ceiling})

DESCRIPTION:
${idea.description}

RESEARCH:
- Competitors above price floor: ${idea.competitors_above_50 ?? "?"}
- Competition analysis: ${idea.competition_analysis ?? "(none)"}
- Effort: ${idea.effort_weeks ?? "?"} weeks
- Zero-paid path (from research): ${idea.zero_paid_path ?? "(none)"}

VALIDATION OUTPUT:
- Landing copy: ${idea.landing_copy ? "[present]" : "[MISSING — abort]"}
- Interview questions: ${idea.interview_questions ? "[present]" : "[missing]"}
- Ad test plan: ${idea.ad_test_plan ? "[present]" : "[missing]"}

FOUNDER DISLIKES (avoid in plan choices):
${dislikeBlock}

GUARDRAILS:
- Split go-to-market into TWO phases: zero_paid (first 10 customers) and paid_after_10 (scale once you've validated unit economics).
- financial_projection.month_12 MRR must not exceed $${ceiling}. If you'd otherwise project higher, anchor at the ceiling and explain in months_4_6 why scaling slowed.
- launch_plan_12_weeks: 4 phases of ~3 weeks each (weeks 1-3, 4-6, 7-9, 10-12). Each phase has a title and 3-6 concrete tasks.
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
      {"weeks": "1-3", "title": "...", "tasks": ["...", "..."]},
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

export async function handlePlanner(run: RoutineRun): Promise<string> {
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

  const out = await generateStructured({
    prompt: buildPrompt(idea, dislikes),
    schema: PlannerSchema,
    model: "sonnet",
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

  return `Built 12-week plan for #${ideaId}`;
}
