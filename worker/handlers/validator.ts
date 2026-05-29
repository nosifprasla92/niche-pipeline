import { z } from "zod";
import {
  supabase,
  type HandlerResult,
  type Idea,
  type IdeaQuestion,
  type ResearchSource,
  type RoutineRun,
} from "../../lib/supabase";
import { generateStructured } from "../claude";

const BRACKET_PRICES = {
  lifestyle: { low: 15, high: 49 },
  business: { low: 49, high: 199 },
} as const;

const QA_LIMIT = 20;
const QA_ANSWER_CHARS = 1500;
const SOURCES_LIMIT = 6;
const SOURCE_DATA_POINTS = 8;

const ValidatorSchema = z.object({
  landing_copy: z.string().min(200).max(4000),
  interview_questions: z.string().min(200).max(3000),
  ad_test_plan: z.string().min(200).max(3000),
  validation_signals: z.string().min(100).max(1500),
  decision_rubric: z.string().min(150).max(2000),
  distribution_beachhead: z.string().min(150).max(2000),
  open_questions: z.string().min(100).max(1500),
  pricing_anchor: z.string().min(100).max(1500),
  validation_recap: z.string().min(200).max(1500),
});

function formatInsights(points: Idea["why_it_works"]): string {
  if (!points?.length) return "(none)";
  return points
    .map((p) => `- ${p.text}${p.important ? " [IMPORTANT]" : ""}`)
    .join("\n");
}

