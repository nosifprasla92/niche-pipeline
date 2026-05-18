import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fireRoutine } from "@/lib/fire-routine";

export async function POST(req: NextRequest) {
  const { idea_id } = (await req.json()) as { idea_id: number };
  if (!idea_id) return NextResponse.json({ error: "idea_id required" }, { status: 400 });

  const { error } = await supabase
    .from("ideas")
    .update({ status: "pursuing" })
    .eq("id", idea_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = await fireRoutine(
    process.env.DEEP_RESEARCH_ROUTINE_ID,
    process.env.DEEP_RESEARCH_TRIGGER_TOKEN,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
