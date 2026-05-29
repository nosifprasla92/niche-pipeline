import { z } from "zod";
import {
  supabase,
  type HandlerResult,
  type RoutineRun,
} from "../../lib/supabase";
import { generateStructured } from "../claude";

const KILL_WINDOW_DAYS = 14;
const POOL_WINDOW_DAYS = 60;
const QA_PER_IDEA = 3;
const QA_ANSWER_CHARS = 800;
const NOTES_CHARS = 600;
const TUPLE_MIN_COUNT = 3;
const SURVIVOR_LIST_LIMIT = 15;

const PATTERN_MAX_CHARS = 220;

const PostmortemSchema = z.object({
  replace_pattern_ids: z.array(z.number().int().positive()),
  new_patterns: z.array(
    z.object({
      pattern_type: z.enum(["like", "dislike"]),
      pattern: z.string().min(4).max(PATTERN_MAX_CHARS),
      confidence: z.number().int().min(1).max(20),
    }),
  ),
  profile_summary: z.string().min(40).max(800),
  saturation_notes: z.string().max(600),
});

type KilledRich = {
  id: number;
  title: string;
  tags: string[] | null;
  kill_reason: string | null;
  created_at: string;
  killed_at: string | null;
  user_notes: string | null;
  competitor_complaints: string | null;
  effort_breakdown: string | null;
};

type PoolIdea = {
  id: number;
  title: string;
  status: string;
  tags: string[] | null;
  created_at: string;
  killed_at: string | null;
};

type PatternRow = {
  id: number;
  pattern: string;
  pattern_type: "like" | "dislike";
  confidence: number;
  created_at: string;
};

type QARow = {
  idea_id: number;
  question: string;
  answer: string;
  created_at: string;
};

function velocityBucket(createdISO: string, killedISO: string | null): string {
  if (!killedISO) return "unknown";
  const hours =
    (new Date(killedISO).getTime() - new Date(createdISO).getTime()) /
    3_600_000;
  if (hours < 2) return "instant (<2h)";
  if (hours < 24) return "same-day";
  if (hours < 72) return "<3d";
  return "considered";
}

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function tagAxis(tags: string[] | null, prefix: string): string {
  if (!tags) return "?";
  const hit = tags.find((t) => t.toLowerCase().startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1).toLowerCase() : "?";
}

function tupleKey(tags: string[] | null): string {
  return `${tagAxis(tags, "domain")} × ${tagAxis(tags, "gtm")} × ${tagAxis(tags, "positioning")}`;
}