function formatQA(rows: IdeaQuestion[]): string {
  if (rows.length === 0) return "(no Q&A on this idea yet)";
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

function buildPrompt(
  idea: Idea,
  qa: IdeaQuestion[],
  sources: ResearchSource[],
): string {
  const bracket = idea.income_bracket ?? "business";
  const price = BRACKET_PRICES[bracket];

  return `You are the validation-kit builder for a single-user small-business idea pipeline. The user has finished research on an idea and is about to test demand with a $50 ad + 5 customer interviews. Build the materials they'll need.

Use EVERYTHING below — the founder's prior Q&A on this idea (with inline source URLs from WebSearch), the offline research priors, and any tag-matching ingested sources — to ground the kit in what the founder already knows. Reuse the founder's own framing, objections, and customer language from the Q&A wherever possible.

IDEA #${idea.id}: ${idea.title}
BRACKET: ${bracket} (test price range: $${price.low}–$${price.high}/mo or $${price.low * 10}–$${price.high * 10} one-time)
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
- Zero-paid path: ${idea.zero_paid_path ?? "(none)"}

FOUNDER Q&A ON THIS IDEA (most recent last; answers may contain inline [URL] citations from WebSearch — treat those as sources):
${formatQA(qa)}

TAG-MATCHING RESEARCH SOURCES (global priors — cite if you use a number):
${formatSources(sources)}

${idea.user_notes ? `FOUNDER NOTES:\n${idea.user_notes}\n\n` : ""}OUTPUT 9 PLAIN-TEXT ARTIFACTS (no markdown headers, no JSON inside the text fields, just plain prose with line breaks):

1. landing_copy: A complete landing page in text form. Include:
   - Headline (≤10 words)
   - Subhead (1 sentence)
   - 3–5 bullet benefits
   - Demo concept (1 paragraph)
   - Paid CTA wording
   - Test price (a specific dollar amount from the bracket-matched range above, with reasoning)

2. interview_questions: A script for talking to 5 target customers. Include:
   - Who to interview (1 sentence describing the prospect)
   - 7 mom-test-style questions (past behavior, not opinions about the idea)
   - The single signal you're listening for that means "this is real"

3. ad_test_plan: A concrete $50 paid test. Include:
   - Best channel for this audience (1 sentence why)
   - Targeting (audience, interests, exclusions)
   - 2 ad headlines + 2 ad bodies
   - Success threshold (e.g. "≥X clicks, ≥Y% landing-page conversion to email")

4. validation_signals: 3 specific numbers to collect during the test + the kill threshold for each. Format: "Metric: <name> | Target: <number> | Kill if: <number>"

5. decision_rubric: A day-7 go/no-go that combines ad signals + interview themes into ONE call (not 3 separate per-metric thresholds). Include:
   - "Go" pattern: the specific combination of evidence that means commit a quarter to this (e.g. "≥2 paying email signups AND ≥3 of 5 interviews surfaced the same painkiller language")
   - "Kill" pattern: the specific combination that means stop (be honest about ambiguity — if conversion is borderline but interviews are strong, what wins?)
   - "Extend" pattern: the conditions under which another 7 days of testing is justified, with what would change
   - The tiebreaker if signals and interviews disagree

6. distribution_beachhead: Where to find 5 interviewable prospects THIS WEEK. Specific, not abstract. Include:
   - 2–4 named places (subreddits, Slack/Discord communities, X lists, LinkedIn groups, niche forums, search queries) — actual names/URLs/queries, not "find a relevant community"
   - The opening line / cold-DM template tailored to each (≤2 sentences each)
   - One qualifying question to filter curious onlookers from real-pain prospects before booking the interview
   - The realistic response rate to expect

7. open_questions: 3–5 things this test must resolve, synthesized from the FOUNDER Q&A above. Pull the founder's own unresolved doubts (uncertainty, hedges, "I don't know" moments). Each item: the question + which artifact above is designed to answer it (e.g. "interview Q3" or "ad headline B"). If the Q&A is empty, derive from devil's advocate + competitor complaints instead and say so.

8. pricing_anchor: What customers already pay for the closest alternative, and why the proposed test price is defensible against that anchor. Include:
   - 2–3 named alternatives with their actual prices (cite Q&A sources or research priors when available)
   - The gap your offer fills that justifies the proposed price (or a lower price if the anchor is below your test range)
   - The specific objection a prospect might raise on price and the one-line response

9. validation_recap: ONE short paragraph (3–6 sentences) that synthesizes research + Q&A + the kit above into a "here's what we know and here's what this test will resolve" briefing. The founder reads this before clicking 'Approve plan'. Lead with the wedge in one sentence, then the 2–3 things the test will actually prove or disprove, then the realistic-case outcome you'd bet on. No hype, no recap of bullet lists already shown — synthesis only.

Output shape (JSON):
{
  "landing_copy": "...",
  "interview_questions": "...",
  "ad_test_plan": "...",
  "validation_signals": "...",
  "decision_rubric": "...",
  "distribution_beachhead": "...",
  "open_questions": "...",
  "pricing_anchor": "...",
  "validation_recap": "..."
}`;
}

export async function handleValidator(run: RoutineRun): Promise<HandlerResult> {
  if (run.idea_context_id == null) {
    throw new Error("validator run has no idea_context_id");
  }
  const ideaId = run.idea_context_id;

  const { data, error } = await supabase
    .from("ideas")
    .select("*")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(`fetch idea: ${error.message}`);
  const idea = data as Idea;

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
    prompt: buildPrompt(idea, qa, sources),
    schema: ValidatorSchema,
    model: "opus",
  });

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("ideas")
    .update({
      status: "validated",
      landing_copy: out.landing_copy,
      interview_questions: out.interview_questions,
      ad_test_plan: out.ad_test_plan,
      validation_signals: out.validation_signals,
      decision_rubric: out.decision_rubric,
      distribution_beachhead: out.distribution_beachhead,
      open_questions: out.open_questions,
      pricing_anchor: out.pricing_anchor,
      validation_recap: out.validation_recap,
      validated_at: nowIso,
    })
    .eq("id", ideaId);
  if (updErr) throw new Error(`update idea: ${updErr.message}`);

  // Extract test price from landing_copy for the summary, best-effort.
  const priceMatch = out.landing_copy.match(/\$(\d+(?:\.\d+)?)/);
  const priceHint = priceMatch ? ` Test price: $${priceMatch[1]}.` : "";

  return {
    summary: `Validation kit ready for #${ideaId}.${priceHint}`,
    cost,
  };
}
