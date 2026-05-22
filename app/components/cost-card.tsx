"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type CostResponse = {
  saved_usd: number;
  run_count: number;
  since: string;
};

// Header card: "Saved $X.YZ today on Max plan" — sums routine_runs.cost_usd
// over the last 24h. Cost values are what these runs would have cost on the
// Anthropic API; we paid via Max plan instead, so the sum IS the savings.
//
// Typography per DESIGN.md (D4 from plan-design-review 2026-05-21):
// - "Saved " / " today on Max plan"  → DM Sans body, --muted
// - "$X.YZ"                          → Instrument Serif text-xl, --accent
//
// This is a deliberate exception to "numeric = mono" — the dollar amount is
// editorial display, not routine metadata. See DESIGN.md decisions log.
export function CostCard() {
  const { data } = useSWR<CostResponse>("/api/cost-today", fetcher, {
    refreshInterval: 60_000,
  });

  if (!data || data.run_count === 0) return null;

  return (
    <div
      className="font-sans text-sm text-muted leading-tight"
      title={`${data.run_count} runs in the last 24h`}
    >
      Saved{" "}
      <span className="font-display text-xl text-accent align-baseline">
        ${data.saved_usd.toFixed(2)}
      </span>{" "}
      today on Max plan
    </div>
  );
}
