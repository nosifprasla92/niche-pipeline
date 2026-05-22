// Load env + assert "no API key set" gate BEFORE importing anything that
// might touch the SDK. Side-effect import.
import "./env";

import { sweepStaleRuns } from "../lib/routine-runs";
import type { HandlerResult, RoutineName, RoutineRun } from "../lib/supabase";
import { claimNextTriggered, complete, fail } from "./queue";
import { tickScheduler } from "./schedule";
import { handleGenerator } from "./handlers/generator";
import { handleResearcher } from "./handlers/researcher";
import { handleValidator } from "./handlers/validator";
import { handlePlanner } from "./handlers/planner";
import { handlePostmortem } from "./handlers/postmortem";

const POLL_MS = 5_000;
// Sweeper every N idle ticks (no work + no scheduler hit). 60 ticks × 5s = 5min.
const SWEEP_EVERY_IDLE_TICKS = 60;

const handlers: Record<
  RoutineName,
  (run: RoutineRun) => Promise<HandlerResult>
> = {
  generator: handleGenerator,
  researcher: handleResearcher,
  validator: handleValidator,
  planner: handlePlanner,
  postmortem: handlePostmortem,
};

const runOnce = process.argv.includes("--once");

let stopping = false;
function requestStop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] received ${signal}, finishing current job then exiting`);
}
process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

async function runOne(run: RoutineRun): Promise<void> {
  const handler = handlers[run.routine_name];
  if (!handler) {
    await fail(run.id, `no handler for routine ${run.routine_name}`);
    return;
  }
  const startedAt = Date.now();
  console.log(`[worker] start ${run.routine_name} run #${run.id}`);
  try {
    const { summary, cost } = await handler(run);
    await complete(run.id, summary, cost);
    const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
    const costNote =
      cost?.cost_usd != null ? ` ($${cost.cost_usd.toFixed(4)})` : "";
    console.log(
      `[worker] done ${run.routine_name} run #${run.id} in ${dur}s${costNote} — ${summary}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await fail(run.id, msg);
    console.error(`[worker] failed ${run.routine_name} run #${run.id}: ${msg}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(
    `[worker] started (poll=${POLL_MS}ms, once=${runOnce})`,
  );

  let idleTicks = 0;

  while (!stopping) {
    let didWork = false;
    try {
      const run = await claimNextTriggered();
      if (run) {
        didWork = true;
        await runOne(run);
      }
    } catch (err) {
      console.error("[worker] claim/dispatch error:", err);
    }

    if (runOnce && didWork) {
      console.log("[worker] --once: job processed, exiting");
      return;
    }

    if (!didWork) {
      idleTicks++;
      try {
        await tickScheduler();
      } catch (err) {
        console.error("[worker] scheduler tick error:", err);
      }

      if (idleTicks >= SWEEP_EVERY_IDLE_TICKS) {
        idleTicks = 0;
        try {
          const sweep = await sweepStaleRuns();
          if (sweep.ok && sweep.swept.length > 0) {
            console.log(
              `[worker] swept ${sweep.swept.length} stale runs:`,
              sweep.swept.map((s) => `#${s.id}(${s.routine_name})`).join(", "),
            );
          }
        } catch (err) {
          console.error("[worker] sweep error:", err);
        }
      }

      await sleep(POLL_MS);
    } else {
      // Reset idle counter on work — and check immediately for more queued work.
      idleTicks = 0;
    }
  }

  console.log("[worker] stopped");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
