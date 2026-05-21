import { NextRequest, NextResponse } from "next/server";
import { checkInFlight, insertTriggered } from "@/lib/routine-runs";
import { logEvent } from "@/lib/log";

// Enqueue-only. Local worker runs the post-mortem via Claude Max.

export async function POST(_req: NextRequest) {
  logEvent("info", "enqueue.start", {
    routine: "postmortem",
    triggered_by: "ui",
  });

  const insert = await insertTriggered("postmortem", "ui", null);
  if (!insert.ok && "conflict" in insert) {
    const inFlight = await checkInFlight("postmortem");
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

  return NextResponse.json({ ok: true, run_id: insert.id });
}
