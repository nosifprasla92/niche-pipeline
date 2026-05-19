import {
  supabase,
  type RoutineName,
  type RoutineRun,
  type RoutineRunStatus,
  type TriggeredBy,
} from "./supabase";
import { logEvent } from "./log";

const IN_FLIGHT_STATUSES: RoutineRunStatus[] = ["triggered", "accepted"];

export const ROUTINE_TIMEOUT_MINUTES = 30;

export type InsertResult =
  | { ok: true; id: number }
  | { ok: false; conflict: true }
  | { ok: false; error: string };

type SweptRow = { id: number; routine_name: RoutineName; started_at: string };

export type SweepResult =
  | { ok: true; swept: SweptRow[] }
  | { ok: false; error: string };

/**
 * Update any 'accepted' rows older than ROUTINE_TIMEOUT_MINUTES to 'timed_out'.
 * Used by both the scheduled sweeper endpoint and lazy auto-sweep in
 * insertTriggered (so stale rows don't block triggers between cron sweeps).
 */
export async function sweepStaleRuns(): Promise<SweepResult> {
  const cutoff = new Date(
    Date.now() - ROUTINE_TIMEOUT_MINUTES * 60_000,
  ).toISOString();
  const { data, error } = await supabase
    .from("routine_runs")
    .update({ status: "timed_out", finished_at: new Date().toISOString() })
    .eq("status", "accepted")
    .lt("started_at", cutoff)
    .select("id, routine_name, started_at");
  if (error) return { ok: false, error: error.message };
  return { ok: true, swept: (data ?? []) as SweptRow[] };
}

/**
 * INSERT a new routine_runs row with status='triggered'.
 *
 * Concurrent inserts collide on routine_runs_in_flight_idx (UNIQUE partial)
 * → Postgres raises 23505 unique_violation → we return {conflict: true}.
 * Callers translate this into a 409 response using checkInFlight() to look
 * up the in-flight row's details.
 */
export async function insertTriggered(
  routineName: RoutineName,
  triggeredBy: TriggeredBy,
  ideaContextId: number | null,
): Promise<InsertResult> {
  // Lazy auto-sweep: the cron sweeper only runs daily, so stale 'accepted'
  // rows can block triggers for hours in between. Sweep before claiming the
  // in-flight slot so we don't 409 on a row that's already past its timeout.
  const sweep = await sweepStaleRuns();
  if (sweep.ok && sweep.swept.length > 0) {
    logEvent("warn", "sweep.before_trigger", {
      routine: routineName,
      triggered_by: triggeredBy,
      count: sweep.swept.length,
      runs: sweep.swept.map((s) => ({
        run_id: s.id,
        routine: s.routine_name,
        started_at: s.started_at,
      })),
    });
  } else if (!sweep.ok) {
    logEvent("error", "sweep.before_trigger.failed", {
      routine: routineName,
      message: sweep.error,
    });
  }

  const { data, error } = await supabase
    .from("routine_runs")
    .insert({
      routine_name: routineName,
      triggered_by: triggeredBy,
      status: "triggered",
      idea_context_id: ideaContextId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, conflict: true };
    }
    console.error(
      `[routine-runs] insertTriggered(${routineName}) failed:`,
      error.message,
    );
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}

export async function markAccepted(
  id: number,
  fireResponseBody: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from("routine_runs")
    .update({ status: "accepted", fire_response_body: fireResponseBody })
    .eq("id", id);
  if (error) {
    console.error(`[routine-runs] markAccepted(${id}) failed:`, error.message);
  }
}

export async function markFireFailed(
  id: number,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("routine_runs")
    .update({
      status: "fire_failed",
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error(
      `[routine-runs] markFireFailed(${id}) failed:`,
      error.message,
    );
  }
}

export async function markCancelled(id: number): Promise<void> {
  const { error } = await supabase
    .from("routine_runs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error(`[routine-runs] markCancelled(${id}) failed:`, error.message);
  }
}

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
