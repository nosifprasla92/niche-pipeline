import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("limit");
  const parsed = raw ? Number(raw) : NaN;
  const limit =
    Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_LIMIT
      ? Math.floor(parsed)
      : DEFAULT_LIMIT;

  const { data, error } = await supabase
    .from("feedback_patterns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ patterns: data });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { pattern_type: "like" | "dislike"; pattern: string };
  if (!body.pattern || !body.pattern_type) {
    return NextResponse.json({ error: "pattern + pattern_type required" }, { status: 400 });
  }
  const { error } = await supabase.from("feedback_patterns").insert(body);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("feedback_patterns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
