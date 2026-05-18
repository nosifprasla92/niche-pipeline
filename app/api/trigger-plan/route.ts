import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fireRoutine } from "@/lib/fire-routine";
import {
  checkInFlight,
  insertTriggered,
  markAccepted,
  markFireFailed,
} from "@/lib/routine-runs";

export async function POST(req: NextRequest) {
  const { idea_id } = (await req.json()) as { idea_id: number };
  if (!idea_id) {
    return NextResponse.json({ error: "idea_id required" }, { status: 400 });
  }

  const insert = await insertTriggered("planner", "ui", idea_id);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("planner");
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
    .update({ status: "planning" })
    .eq("id", idea_id);
  if (ideaErr) {
    await markFireFailed(runId, `ideas update: ${ideaErr.message}`);
    return NextResponse.json({ error: ideaErr.message }, { status: 500 });
  }

  const fire = await fireRoutine(
    process.env.PLAN_ROUTINE_ID,
    process.env.PLAN_TRIGGER_TOKEN,
  );
  if (!fire.ok) {
    await markFireFailed(runId, fire.body);
    // Revert to 'researched' (not 'new') so the user can retry from the
    // Researching tab without losing the research output.
    await supabase
      .from("ideas")
      .update({ status: "researched" })
      .eq("id", idea_id);
    return NextResponse.json({ error: fire.body }, { status: fire.status });
  }

  await markAccepted(runId, fire.body);
  return NextResponse.json({ ok: true, run_id: runId });
}
