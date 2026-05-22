import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/cost-today
// Sums routine_runs.cost_usd over the last 24h. Used by the header cost card
// to show "Saved $X today on Max plan" — the cost values were paid by the
// Max plan instead of Anthropic API, so the sum IS the daily savings.
//
// Server-side aggregation (vs client-side over a 50-row /api/routine-runs
// payload) keeps the response tiny and the per-row cost values off the wire
// when the dashboard polls every 30s.
export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("routine_runs")
    .select("cost_usd")
    .gte("started_at", since)
    .not("cost_usd", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let totalUsd = 0;
  let runCount = 0;
  for (const row of data ?? []) {
    const c = (row as { cost_usd: number | null }).cost_usd;
    if (typeof c === "number" && Number.isFinite(c)) {
      totalUsd += c;
      runCount += 1;
    }
  }

  return NextResponse.json({
    saved_usd: Number(totalUsd.toFixed(4)),
    run_count: runCount,
    since,
  });
}
