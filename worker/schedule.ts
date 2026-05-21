import { checkSpendAllowed } from "../lib/spend-guard";
import { enqueueFromScheduler } from "./queue";

// In-process cron, replacing the Vercel Cron `/api/run-generator` daily fire
// and the weekly postmortem fire. Both used to be enqueued by Vercel hitting
// an API route; now they're enqueued directly into routine_runs by the
// worker, which then picks them up on its next poll.
//
// We tick once per worker poll and check whether the current minute falls in
// any schedule's 5-minute trigger window. The window matters because we poll
// every 5s, so the check fires ~60 times per minute — we use lastFired to
// dedupe.

type Schedule = {
  routine: "generator" | "postmortem";
  hourUtc: number;
  minuteUtc: number;
  /** 0=Sun, 1=Mon, …, 6=Sat. Undefined means daily. */
  dayOfWeekUtc?: number;
};

const WINDOW_MIN = 5;

const SCHEDULES: Schedule[] = [
  // Daily generator at 04:00 UTC = 8 AM Mahe (user's local "morning idea drop").
  { routine: "generator", hourUtc: 4, minuteUtc: 0 },
  // Weekly post-mortem Monday 05:00 UTC.
  { routine: "postmortem", hourUtc: 5, minuteUtc: 0, dayOfWeekUtc: 1 },
];

// Per-routine YYYY-MM-DD of last fire. Cleared on restart; the
// routine_runs_in_flight_idx UNIQUE index is the durable dedupe, this map is
// just a hot-path skip so we don't hit Postgres 60x/minute.
const lastFired = new Map<string, string>();

export async function tickScheduler(): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  for (const s of SCHEDULES) {
    if (s.dayOfWeekUtc != null && now.getUTCDay() !== s.dayOfWeekUtc) continue;
    if (now.getUTCHours() !== s.hourUtc) continue;

    const mins = now.getUTCMinutes();
    if (mins < s.minuteUtc || mins >= s.minuteUtc + WINDOW_MIN) continue;

    if (lastFired.get(s.routine) === today) continue;

    // Honor the same 3-brake spend guard the trigger routes use, so flipping
    // HALT_ALL_AI=1 or pipeline_profile.kill_switch=true actually stops the
    // daily generator + weekly postmortem from firing. countAgainstDailyCap
    // is true (default) — scheduled fires count toward the daily cap.
    const guard = await checkSpendAllowed();
    if (!guard.ok) {
      console.log(
        `[scheduler] ${s.routine} blocked by spend guard (${guard.reason}: ${guard.detail}) — will retry next ${today === lastFired.get(s.routine) ? "day" : "window"}`,
      );
      // Mark fired so we don't re-check every 5s within the trigger window.
      // The check re-runs tomorrow when the window opens again.
      lastFired.set(s.routine, today);
      continue;
    }

    const id = await enqueueFromScheduler(s.routine);
    // Mark fired regardless of insert outcome — a 23505 conflict means there's
    // already an in-flight run, and we don't want to spam attempts every poll.
    lastFired.set(s.routine, today);

    if (id) {
      console.log(
        `[scheduler] enqueued ${s.routine} run #${id} at ${now.toISOString()}`,
      );
    } else {
      console.log(
        `[scheduler] ${s.routine} already in flight — skipped enqueue`,
      );
    }
  }
}
