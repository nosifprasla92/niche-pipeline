import {
  supabase,
  type RoutineName,
  type RoutineRun,
  type RoutineRunStatus,
} from "./supabase";

const IN_FLIGHT_STATUSES: RoutineRunStatus[] = ["triggered", "accepted"];

/**
 * Returns the unique in-flight run for a routine (or null).
 *
 * Invariant: routine_runs_in_flight_idx (UNIQUE partial index) guarantees
 * at most one row matches per routine_name, so a single row result is
 * structurally safe — no aggregation or ordering needed.
 *
 * When the row links to an idea (researcher/planner triggers set
 * idea_context_id), we also resolve the idea title so the 409 toast can
 * show the user which idea is blocking the new request.
 */
export async function checkInFlight(
  routineName: RoutineName,
): Promise<(RoutineRun & { idea_title: string | null }) | null> {
  const { data: run, error } = await supabase
    .from("routine_runs")
    .select("*")
    .eq("routine_name", routineName)
    .in("status", IN_FLIGHT_STATUSES)
    .maybeSingle();

  if (error) {
    console.error(
      `[routine-runs] checkInFlight(${routineName}) failed:`,
      error.message,
    );
    return null;
  }
  if (!run) return null;

  let idea_title: string | null = null;
  if (run.idea_context_id != null) {
    const { data: idea } = await supabase
      .from("ideas")
      .select("title")
      .eq("id", run.idea_context_id)
      .maybeSingle();
    idea_title = idea?.title ?? null;
  }

  return { ...(run as RoutineRun), idea_title };
}
