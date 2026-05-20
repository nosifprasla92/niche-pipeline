import { generateObject } from "ai";
import { z } from "zod";
import type { FeedbackPattern, Idea } from "./supabase";

// In-repo replacement for the Cloud Researcher routine. Same output shape so
// /api/trigger-research-local can write the same idea columns and the UI
// doesn't need to know which engine produced the row.
//
// Honest about being offline: this engine has no web access. It reasons from
// the model's prior knowledge of the category. That's worse than the Cloud
// routine for verbatim review quotes and competitor head-counts, but for the
// "should this idea survive auto-kill" filter step it's usually good enough
// — and ~10–50x cheaper because there's no agentic loop.

export const RESEARCH_MODEL = "anthropic/claude-haiku-4-5";

const BRACKET_FLOORS = {
  lifestyle: { monthly: 15, oneTime: 99 },
  business: { monthly: 49, oneTime: 499 },
} as const;

export const ResearchSchema = z.object({
  auto_kill: z.object({
    kill: z
      .boolean()
      .describe("True if any of the auto-kill rules triggers."),
    reason: z
      .string()
      .max(280)
      .describe(
        "If kill=true, one sentence naming the specific rule that fired. " +
          "Empty string if kill=false.",
      ),
  }),
  competitors_above_50: z
    .number()
    .int()
    .min(0)
    .max(500)
    .describe(
      "Best-guess count of paid competitors charging at or above the " +
        "bracket-matched price floor. From prior knowledge, not live web. " +
        "Return 0 if you don't believe any cross the floor.",
    ),
  competitor_complaints: z
    .string()
    .min(40)
    .max(2000)
    .describe(
      "3–6 likely user complaints about existing solutions, inferred from " +
        "prior knowledge of the category. Prefix the field with " +
        "'[OFFLINE PRIORS] ' so the reader knows these aren't verbatim quotes.",
    ),
  competition_analysis: z
    .string()
    .min(80)
    .max(2000)
    .describe(
      "2–4 sentences on competitive structure: saturation, incumbents, " +
        "what realistic wedge a solo founder could take.",
    ),
  effort_weeks: z
    .number()
    .int()
    .min(1)
    .max(52)
    .describe("Realistic solo-founder MVP build estimate in weeks."),
  effort_breakdown: z
    .string()
    .min(40)
    .max(1000)
    .describe("Short bullet-style breakdown of major tasks + rough effort."),
  zero_paid_path: z
    .string()
    .min(40)
    .max(1500)
    .describe(
      "Concrete first-10-customers acquisition plan that costs $0. Channels, " +
        "outreach pattern, qualifying criteria.",
    ),
});

export type ResearchOutput = z.infer<typeof ResearchSchema>;

export function buildResearchPrompt(
  idea: Idea,
  dislikes: FeedbackPattern[],
): string {
  const bracket = idea.income_bracket ?? "business";
  const floor = BRACKET_FLOORS[bracket];

  const dislikeBlock = dislikes.length
    ? dislikes.map((d) => `- ${d.pattern} (×${d.confidence})`).join("\n")
    : "(none)";

  const formatInsights = (points: Idea["why_it_works"]) =>
    points.length
      ? points
          .map((p) => `- ${p.text}${p.important ? " [IMPORTANT]" : ""}`)
          .join("\n")
      : "(none)";

  return `You are the research analyst for a single-user small-business idea pipeline. You take a generated idea and produce a structured read on competition, effort, and a zero-paid go-to-market path.

This is OFFLINE research — you do not have web access. Reason from your training-time knowledge of the category. Be honest about uncertainty rather than fabricating specifics. When you describe competitor complaints, mark them as priors (the schema's description tells you the exact prefix to use).

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
1. No reasonable basis to believe competitors charge >$${floor.monthly}/mo or >$${floor.oneTime} one-time in this category (no willingness-to-pay signal).
2. No plausible zero-paid acquisition path (paid ads or partnerships required from day 1).
3. Effort > 12 weeks for a solo founder MVP.
4. Idea matches any dislike pattern above.
5. Category demand is flat or declining based on what you know.

Otherwise, fill in the research fields with your best-guess priors.`;
}

export async function runLocalResearch(
  idea: Idea,
  dislikes: FeedbackPattern[],
): Promise<ResearchOutput> {
  const { object } = await generateObject({
    model: RESEARCH_MODEL,
    schema: ResearchSchema,
    prompt: buildResearchPrompt(idea, dislikes),
  });
  return object;
}
