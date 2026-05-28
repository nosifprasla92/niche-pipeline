import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ideaId = Number(id);
  if (!Number.isFinite(ideaId) || ideaId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("idea_questions")
    .select("id, idea_id, question, answer, model, thinking_tokens, input_tokens, output_tokens, created_at")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ questions: data ?? [] });
}
