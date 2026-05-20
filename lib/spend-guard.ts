import { supabase } from "./supabase";
import { logEvent } from "./log";

// Three independent brakes on anything that costs Anthropic / AI Gateway $.
// Belt-and-suspenders by design: env var works without DB, DB switch survives
// redeploys, counter catches runaway loops.
//
// Brake 1 — HALT_ALL_AI=1 env var. Flip in Vercel project settings; takes
//   effect on the next cold start, no DB roundtrip. Use when you don't have
//   Supabase access or want the fastest possible stop.
// Brake 2 — pipeline_profile.kill_switch=true. Flip in Supabase or via the
//   dashboard header. Persistent across deploys; shared across all instances.
// Brake 3 — Daily routine_runs count vs AI_DAILY_CALL_LIMIT (default 50).
//   Catches a runaway loop that escapes the in-flight unique index. Counts
//   rows started today UTC. Only covers paths that insert into routine_runs
//   (all Cloud routines + post-mortem); ingest-source isn't tracked there
//   and so isn't capped by this brake — its callers should opt out via
//   { countAgainstDailyCap: false }.

export const DEFAULT_DAILY_CAP = 50;

export type SpendCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "halt_env" | "kill_switch" | "daily_cap";
      detail: string;
    };

export type SpendInspection = {
  blocked: boolean;
  halt_env: boolean;
  kill_switch: boolean;
  daily: {
    count: number | null; // null on read failure
    cap: number;
    blocked: boolean;
  };
};

function dailyCap(): number {
  const raw = process.env.AI_DAILY_CALL_LIMIT;
  if (raw == null) return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

/**
 * Full read of every brake's current state. Used by /api/spend-status to
 * render the dashboard toggle. checkSpendAllowed() is a short-circuit version
 * of this same logic and should stay consistent.
 */
export async function inspectSpend(): Promise<SpendInspection> {
  const halt_env = process.env.HALT_ALL_AI === "1";

  const { data: profile, error: profileError } = await supabase
    .from("pipeline_profile")
    .select("kill_switch")
    .eq("id", 1)
    .single();
  if (profileError) {
    logEvent("warn", "spend_guard.profile_read_failed", {
      message: profileError.message,
    });
  }
  const kill_switch = profile?.kill_switch === true;

  const cap = dailyCap();
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await supabase
    .from("routine_runs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", startOfDayUtc.toISOString());
  if (countError) {
    logEvent("warn", "spend_guard.count_failed", {
      message: countError.message,
    });
  }
  const dailyCount = countError ? null : count ?? 0;
  const daily_blocked = dailyCount != null && dailyCount >= cap;

  return {
    blocked: halt_env || kill_switch || daily_blocked,
    halt_env,
    kill_switch,
    daily: { count: dailyCount, cap, blocked: daily_blocked },
  };
}

export async function checkSpendAllowed(opts?: {
  countAgainstDailyCap?: boolean;
}): Promise<SpendCheckResult> {
  if (process.env.HALT_ALL_AI === "1") {
    logEvent("warn", "spend_guard.blocked", {
      reason: "halt_env",
    });
    return { ok: false, reason: "halt_env", detail: "HALT_ALL_AI=1" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("pipeline_profile")
    .select("kill_switch")
    .eq("id", 1)
    .single();
  if (profileError) {
    logEvent("warn", "spend_guard.profile_read_failed", {
      message: profileError.message,
    });
    // Fail open on a profile read miss — the env var brake still applies, and
    // a transient Supabase blip shouldn't lock the whole pipeline.
  } else if (profile?.kill_switch === true) {
    logEvent("warn", "spend_guard.blocked", { reason: "kill_switch" });
    return {
      ok: false,
      reason: "kill_switch",
      detail: "pipeline_profile.kill_switch=true",
    };
  }

  if (opts?.countAgainstDailyCap !== false) {
    const cap = dailyCap();
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from("routine_runs")
      .select("id", { count: "exact", head: true })
      .gte("started_at", startOfDayUtc.toISOString());
    if (error) {
      logEvent("warn", "spend_guard.count_failed", {
        message: error.message,
      });
      // Fail open on counter read failure for the same reason as above.
    } else if ((count ?? 0) >= cap) {
      logEvent("warn", "spend_guard.blocked", {
        reason: "daily_cap",
        count,
        cap,
      });
      return {
        ok: false,
        reason: "daily_cap",
        detail: `today's routine_runs count ${count}/${cap}`,
      };
    }
  }

  return { ok: true };
}
