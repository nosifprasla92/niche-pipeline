import { NextRequest, NextResponse } from "next/server";
import { checkInFlight } from "@/lib/routine-runs";
import type { RoutineName } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const VALID_ROUTINES: RoutineName[] = ["generator", "researcher", "planner"];

function isRoutineName(s: string | null): s is RoutineName {
  return s !== null && (VALID_ROUTINES as string[]).includes(s);
}

export async function GET(req: NextRequest) {
  const routine = req.nextUrl.searchParams.get("routine");
  if (!isRoutineName(routine)) {
    return NextResponse.json(
      { error: `routine must be one of ${VALID_ROUTINES.join(", ")}` },
      { status: 400 },
    );
  }

  // Safe by invariant: routine_runs_in_flight_idx UNIQUE partial index
  // guarantees at most one in-flight row per routine_name, so this lookup
  // unambiguously resolves the row the trigger endpoint just inserted.
  const run = await checkInFlight(routine);
  if (!run) {
    return NextResponse.json(
      { error: `no in-flight run for routine '${routine}'` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    run_id: run.id,
    routine_name: run.routine_name,
    triggered_by: run.triggered_by,
    started_at: run.started_at,
    idea_context_id: run.idea_context_id,
  });
}
