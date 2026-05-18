import { NextResponse } from "next/server";
import { fireRoutine } from "@/lib/fire-routine";

export async function POST() {
  const result = await fireRoutine(
    process.env.GENERATOR_ROUTINE_ID,
    process.env.GENERATOR_TRIGGER_TOKEN,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
