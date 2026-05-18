import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/log";

// Promote routine_runs rows that have been 'accepted' for longer than this
// many minutes to 'timed_out'. The threshold is intentionally generous so
// long-running deep-research runs aren't reaped prematurely.
const TIMEOUT_MINUTES = 30;

// This endpoint is the unblock mechanism for the UNIQUE in-flight invariant
// in routine_runs_in_flight_idx. If a callback ever fails to arrive (Vercel
// timeout, prompt drift, routine crash), the in-flight row would block ALL
// future triggers for that routine forever. The sweeper recovers
// automatically.
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

  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from("routine_runs")
    .update({ status: "timed_out", finished_at: new Date().toISOString() })
    .eq("status", "accepted")
    .lt("started_at", cutoff)
    .select("id, routine_name, started_at");

  if (error) {
    logEvent("error", "sweep.failed", { message: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const swept = data ?? [];
  if (swept.length > 0) {
    logEvent("warn", "sweep.timed_out", {
      count: swept.length,
      runs: swept.map((r) => ({
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
    swept: swept.length,
    cutoff,
    source: isCron ? "cron" : "ui",
  });
}

export { handler as GET, handler as POST };
