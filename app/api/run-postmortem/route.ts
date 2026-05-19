import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import {
  checkInFlight,
  insertTriggered,
  markAccepted,
  markCompleted,
  markError,
} from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

export const maxDuration = 300;

const KILL_WINDOW_DAYS = 14;
const MODEL = "anthropic/claude-opus-4-7";

const PostmortemSchema = z.object({
  replace_pattern_ids: z
    .array(z.number().int().positive())
    .describe(
      "IDs of existing dislike patterns that the new_patterns consolidate. " +
        "These rows will be deleted before the new ones are inserted.",
    ),
  new_patterns: z
    .array(
      z.object({
        pattern: z
          .string()
          .min(4)
          .max(160)
          .describe("Short, declarative phrase (no leading verbs like 'Avoid')."),
        confidence: z
          .number()
          .int()
          .min(1)
          .max(20)
          .describe(
            "Roughly the count of source items (killed ideas + replaced patterns) backing this cluster.",
          ),
      }),
    )
    .describe(
      "Consolidated dislike clusters. May add brand-new patterns from killed-idea reasons OR merge existing ones.",
    ),
  profile_summary: z
    .string()
    .min(40)
    .max(800)
    .describe(
      "2–3 sentences in second person. Captures the founder's preferences as a coherent profile, not a bullet list. Used by the Generator routine to bias new-idea selection.",
    ),
});

type Killed = { id: number; title: string; kill_reason: string | null };
type DislikePattern = { id: number; pattern: string; confidence: number };

function buildPrompt(killed: Killed[], dislikes: DislikePattern[], likes: DislikePattern[]) {
  const killedBlock = killed.length
    ? killed
        .map((k) => `- #${k.id} "${k.title}" — ${k.kill_reason ?? "(no reason given)"}`)
        .join("\n")
    : "(none in window)";

  const dislikeBlock = dislikes.length
    ? dislikes.map((d) => `- [id=${d.id}] (×${d.confidence}) ${d.pattern}`).join("\n")
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
1. Consolidate the existing dislike patterns. If two say roughly the same thing (e.g. "permitting/regulated" and "compliance heavy"), merge them. Put the IDs of patterns being absorbed in replace_pattern_ids; emit the merged version in new_patterns. Aim for 5–10 clean clusters total.
2. Add any new dislike clusters that emerge from the killed-idea kill_reasons that aren't already covered. Set confidence ≈ the number of source items (killed ideas + replaced patterns) backing each cluster.
3. Write profile_summary: 2–3 sentences capturing what kind of business this founder is going after, in second person ("You prefer…", "You avoid…"). This will be shown at the top of the Insights tab AND fed to the idea-generator prompt, so it should read as a coherent founder profile, not a bullet list.

Phrasing rules for new_patterns:
- Declarative noun-phrases. "Physical inventory or fulfillment-dependent businesses" — not "Avoid physical inventory".
- No leading verbs ("Avoid", "Don't").
- Specific enough to actually filter ideas, vague enough to cover variants.`;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : false;

  if (req.method === "GET" && !isCron) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const triggeredBy = isCron ? "cron" : "ui";
  logEvent("info", "trigger.start", {
    routine: "postmortem",
    triggered_by: triggeredBy,
  });

  const insert = await insertTriggered("postmortem", triggeredBy, null);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("postmortem");
    logEvent("warn", "trigger.conflict", {
      routine: "postmortem",
      triggered_by: triggeredBy,
      conflict_run_id: inFlight?.id ?? null,
    });
    return NextResponse.json(
      {
        error: "conflict",
        conflict: {
          run_id: inFlight?.id ?? null,
          started_at: inFlight?.started_at ?? null,
        },
      },
      { status: 409 },
    );
  }
  if (!insert.ok) {
    return NextResponse.json({ error: insert.error }, { status: 500 });
  }
  const runId = insert.id;
  await markAccepted(runId, null);

  try {
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
      const summary = "No killed ideas and no dislike patterns to analyze.";
      await markCompleted(runId, summary);
      return NextResponse.json({ ok: true, run_id: runId, summary });
    }

    const { object } = await generateObject({
      model: MODEL,
      schema: PostmortemSchema,
      prompt: buildPrompt(killed, dislikes, likes),
    });

    const validReplaceIds = new Set(dislikes.map((d) => d.id));
    const toDelete = object.replace_pattern_ids.filter((id) =>
      validReplaceIds.has(id),
    );

    if (toDelete.length > 0) {
      const { error: delError } = await supabase
        .from("feedback_patterns")
        .delete()
        .in("id", toDelete);
      if (delError) throw new Error(`delete patterns: ${delError.message}`);
    }

    if (object.new_patterns.length > 0) {
      const rows = object.new_patterns.map((p) => ({
        pattern_type: "dislike" as const,
        pattern: p.pattern,
        confidence: p.confidence,
      }));
      const { error: insError } = await supabase
        .from("feedback_patterns")
        .insert(rows);
      if (insError) throw new Error(`insert patterns: ${insError.message}`);
    }

    const { error: profErr } = await supabase
      .from("pipeline_profile")
      .update({
        summary: object.profile_summary,
        generated_at: new Date().toISOString(),
        pattern_count: dislikes.length - toDelete.length + object.new_patterns.length,
        idea_count: killed.length,
      })
      .eq("id", 1);
    if (profErr) throw new Error(`update profile: ${profErr.message}`);

    const summary = `Clustered ${killed.length} killed ideas + ${dislikes.length} existing dislikes into ${object.new_patterns.length} patterns. Replaced ${toDelete.length}. Profile refreshed.`;
    await markCompleted(runId, summary);
    logEvent("info", "postmortem.completed", {
      run_id: runId,
      killed: killed.length,
      replaced: toDelete.length,
      new: object.new_patterns.length,
    });
    return NextResponse.json({
      ok: true,
      run_id: runId,
      summary,
      profile_summary: object.profile_summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markError(runId, message);
    logEvent("error", "postmortem.failed", { run_id: runId, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
