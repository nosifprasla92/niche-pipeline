import {
  supabase,
  type CostPayload,
  type RoutineName,
  type RoutineRun,
} from "../lib/supabase";
import { markAccepted, markCompleted, markError } from "../lib/routine-runs";

export type Claimed = RoutineRun;

/**
 * Pop one 'triggered' row by flipping it to 'accepted'. The UPDATE … WHERE
 * status='triggered' is atomic, so two workers running in parallel can't claim
 * the same row. We don't run two workers today, but the cost of being correct
 * is zero.
 *
 * Oldest-first so a stuck row at the head doesn't starve newer requests once
 * the sweeper clears it.
 */
export async function claimNextTriggered(): Promise<Claimed | null> {
  const { data: candidate, error: pickErr } = await supabase
    .from("routine_runs")
    .select("id")
    .eq("status", "triggered")
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pickErr) {
    console.error("[worker] queue pick failed:", pickErr.message);
    return null;
  }
  if (!candidate) return null;

  // Atomic claim: only succeeds if status is still 'triggered'.
  const { data: claimed, error: claimErr } = await supabase
    .from("routine_runs")
    .update({ status: "accepted" })
    .eq("id", candidate.id)
    .eq("status", "triggered")
    .select("*")
    .maybeSingle();
  if (claimErr) {
    console.error("[worker] queue claim failed:", claimErr.message);
    return null;
  }
  return (claimed as RoutineRun | null) ?? null;
}

export async function complete(
  runId: number,
  summary: string,
  cost: CostPayload | null = null,
): Promise<void> {
  await markCompleted(runId, summary, cost);
}

export async function fail(runId: number, message: string): Promise<void> {
  await markError(runId, message);
}

/**
 * Insert a routine_runs row directly from inside the worker (used by the
 * scheduler for daily generator and weekly postmortem). Skips the conflict
 * dance — we want a hard failure here, not a 409 round-trip.
 */
export async function enqueueFromScheduler(
  routineName: RoutineName,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("routine_runs")
    .insert({
      routine_name: routineName,
      triggered_by: "cron",
      status: "triggered",
      idea_context_id: null,
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = in-flight conflict → there's already a run for this routine.
    // Don't log loudly; the cron tick is just "try to start one if you can."
    if (error.code !== "23505") {
      console.error(
        `[worker] scheduler enqueue ${routineName} failed:`,
        error.message,
      );
    }
    return null;
  }
  return data.id;
}

// Re-export markAccepted so handlers can use it during long-running work to
// signal "I picked this up, started, but haven't finished yet." Today we mark
// accepted at claim time; this is here in case a handler needs to overwrite
// fire_response_body or similar.
export { markAccepted };
