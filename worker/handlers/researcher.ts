import { z } from "zod";
import {
  supabase,
  type FeedbackPattern,
  type Idea,
  type RoutineRun,
} from "../../lib/supabase";
import { generateStructured } from "../claude";

const BRACKET_FLOORS = {
  lifestyle: { monthly: 15, oneTime: 99 },
  business: { monthly: 49, oneTime: 499 },
} as const;

const ResearchSchema = z.object({
  auto_kill: z.object({
    kill: z.boolean(),
    reason: z.string().max(280),
  }),
  competitors_above_50: z.number().int().min(0).max(500),
  competitor_complaints: z.string().min(40).max(2000),
  competition_analysis: z.string().min(80).max(2000),
  effort_weeks: z.number().int().min(1).max(52),
  effort_breakdown: z.string().min(40).max(1000),
  zero_paid_path: z.string().min(40).max(1500),
});

function formatInsights(points: Idea["why_it_works"]): string {
  if (!points?.length) return "(none)";
  return points
    .map((p) => `- ${p.text}${p.important ? " [IMPORTANT]" : ""}`)
    .join("\n");
}

function buildPrompt(idea: Idea, dislikes: FeedbackPattern[]): string {
  const bracket = idea.income_bracket ?? "business";
  const floor = BRACKET_FLOORS[bracket];

  const dislikeBlock = dislikes.length
    ? dislikes.map((d) => `- ${d.pattern} (×${d.confidence})`).join("\n")
    : "(none)";

  return `You are the research analyst for a single-user small-business idea pipeline. You take a generated idea and produce a structured read on competition, effort, and a zero-paid go-to-market path.

This is OFFLINE research — you do not have web access. Reason from your training-time knowledge of the category. Be honest about uncertainty rather than fabricating specifics. When you describe competitor complaints, prefix the field with "[OFFLINE PRIORS]" so the reader knows these aren't verbatim quotes.

IDEA #${idea.id}: ${idea.title}
BRACKET: ${bracket} (price floor for kill: <$${floor.monthly}/mo OR <$${floor.oneTime} one-time → kill)

DESCRIPTION:
${idea.description}

WHY IT WORKS (from generator):
${formatInsights(idea.why_it_works)}

DEVIL'S ADVOCATE (from generator):
${formatInsights(idea.devils_advocate)}

FOUNDER'S DISLIKE PATTERNS (auto-kill if match):
${dislikeBlock}

AUTO-KILL RULES — set auto_kill.kill=true if ANY of:
1. No reasonable basis to believe competitors charge >$${floor.monthly}/mo or >$${floor.oneTime} one-time in this category.
2. No plausible zero-paid acquisition path (paid ads or partnerships required from day 1).
3. Effort > 12 weeks for a solo founder MVP.
4. Idea matches any dislike pattern above.
5. Category demand is flat or declining.

Output shape (JSON):
{
  "auto_kill": { "kill": boolean, "reason": "one sentence naming the rule that fired; empty if kill=false" },
  "competitors_above_50": <int 0-500>,
  "competitor_complaints": "[OFFLINE PRIORS] 3-6 likely complaints, inferred",
  "competition_analysis": "2-4 sentences on competitive structure + realistic wedge",
  "effort_weeks": <int 1-52>,
  "effort_breakdown": "short bullet-style breakdown",
  "zero_paid_path": "concrete first-10-customers plan that costs $0"
}`;
}

export async function handleResearcher(run: RoutineRun): Promise<string> {
  if (run.idea_context_id == null) {
    throw new Error("researcher run has no idea_context_id");
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

  const out = await generateStructured({
    prompt: buildPrompt(idea, dislikes),
    schema: ResearchSchema,
    model: "opus",
  });

  const nowIso = new Date().toISOString();

  if (out.auto_kill.kill) {
    const { error } = await supabase
      .from("ideas")
      .update({
        status: "killed",
        kill_reason: out.auto_kill.reason || "auto-killed by research",
        killed_at: nowIso,
        competitors_above_50: out.competitors_above_50,
        competitor_complaints: out.competitor_complaints,
        competition_analysis: out.competition_analysis,
        effort_weeks: out.effort_weeks,
        effort_breakdown: out.effort_breakdown,
        zero_paid_path: out.zero_paid_path,
        researched_at: nowIso,
      })
      .eq("id", ideaId);
    if (error) throw new Error(`update idea (kill): ${error.message}`);
    return `Researched #${ideaId} → killed: ${out.auto_kill.reason}`;
  }

  const { error } = await supabase
    .from("ideas")
    .update({
      status: "researched",
      competitors_above_50: out.competitors_above_50,
      competitor_complaints: out.competitor_complaints,
      competition_analysis: out.competition_analysis,
      effort_weeks: out.effort_weeks,
      effort_breakdown: out.effort_breakdown,
      zero_paid_path: out.zero_paid_path,
      researched_at: nowIso,
    })
    .eq("id", ideaId);
  if (error) throw new Error(`update idea: ${error.message}`);

  return `Researched #${ideaId}: competitors_above_50=${out.competitors_above_50}, effort=${out.effort_weeks}w`;
}
