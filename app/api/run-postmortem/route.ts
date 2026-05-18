import { NextRequest, NextResponse } from "next/server";
import { fireRoutine } from "@/lib/fire-routine";
import {
  checkInFlight,
  insertTriggered,
  markAccepted,
  markFireFailed,
} from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : false;

  if (req.method === "GET" && !isCron) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const triggeredBy = isCron ? "cron" : "ui";
  logEvent("info", "trigger.start", {
    routine: "postmortem",
    triggered_by: triggeredBy,
  });

  const insert = await insertTriggered("postmortem", triggeredBy, null);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("postmortem");
    logEvent("warn", "trigger.conflict", {
      routine: "postmortem",
      triggered_by: triggeredBy,
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
  const runId = insert.id;

  const fire = await fireRoutine(
    process.env.POSTMORTEM_ROUTINE_ID,
    process.env.POSTMORTEM_TRIGGER_TOKEN,
  );
  if (!fire.ok) {
    await markFireFailed(runId, fire.body);
    logEvent("error", "trigger.fire_failed", {
      run_id: runId,
      routine: "postmortem",
      status: fire.status,
    });
    return NextResponse.json({ error: fire.body }, { status: fire.status });
  }

  await markAccepted(runId, fire.body);
  logEvent("info", "trigger.accepted", {
    run_id: runId,
    routine: "postmortem",
    triggered_by: triggeredBy,
  });
  return NextResponse.json({
    ok: true,
    run_id: runId,
    source: triggeredBy,
  });
}

export { handler as GET, handler as POST };
