import { NextRequest, NextResponse } from "next/server";
import { ROUTINE_TIMEOUT_MINUTES, sweepStaleRuns } from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

// This endpoint is the unblock mechanism for the UNIQUE in-flight invariant
// in routine_runs_in_flight_idx. If a callback ever fails to arrive (Vercel
// timeout, prompt drift, routine crash), the in-flight row would block ALL
// future triggers for that routine forever. The sweeper recovers
// automatically.
//
// insertTriggered also runs the same sweep inline before claiming a slot,
// so triggers self-heal between cron sweeps.
//
// Auth: Bearer CRON_SECRET via proxy.ts (Vercel Cron sends this header).
// Schedule: see vercel.json — currently daily, tighten to */15 on Pro.

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : false;

  if (req.method === "GET" && !isCron) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date(
    Date.now() - ROUTINE_TIMEOUT_MINUTES * 60_000,
  ).toISOString();
  const result = await sweepStaleRuns();

  if (!result.ok) {
    logEvent("error", "sweep.failed", { message: result.error });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  if (result.swept.length > 0) {
    logEvent("warn", "sweep.timed_out", {
      count: result.swept.length,
      runs: result.swept.map((r) => ({
        run_id: r.id,
        routine: r.routine_name,
        started_at: r.started_at,
      })),
    });
  } else {
    logEvent("info", "sweep.clean", { source: isCron ? "cron" : "ui" });
  }

  return NextResponse.json({
    ok: true,
    swept: result.swept.length,
    cutoff,
    source: isCron ? "cron" : "ui",
  });
}

export { handler as GET, handler as POST };
