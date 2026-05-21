import { z } from "zod";
import { supabase, type Idea, type RoutineRun } from "../../lib/supabase";
import { generateStructured } from "../claude";

const BRACKET_PRICES = {
  lifestyle: { low: 15, high: 49 },
  business: { low: 49, high: 199 },
} as const;

const ValidatorSchema = z.object({
  landing_copy: z.string().min(200).max(4000),
  interview_questions: z.string().min(200).max(3000),
  ad_test_plan: z.string().min(200).max(3000),
  validation_signals: z.string().min(100).max(1500),
});

function buildPrompt(idea: Idea): string {
  const bracket = idea.income_bracket ?? "business";
  const price = BRACKET_PRICES[bracket];

  return `You are the validation-kit builder for a single-user small-business idea pipeline. The user has finished research on an idea and is about to test demand with a $50 ad + 5 customer interviews. Build the materials they'll need.

IDEA #${idea.id}: ${idea.title}
BRACKET: ${bracket} (test price range: $${price.low}–$${price.high}/mo or $${price.low * 10}–$${price.high * 10} one-time)

DESCRIPTION:
${idea.description}

ZERO-PAID PATH (from research):
${idea.zero_paid_path ?? "(none)"}

COMPETITION:
${idea.competition_analysis ?? "(none)"}

EFFORT:
${idea.effort_weeks ?? "?"} weeks. ${idea.effort_breakdown ?? ""}

OUTPUT 4 PLAIN-TEXT ARTIFACTS (no markdown headers, no JSON inside the text fields, just plain prose with line breaks):

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

Output shape (JSON):
{
  "landing_copy": "...",
  "interview_questions": "...",
  "ad_test_plan": "...",
  "validation_signals": "..."
}`;
}

export async function handleValidator(run: RoutineRun): Promise<string> {
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

  const out = await generateStructured({
    prompt: buildPrompt(idea),
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
      validated_at: nowIso,
    })
    .eq("id", ideaId);
  if (updErr) throw new Error(`update idea: ${updErr.message}`);

  // Extract test price from landing_copy for the summary, best-effort.
  const priceMatch = out.landing_copy.match(/\$(\d+(?:\.\d+)?)/);
  const priceHint = priceMatch ? ` Test price: $${priceMatch[1]}.` : "";

  return `Validation kit ready for #${ideaId}.${priceHint}`;
}
