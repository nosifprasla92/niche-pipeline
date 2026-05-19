import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("pipeline_profile")
    .select("summary, generated_at, pattern_count, idea_count")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    profile: data ?? {
      summary: "",
      generated_at: null,
      pattern_count: 0,
      idea_count: 0,
    },
  });
}
