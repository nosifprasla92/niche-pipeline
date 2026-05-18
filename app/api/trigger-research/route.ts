import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fireRoutine } from "@/lib/fire-routine";
import {
  checkInFlight,
  insertTriggered,
  markAccepted,
  markFireFailed,
} from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

export async function POST(req: NextRequest) {
  const { idea_id } = (await req.json()) as { idea_id: number };
  if (!idea_id) {
    return NextResponse.json({ error: "idea_id required" }, { status: 400 });
  }

  logEvent("info", "trigger.start", {
    routine: "researcher",
    triggered_by: "ui",
    idea_id,
  });

  // Step 1: claim the in-flight slot via INSERT. UNIQUE-violation on
  // routine_runs_in_flight_idx means another pursuit is already running.
  const insert = await insertTriggered("researcher", "ui", idea_id);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("researcher");
    logEvent("warn", "trigger.conflict", {
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

  // Step 2: flip the idea into 'pursuing' so the Researching tab picks it up
  // (and so older routine prompts that still target by status keep working
  // during the T14 prompt-update window).
  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({ status: "pursuing" })
    .eq("id", idea_id);
  if (ideaErr) {
    await markFireFailed(runId, `ideas update: ${ideaErr.message}`);
    return NextResponse.json({ error: ideaErr.message }, { status: 500 });
  }

  // Step 3: fire the routine; on failure, revert the idea status so the user
  // can retry from the inbox without manual cleanup.
  const fire = await fireRoutine(
    process.env.DEEP_RESEARCH_ROUTINE_ID,
    process.env.DEEP_RESEARCH_TRIGGER_TOKEN,
  );
  if (!fire.ok) {
    await markFireFailed(runId, fire.body);
    await supabase.from("ideas").update({ status: "new" }).eq("id", idea_id);
    logEvent("error", "trigger.fire_failed", {
      run_id: runId,
      routine: "researcher",
      idea_id,
      status: fire.status,
    });
    return NextResponse.json({ error: fire.body }, { status: fire.status });
  }

  await markAccepted(runId, fire.body);
  logEvent("info", "trigger.accepted", {
    run_id: runId,
    routine: "researcher",
    idea_id,
  });
  return NextResponse.json({ ok: true, run_id: runId });
}
