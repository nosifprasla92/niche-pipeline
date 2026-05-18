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
    .from("routine_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data });
}
