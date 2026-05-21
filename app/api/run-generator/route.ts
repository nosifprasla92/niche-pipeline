import { NextRequest, NextResponse } from "next/server";
import {
  checkInFlight,
  insertTriggered,
} from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

// Enqueue-only. The Vercel-Cron→Anthropic-API fire path is gone; the local
// worker (worker/index.ts) polls routine_runs and runs the generator via the
// user's Max OAuth session. Daily scheduling moved to worker/schedule.ts.

export async function POST(_req: NextRequest) {
  logEvent("info", "enqueue.start", {
    routine: "generator",
    triggered_by: "ui",
  });

  const insert = await insertTriggered("generator", "ui", null);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("generator");
    logEvent("warn", "enqueue.conflict", {
      routine: "generator",
      conflict_run_id: inFlight?.id ?? null,
    });
    return NextResponse.json(
      {
        error: "conflict",
        conflict: {
          run_id: inFlight?.id ?? null,
          started_at: inFlight?.started_at ?? null,
        },
      },
      { status: 409 },
    );
  }
  if (!insert.ok) {
    return NextResponse.json({ error: insert.error }, { status: 500 });
  }

  logEvent("info", "enqueue.queued", {
    run_id: insert.id,
    routine: "generator",
  });
  return NextResponse.json({ ok: true, run_id: insert.id, source: "ui" });
}
