import { NextRequest, NextResponse } from "next/server";
import { fireRoutine } from "@/lib/fire-routine";
import {
  checkInFlight,
  insertTriggered,
  markAccepted,
  markFireFailed,
} from "@/lib/routine-runs";

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : false;

  if (req.method === "GET" && !isCron) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Same UNIQUE-violation race fix as trigger-research/plan, but for the
  // generator. Prevents cron + manual "Run now" overlap from spawning two
  // generator routines that both try to claim the same /latest row.
  const insert = await insertTriggered(
    "generator",
    isCron ? "cron" : "ui",
    null,
  );
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("generator");
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
    process.env.GENERATOR_ROUTINE_ID,
    process.env.GENERATOR_TRIGGER_TOKEN,
  );
  if (!fire.ok) {
    await markFireFailed(runId, fire.body);
    return NextResponse.json({ error: fire.body }, { status: fire.status });
  }

  await markAccepted(runId, fire.body);
  return NextResponse.json({
    ok: true,
    run_id: runId,
    source: isCron ? "cron" : "ui",
  });
}

export { handler as GET, handler as POST };
