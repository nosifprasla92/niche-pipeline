import { NextRequest, NextResponse } from "next/server";
import { supabase, type FeedbackPattern, type Idea } from "@/lib/supabase";
import {
  checkInFlight,
  insertTriggered,
  markAccepted,
  markCompleted,
  markError,
} from "@/lib/routine-runs";
import { runLocalResearch } from "@/lib/research-engine";
import { logEvent } from "@/lib/log";

// Parallel route to /api/trigger-research. Same routine_name ("researcher")
// so the in-flight UNIQUE index prevents running both Cloud and local at
// once. Pick the one you want to use from the UI; the other stays available
// for fallback or A/B comparison.

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { idea_id } = (await req.json()) as { idea_id: number };
  if (!idea_id) {
    return NextResponse.json({ error: "idea_id required" }, { status: 400 });
  }

  logEvent("info", "trigger.start", {
    routine: "researcher",
    engine: "local",
    triggered_by: "ui",
    idea_id,
  });

  const insert = await insertTriggered("researcher", "ui", idea_id);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("researcher");
    logEvent("warn", "trigger.conflict", {
      routine: "researcher",
      engine: "local",
      idea_id,
      conflict_run_id: inFlight?.id ?? null,
    });
    return NextResponse.json(
      {
        error: "conflict",
        conflict: {
          run_id: inFlight?.id ?? null,
          idea_context_id: inFlight?.idea_context_id ?? null,
          idea_title: inFlight?.idea_title ?? null,
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

  const { error: pursuingErr } = await supabase
    .from("ideas")
    .update({ status: "pursuing" })
    .eq("id", idea_id);
  if (pursuingErr) {
    await markError(runId, `ideas update (pursuing): ${pursuingErr.message}`);
    return NextResponse.json({ error: pursuingErr.message }, { status: 500 });
  }

  try {
    const [ideaRes, patternsRes] = await Promise.all([
      supabase.from("ideas").select("*").eq("id", idea_id).single(),
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

    const out = await runLocalResearch(idea, dislikes);

    const nowIso = new Date().toISOString();
    if (out.auto_kill.kill) {
      const { error: killErr } = await supabase
        .from("ideas")
        .update({
          status: "killed",
          kill_reason: out.auto_kill.reason || "auto-killed by local research",
          killed_at: nowIso,
          competitors_above_50: out.competitors_above_50,
          competitor_complaints: out.competitor_complaints,
          competition_analysis: out.competition_analysis,
          effort_weeks: out.effort_weeks,
          effort_breakdown: out.effort_breakdown,
          zero_paid_path: out.zero_paid_path,
          researched_at: nowIso,
        })
        .eq("id", idea_id);
      if (killErr) throw new Error(`update idea (kill): ${killErr.message}`);

      const summary = `Local research #${idea_id} → killed: ${out.auto_kill.reason}`;
      await markCompleted(runId, summary);
      logEvent("info", "research.local.killed", {
        run_id: runId,
        idea_id,
        reason: out.auto_kill.reason,
      });
      return NextResponse.json({ ok: true, run_id: runId, killed: true, summary });
    }

    const { error: updErr } = await supabase
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
      .eq("id", idea_id);
    if (updErr) throw new Error(`update idea: ${updErr.message}`);

    const summary = `Local research #${idea_id}: competitors_above_50=${out.competitors_above_50}, effort=${out.effort_weeks}w`;
    await markCompleted(runId, summary);
    logEvent("info", "research.local.completed", {
      run_id: runId,
      idea_id,
      competitors_above_50: out.competitors_above_50,
      effort_weeks: out.effort_weeks,
    });
    return NextResponse.json({ ok: true, run_id: runId, killed: false, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markError(runId, message);
    await supabase.from("ideas").update({ status: "new" }).eq("id", idea_id);
    logEvent("error", "research.local.failed", {
      run_id: runId,
      idea_id,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
