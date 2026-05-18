import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, patch, feedback } = body as {
    id: number;
    patch?: Record<string, unknown>;
    feedback?: { pattern_type: "like" | "dislike"; pattern: string };
  };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (patch && Object.keys(patch).length > 0) {
    const { error } = await supabase.from("ideas").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (feedback?.pattern) {
    const { error } = await supabase.from("feedback_patterns").insert({
      pattern_type: feedback.pattern_type,
      pattern: feedback.pattern,
      source_idea_id: id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
