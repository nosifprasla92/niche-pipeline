import { z } from "zod";
import { supabase, type RoutineRun } from "../../lib/supabase";
import { generateStructured } from "../claude";

const KILL_WINDOW_DAYS = 14;

const PostmortemSchema = z.object({
  replace_pattern_ids: z.array(z.number().int().positive()),
  new_patterns: z.array(
    z.object({
      pattern: z.string().min(4).max(160),
      confidence: z.number().int().min(1).max(20),
    }),
  ),
  profile_summary: z.string().min(40).max(800),
});

type Killed = { id: number; title: string; kill_reason: string | null };
type DislikePattern = { id: number; pattern: string; confidence: number };

function buildPrompt(
  killed: Killed[],
  dislikes: DislikePattern[],
  likes: DislikePattern[],
): string {
  const killedBlock = killed.length
    ? killed
        .map(
          (k) =>
            `- #${k.id} "${k.title}" — ${k.kill_reason ?? "(no reason given)"}`,
        )
        .join("\n")
    : "(none in window)";

  const dislikeBlock = dislikes.length
    ? dislikes
        .map((d) => `- [id=${d.id}] (×${d.confidence}) ${d.pattern}`)
        .join("\n")
    : "(none)";

  const likeBlock = likes.length
    ? likes.map((l) => `- (×${l.confidence}) ${l.pattern}`).join("\n")
    : "(none)";

  return `You are the post-mortem analyst for a single-user small-business idea pipeline. The user reviews AI-generated ideas daily and kills the ones that don't fit. Your job: turn the noise into a clean signal.

KILLED IDEAS (last ${KILL_WINDOW_DAYS} days):
${killedBlock}

EXISTING DISLIKE PATTERNS:
${dislikeBlock}

EXISTING LIKE PATTERNS (for profile context, do not modify):
${likeBlock}

TASKS:
1. Consolidate the existing dislike patterns. If two say roughly the same thing, merge them. Put the IDs being absorbed in replace_pattern_ids; emit the merged version in new_patterns. Aim for 5–10 clean clusters total.
2. Add new dislike clusters from killed-idea kill_reasons that aren't already covered. confidence ≈ count of source items backing each cluster.
3. profile_summary: 2–3 sentences in second person ("You prefer…", "You avoid…"). Reads as a coherent founder profile, not a bullet list.

Phrasing rules for new_patterns:
- Declarative noun-phrases. "Physical inventory or fulfillment-dependent businesses" — not "Avoid physical inventory".
- No leading verbs ("Avoid", "Don't").
- Specific enough to filter ideas, vague enough to cover variants.

Output shape (JSON):
{
  "replace_pattern_ids": [<int>...],
  "new_patterns": [{"pattern": "...", "confidence": <int>}, ...],
  "profile_summary": "2-3 sentences in second person"
}`;
}

export async function handlePostmortem(_run: RoutineRun): Promise<string> {
  const cutoff = new Date(
    Date.now() - KILL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [killedRes, patternsRes] = await Promise.all([
    supabase
      .from("ideas")
      .select("id, title, kill_reason")
      .eq("status", "killed")
      .gt("killed_at", cutoff),
    supabase
      .from("feedback_patterns")
      .select("id, pattern_type, pattern, confidence"),
  ]);
  if (killedRes.error) throw new Error(`fetch killed: ${killedRes.error.message}`);
  if (patternsRes.error)
    throw new Error(`fetch patterns: ${patternsRes.error.message}`);

  const killed = (killedRes.data ?? []) as Killed[];
  const allPatterns = (patternsRes.data ?? []) as Array<
    DislikePattern & { pattern_type: "like" | "dislike" }
  >;
  const dislikes = allPatterns.filter((p) => p.pattern_type === "dislike");
  const likes = allPatterns.filter((p) => p.pattern_type === "like");

  if (killed.length === 0 && dislikes.length === 0) {
    return "No killed ideas and no dislike patterns to analyze.";
  }

  const object = await generateStructured({
    prompt: buildPrompt(killed, dislikes, likes),
    schema: PostmortemSchema,
    model: "sonnet",
  });

  const validReplaceIds = new Set(dislikes.map((d) => d.id));
  const toDelete = object.replace_pattern_ids.filter((id) =>
    validReplaceIds.has(id),
  );

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("feedback_patterns")
      .delete()
      .in("id", toDelete);
    if (error) throw new Error(`delete patterns: ${error.message}`);
  }

  if (object.new_patterns.length > 0) {
    const rows = object.new_patterns.map((p) => ({
      pattern_type: "dislike" as const,
      pattern: p.pattern,
      confidence: p.confidence,
    }));
    const { error } = await supabase.from("feedback_patterns").insert(rows);
    if (error) throw new Error(`insert patterns: ${error.message}`);
  }

  const { error: profErr } = await supabase
    .from("pipeline_profile")
    .update({
      summary: object.profile_summary,
      generated_at: new Date().toISOString(),
      pattern_count:
        dislikes.length - toDelete.length + object.new_patterns.length,
      idea_count: killed.length,
    })
    .eq("id", 1);
  if (profErr) throw new Error(`update profile: ${profErr.message}`);

  return `Clustered ${killed.length} killed ideas + ${dislikes.length} existing dislikes into ${object.new_patterns.length} patterns. Replaced ${toDelete.length}. Profile refreshed.`;
}
