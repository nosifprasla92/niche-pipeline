import { z } from "zod";
import {
  supabase,
  type HandlerResult,
  type RoutineRun,
} from "../../lib/supabase";
import { generateStructured } from "../claude";

const KILL_WINDOW_DAYS = 14;
const QA_PER_IDEA = 3;
const QA_ANSWER_CHARS = 800;

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
type QARow = {
  idea_id: number;
  question: string;
  answer: string;
  created_at: string;
};

function buildPrompt(
  killed: Killed[],
  dislikes: DislikePattern[],
  likes: DislikePattern[],
  qaByIdea: Map<number, QARow[]>,
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

  const reasoningBlocks: string[] = [];
  for (const k of killed) {
    const pairs = qaByIdea.get(k.id);
    if (!pairs || pairs.length === 0) continue;
    const lines = pairs
      .slice(0, QA_PER_IDEA)
      .map((p) => {
        const ans =
          p.answer.length > QA_ANSWER_CHARS
            ? `${p.answer.slice(0, QA_ANSWER_CHARS)}…`
            : p.answer;
        return `  Q: ${p.question}\n  A: ${ans}`;
      })
      .join("\n");
    reasoningBlocks.push(`## #${k.id} "${k.title}"\n${lines}`);
  }
  const reasoningBlock = reasoningBlocks.length
    ? reasoningBlocks.join("\n\n")
    : "(no Q&A on killed ideas in window)";

  return `You are the post-mortem analyst for a single-user small-business idea pipeline. The user reviews AI-generated ideas daily and kills the ones that don't fit. Your job: turn the noise into a clean signal.

KILLED IDEAS (last ${KILL_WINDOW_DAYS} days):
${killedBlock}

FOUNDER REASONING ON KILLED IDEAS (Q&A pairs — what the founder asked and the answer they got before deciding to kill. These often surface the real objection more clearly than the kill_reason string):
${reasoningBlock}

EXISTING DISLIKE PATTERNS:
${dislikeBlock}

EXISTING LIKE PATTERNS (for profile context, do not modify):
${likeBlock}

TASKS:
1. Consolidate the existing dislike patterns. If two say roughly the same thing, merge them. Put the IDs being absorbed in replace_pattern_ids; emit the merged version in new_patterns. Aim for 5–10 clean clusters total.
2. Add new dislike clusters from killed-idea kill_reasons AND from the FOUNDER REASONING above (the Q&A often reveals the real objection — a thin "not for me" kill_reason backed by Q&A about, say, "this needs paid ads day 1" should produce a pattern about paid-acquisition dependence). confidence ≈ count of source items backing each cluster.
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

export async function handlePostmortem(_run: RoutineRun): Promise<HandlerResult> {
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
    return {
      summary: "No killed ideas and no dislike patterns to analyze.",
      cost: null,
    };
  }

  const qaByIdea = new Map<number, QARow[]>();
  if (killed.length > 0) {
    const { data: qaRows, error: qaErr } = await supabase
      .from("idea_questions")
      .select("idea_id, question, answer, created_at")
      .in("idea_id", killed.map((k) => k.id))
      .order("created_at", { ascending: false })
      .limit(QA_PER_IDEA * killed.length);
    if (qaErr) throw new Error(`fetch qa: ${qaErr.message}`);
    for (const row of (qaRows ?? []) as QARow[]) {
      const bucket = qaByIdea.get(row.idea_id) ?? [];
      bucket.push(row);
      qaByIdea.set(row.idea_id, bucket);
    }
  }

  const { value: object, cost } = await generateStructured({
    prompt: buildPrompt(killed, dislikes, likes, qaByIdea),
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

  return {
    summary: `Clustered ${killed.length} killed ideas + ${dislikes.length} existing dislikes into ${object.new_patterns.length} patterns. Replaced ${toDelete.length}. Profile refreshed.`,
    cost,
  };
}
