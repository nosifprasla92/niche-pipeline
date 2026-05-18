import { NextResponse } from "next/server";

export async function POST() {
  const url = process.env.GENERATOR_TRIGGER_URL;
  if (!url) {
    return NextResponse.json(
      { error: "GENERATOR_TRIGGER_URL not configured. Add an API trigger to Routine 1." },
      { status: 400 },
    );
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!r.ok) {
    return NextResponse.json({ error: await r.text() }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
