import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { idea_id } = (await req.json()) as { idea_id: number };
  if (!idea_id) return NextResponse.json({ error: "idea_id required" }, { status: 400 });

  const { error } = await supabase
    .from("ideas")
    .update({ status: "pursuing" })
    .eq("id", idea_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = process.env.DEEP_RESEARCH_TRIGGER_URL;
  if (!url) {
    return NextResponse.json({ ok: true, warning: "DEEP_RESEARCH_TRIGGER_URL not set" });
  }

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea_id }),
  });
  if (!r.ok) {
    const text = await r.text();
    return NextResponse.json({ error: `Trigger failed: ${text}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
