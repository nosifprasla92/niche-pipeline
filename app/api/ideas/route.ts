import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const statuses = status ? status.split(",") : null;

  let q = supabase.from("ideas").select("*").order("updated_at", { ascending: false });
  if (statuses) q = q.in("status", statuses);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ideas: data });
}
