import { NextRequest, NextResponse } from "next/server";
import { supabase, type RoutineRunStatus } from "@/lib/supabase";
import { logEvent } from "@/lib/log";

type Body = {
  status: "completed" | "error";
  summary?: string;
  idea_ids?: number[];
};

// Re-POSTs from network retries land here; if the row already sits in any
// terminal status we return 200 without re-updating. The second POST should
// be indistinguishable from the first.
const TERMINAL_STATUSES: RoutineRunStatus[] = [
  "completed",
  "error",
  "timed_out",
  "cancelled",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "id must be a positive integer" },
      { status: 400 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (body.status !== "completed" && body.status !== "error") {
    return NextResponse.json(
      { error: "status must be 'completed' or 'error'" },
      { status: 400 },
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from("routine_runs")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: `run ${id} not found` }, { status: 404 });
  }

  if (TERMINAL_STATUSES.includes(existing.status)) {
    logEvent("info", "callback.idempotent", {
      run_id: id,
      current_status: existing.status,
    });
    return NextResponse.json({
      ok: true,
      transitioned: false,
      current_status: existing.status,
    });
  }

  const { error: updateError } = await supabase
    .from("routine_runs")
    .update({
      status: body.status,
      finished_at: new Date().toISOString(),
      summary: body.summary ?? null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logEvent("info", "callback.received", {
    run_id: id,
    from: existing.status,
    to: body.status,
    summary_len: body.summary?.length ?? 0,
    idea_count: body.idea_ids?.length ?? 0,
  });

  return NextResponse.json({
    ok: true,
    transitioned: true,
    from: existing.status,
    to: body.status,
  });
}
