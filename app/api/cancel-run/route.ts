import { NextRequest, NextResponse } from "next/server";
import { supabase, type RoutineName } from "@/lib/supabase";
import { markCancelled } from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

const IN_FLIGHT_STATUSES = ["triggered", "accepted"] as const;

// When a researcher run is cancelled, revert the linked idea to 'new' so
// the user can re-pursue it. When a planner run is cancelled, revert to
// 'researched' so the research output isn't lost. Generator runs have no
// idea to revert.
function revertStatusFor(routine: RoutineName): "new" | "researched" | null {
  switch (routine) {
    case "researcher":
      return "new";
    case "planner":
      return "researched";
    case "generator":
      return null;
  }
}

export async function POST(req: NextRequest) {
  const { run_id } = (await req.json()) as { run_id: number };
  if (!run_id) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }

  const { data: run, error } = await supabase
    .from("routine_runs")
    .select("id, status, routine_name, idea_context_id")
    .eq("id", run_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json(
      { error: `run ${run_id} not found` },
      { status: 404 },
    );
  }

  // Idempotent: re-cancelling an already-cancelled run is a no-op
  if (run.status === "cancelled") {
    return NextResponse.json({ ok: true, already_cancelled: true });
  }

  if (!IN_FLIGHT_STATUSES.includes(run.status)) {
    return NextResponse.json(
      {
        error: `run ${run_id} is not in-flight (current status: ${run.status})`,
      },
      { status: 400 },
    );
  }

  if (run.idea_context_id != null) {
    const revertTo = revertStatusFor(run.routine_name);
    if (revertTo) {
      const { error: ideaErr } = await supabase
        .from("ideas")
        .update({ status: revertTo })
        .eq("id", run.idea_context_id);
      if (ideaErr) {
        return NextResponse.json({ error: ideaErr.message }, { status: 500 });
      }
    }
  }

  await markCancelled(run.id);
  logEvent("info", "cancel-run.success", {
    run_id: run.id,
    routine: run.routine_name,
    idea_context_id: run.idea_context_id,
  });

  return NextResponse.json({ ok: true });
}