function trimChars(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function buildPrompt(args: {
  killed: KilledRich[];
  dislikes: PatternRow[];
  likes: PatternRow[];
  qaByIdea: Map<number, QARow[]>;
  saturatedTuples: { tuple: string; count: number }[];
  survivors: PoolIdea[];
}): string {
  const { killed, dislikes, likes, qaByIdea, saturatedTuples, survivors } =
    args;

  const killedBlock = killed.length
    ? killed
        .map((k) => {
          const vel = velocityBucket(k.created_at, k.killed_at);
          const tuple = tupleKey(k.tags);
          const notes = trimChars(k.user_notes, NOTES_CHARS);
          const compl = trimChars(k.competitor_complaints, NOTES_CHARS);
          const eff = trimChars(k.effort_breakdown, NOTES_CHARS);
          const extras = [
            notes && `  user_notes: ${notes}`,
            compl && `  competitor_complaints: ${compl}`,
            eff && `  effort_breakdown: ${eff}`,
          ]
            .filter(Boolean)
            .join("\n");
          return `- #${k.id} [${vel}] (${tuple}) "${k.title}" — ${k.kill_reason ?? "(no reason given)"}${extras ? `\n${extras}` : ""}`;
        })
        .join("\n")
    : "(none in window)";

  const dislikeBlock = dislikes.length
    ? dislikes
        .map(
          (d) =>
            `- [id=${d.id}, age=${ageDays(d.created_at)}d] (×${d.confidence}) ${d.pattern}`,
        )
        .join("\n")
    : "(none)";

  const likeBlock = likes.length
    ? likes
        .map(
          (l) =>
            `- [id=${l.id}, age=${ageDays(l.created_at)}d] (×${l.confidence}) ${l.pattern}`,
        )
        .join("\n")
    : "(none)";

  const reasoningBlocks: string[] = [];
  for (const k of killed) {
    const pairs = qaByIdea.get(k.id);
    if (!pairs || pairs.length === 0) continue;
    const lines = pairs
      .slice(0, QA_PER_IDEA)
      .map((p) => {
        const ans = trimChars(p.answer, QA_ANSWER_CHARS);
        return `  Q: ${p.question}\n  A: ${ans}`;
      })
      .join("\n");
    reasoningBlocks.push(`## #${k.id} "${k.title}"\n${lines}`);
  }
  const reasoningBlock = reasoningBlocks.length
    ? reasoningBlocks.join("\n\n")
    : "(no Q&A on killed ideas in window)";

  const saturatedBlock = saturatedTuples.length
    ? saturatedTuples
        .map(
          (t) =>
            `- ${t.tuple} → appeared ${t.count}× in last ${POOL_WINDOW_DAYS}d`,
        )
        .join("\n")
    : "(no over-represented tuples)";

  const survivorBlock = survivors.length
    ? survivors
        .map(
          (s) =>
            `- #${s.id} [${s.status}] (${tupleKey(s.tags)}) "${s.title}"`,
        )
        .join("\n")
    : "(none — nothing has been advanced past `new` recently)";

  return `You are the post-mortem analyst for a single-user small-business idea pipeline. The founder reviews AI-generated ideas daily, kills the ones that don't fit, and advances the survivors. Your job: turn the recent activity into clean signal that keeps the next batch of ideas FRESH (not just non-objectionable).

KILLED IDEAS (last ${KILL_WINDOW_DAYS}d — each line shows the kill velocity, the (domain × gtm × positioning) tuple, kill_reason, and any founder notes or research output that survived the kill):
${killedBlock}

FOUNDER Q&A ON KILLED IDEAS (the Q&A often reveals the real objection more clearly than the kill_reason string):
${reasoningBlock}

SURVIVORS (last ${POOL_WINDOW_DAYS}d, status advanced past \`new\` — these are the strongest positive signal in the system):
${survivorBlock}

OVER-REPRESENTED ARCHETYPE TUPLES in last ${POOL_WINDOW_DAYS}d idea pool (domain × gtm × positioning, kills + survivors combined):
${saturatedBlock}

EXISTING DISLIKE PATTERNS (with age in days — old + unreinforced ones can be retired):
${dislikeBlock}

EXISTING LIKE PATTERNS (with age in days — old + unreinforced ones can be retired):
${likeBlock}

TASKS:
1. Consolidate dislikes: merge near-duplicates. Put absorbed IDs in replace_pattern_ids; emit the merged version in new_patterns with pattern_type="dislike". Aim for 5–10 clean dislike clusters total.
2. Mine new dislikes from killed kill_reasons + the Q&A + user_notes/competitor_complaints/effort_breakdown above. Weight INSTANT and SAME-DAY kills heavier — they're the cleanest archetype rejections. confidence ≈ count of source items backing each cluster.
3. Mine likes from SURVIVORS — what trait do the advanced ideas share that the killed ones lack? Emit them with pattern_type="like". Same phrasing rules as dislikes.
4. Retire stale patterns: any pattern (like or dislike) that is >30 days old AND not reinforced by the recent killed/survivor activity above, put its ID in replace_pattern_ids WITHOUT a replacement in new_patterns. That deletes it.
5. profile_summary: 2–3 sentences in second person ("You prefer…", "You avoid…"). Reads as a coherent founder profile, not a bullet list.
6. saturation_notes: 1–3 short sentences naming archetypes or tuples the generator should COOL OFF on for the next batch. Examples: "You've seen 5 AI-copilot-for-consultants ideas in the last month — skip that combination next batch." or "(b2b × content-marketing × tool) is saturated; rotate gtm." Leave empty string ("") if nothing is obviously over-represented.

Phrasing rules for new_patterns:
- Declarative noun-phrases. "Physical inventory or fulfillment-dependent businesses" — not "Avoid physical inventory".
- No leading verbs ("Avoid", "Don't", "Prefer").
- Specific enough to filter ideas, vague enough to cover variants.
- HARD LIMIT: each \`pattern\` field must be ≤${PATTERN_MAX_CHARS} characters. If you need to enumerate examples, pick at most 2–3; don't blow the budget on a long parenthetical list.

Output shape (JSON):
{
  "replace_pattern_ids": [<int>...],
  "new_patterns": [
    {"pattern_type": "like" | "dislike", "pattern": "...", "confidence": <int>}, ...
  ],
  "profile_summary": "2-3 sentences in second person",
  "saturation_notes": "1-3 sentences or empty string"
}`;
}

export async function handlePostmortem(_run: RoutineRun): Promise<HandlerResult> {
  const killCutoff = new Date(
    Date.now() - KILL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const poolCutoff = new Date(
    Date.now() - POOL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [killedRes, poolRes, patternsRes] = await Promise.all([
    supabase
      .from("ideas")
      .select(
        "id, title, tags, kill_reason, created_at, killed_at, user_notes, competitor_complaints, effort_breakdown",
      )
      .eq("status", "killed")
      .gt("killed_at", killCutoff),
    supabase
      .from("ideas")
      .select("id, title, status, tags, created_at, killed_at")
      .gt("created_at", poolCutoff)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("feedback_patterns")
      .select("id, pattern_type, pattern, confidence, created_at"),
  ]);
  if (killedRes.error)
    throw new Error(`fetch killed: ${killedRes.error.message}`);
  if (poolRes.error) throw new Error(`fetch pool: ${poolRes.error.message}`);
  if (patternsRes.error)
    throw new Error(`fetch patterns: ${patternsRes.error.message}`);

  const killed = (killedRes.data ?? []) as KilledRich[];
  const pool = (poolRes.data ?? []) as PoolIdea[];
  const allPatterns = (patternsRes.data ?? []) as PatternRow[];
  const dislikes = allPatterns.filter((p) => p.pattern_type === "dislike");
  const likes = allPatterns.filter((p) => p.pattern_type === "like");

  if (killed.length === 0 && pool.length === 0) {
    return {
      summary: "No recent activity to analyze.",
      cost: null,
    };
  }

  const tupleCounts = new Map<string, number>();
  for (const p of pool) {
    const k = tupleKey(p.tags);
    if (k.includes("?")) continue;
    tupleCounts.set(k, (tupleCounts.get(k) ?? 0) + 1);
  }
  const saturatedTuples = Array.from(tupleCounts.entries())
    .filter(([, n]) => n >= TUPLE_MIN_COUNT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tuple, count]) => ({ tuple, count }));

  const survivors = pool
    .filter((p) => p.status !== "new" && p.status !== "killed")
    .slice(0, SURVIVOR_LIST_LIMIT);

  const qaByIdea = new Map<number, QARow[]>();
  if (killed.length > 0) {
    const { data: qaRows, error: qaErr } = await supabase
      .from("idea_questions")
      .select("idea_id, question, answer, created_at")
      .in(
        "idea_id",
        killed.map((k) => k.id),
      )
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
    prompt: buildPrompt({
      killed,
      dislikes,
      likes,
      qaByIdea,
      saturatedTuples,
      survivors,
    }),
    schema: PostmortemSchema,
    model: "sonnet",
    maxRetries: 2,
  });

  const patternsById = new Map(allPatterns.map((p) => [p.id, p]));
  const validReplaceIds = new Set(allPatterns.map((p) => p.id));
  const toDelete = object.replace_pattern_ids.filter((id) =>
    validReplaceIds.has(id),
  );
  // Snapshot retired pattern text BEFORE the delete — IDs disappear with the rows.
  const retiredSnapshot = toDelete
    .map((id) => patternsById.get(id))
    .filter((p): p is PatternRow => p != null)
    .map((p) => ({ pattern_type: p.pattern_type, pattern: p.pattern }));

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("feedback_patterns")
      .delete()
      .in("id", toDelete);
    if (error) throw new Error(`delete patterns: ${error.message}`);
  }

  let addedSnapshot: Array<{
    id: number;
    pattern_type: "like" | "dislike";
    pattern: string;
    confidence: number;
  }> = [];
  if (object.new_patterns.length > 0) {
    const rows = object.new_patterns.map((p) => ({
      pattern_type: p.pattern_type,
      pattern: p.pattern,
      confidence: p.confidence,
    }));
    const { data: insertedRows, error } = await supabase
      .from("feedback_patterns")
      .insert(rows)
      .select("id, pattern_type, pattern, confidence");
    if (error) throw new Error(`insert patterns: ${error.message}`);
    addedSnapshot = (insertedRows ?? []) as typeof addedSnapshot;
  }

  const remainingPatternCount =
    allPatterns.length - toDelete.length + object.new_patterns.length;
  const newLikes = object.new_patterns.filter(
    (p) => p.pattern_type === "like",
  ).length;
  const newDislikes = object.new_patterns.filter(
    (p) => p.pattern_type === "dislike",
  ).length;

  const recap = {
    ran_at: new Date().toISOString(),
    killed_count: killed.length,
    pool_count: pool.length,
    added: addedSnapshot,
    retired: retiredSnapshot,
    saturated_tuples: saturatedTuples,
    saturation_notes: object.saturation_notes,
  };

  const { error: profErr } = await supabase
    .from("pipeline_profile")
    .update({
      summary: object.profile_summary,
      saturation_notes: object.saturation_notes,
      last_postmortem: recap,
      generated_at: new Date().toISOString(),
      pattern_count: remainingPatternCount,
      idea_count: killed.length,
    })
    .eq("id", 1);
  if (profErr) throw new Error(`update profile: ${profErr.message}`);

  return {
    summary: `Clustered ${killed.length} kill(s) + ${pool.length}-idea pool into ${newDislikes} dislike(s), ${newLikes} like(s); retired ${toDelete.length}; ${saturatedTuples.length} saturated tuple(s).`,
    cost,
  };
}
