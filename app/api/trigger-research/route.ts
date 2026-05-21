import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  checkInFlight,
  insertTriggered,
  markError,
} from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

// Enqueue-only. Local worker handles the actual research via Claude Max.

export async function POST(req: NextRequest) {
  const { idea_id } = (await req.json()) as { idea_id: number };
  if (!idea_id) {
    return NextResponse.json({ error: "idea_id required" }, { status: 400 });
  }

  logEvent("info", "enqueue.start", {
    routine: "researcher",
    triggered_by: "ui",
    idea_id,
  });

  const insert = await insertTriggered("researcher", "ui", idea_id);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("researcher");
    logEvent("warn", "enqueue.conflict", {
      routine: "researcher",
      idea_id,
      conflict_run_id: inFlight?.id ?? null,
      conflict_idea_id: inFlight?.idea_context_id ?? null,
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

  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({ status: "pursuing" })
    .eq("id", idea_id);
  if (ideaErr) {
    await markError(runId, `ideas update: ${ideaErr.message}`);
    return NextResponse.json({ error: ideaErr.message }, { status: 500 });
  }

  logEvent("info", "enqueue.queued", {
    run_id: runId,
    routine: "researcher",
    idea_id,
  });
  return NextResponse.json({ ok: true, run_id: runId });
}
