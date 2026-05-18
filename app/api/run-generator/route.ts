import { NextRequest, NextResponse } from "next/server";
import { fireRoutine } from "@/lib/fire-routine";

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : false;

  if (req.method === "GET" && !isCron) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await fireRoutine(
    process.env.GENERATOR_ROUTINE_ID,
    process.env.GENERATOR_TRIGGER_TOKEN,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, source: isCron ? "cron" : "ui" });
}

export { handler as GET, handler as POST };
