import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { inspectSpend } from "@/lib/spend-guard";
import { logEvent } from "@/lib/log";

// Read + write the spend brake state.
// - GET: returns each of the three brakes' current state for the dashboard
//   header pill.
// - POST { kill_switch: boolean }: flips the DB kill switch. The env var
//   brake (HALT_ALL_AI) is intentionally NOT writable from here — that one
//   is the "I can't reach Supabase" backstop and must stay flippable only
//   in Vercel env vars.
// Auth: relies on the password proxy that fronts every non-cron route.

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await inspectSpend();
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  let body: { kill_switch?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.kill_switch !== "boolean") {
    return NextResponse.json(
      { error: "kill_switch (boolean) required" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("pipeline_profile")
    .update({ kill_switch: body.kill_switch })
    .eq("id", 1);
  if (error) {
    logEvent("error", "spend_status.update_failed", {
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logEvent("warn", "spend_status.kill_switch_toggled", {
    kill_switch: body.kill_switch,
  });

  const state = await inspectSpend();
  return NextResponse.json(state);
}
