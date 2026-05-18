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

type Body = { run_id?: number; idea_id?: number };

async function resolveRunId(
  body: Body,
): Promise<{ ok: true; run_id: number } | { ok: false; status: number; error: string }> {
  if (body.run_id) {
    return { ok: true, run_id: body.run_id };
  }
  if (!body.idea_id) {
    return { ok: false, status: 400, error: "run_id or idea_id required" };
  }
  const { data, error } = await supabase
    .from("routine_runs")
    .select("id")
    .eq("idea_context_id", body.idea_id)
    .in("status", IN_FLIGHT_STATUSES)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) {
    return {
      ok: false,
      status: 404,
      error: `no in-flight run for idea ${body.idea_id}`,
    };
  }
  return { ok: true, run_id: data.id };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const resolved = await resolveRunId(body);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const runId = resolved.run_id;

  const { data: run, error } = await supabase
    .from("routine_runs")
    .select("id, status, routine_name, idea_context_id")
    .eq("id", runId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json(
      { error: `run ${runId} not found` },
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
        error: `run ${runId} is not in-flight (current status: ${run.status})`,
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
    lookup_by: body.run_id ? "run_id" : "idea_id",
  });

  return NextResponse.json({ ok: true, run_id: run.id });
}
