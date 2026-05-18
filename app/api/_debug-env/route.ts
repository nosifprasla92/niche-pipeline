import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "DEEP_RESEARCH_ROUTINE_ID",
  "DEEP_RESEARCH_TRIGGER_TOKEN",
  "PLAN_ROUTINE_ID",
  "PLAN_TRIGGER_TOKEN",
  "GENERATOR_ROUTINE_ID",
  "GENERATOR_TRIGGER_TOKEN",
  "VALIDATE_ROUTINE_ID",
  "VALIDATE_TRIGGER_TOKEN",
  "POSTMORTEM_ROUTINE_ID",
  "POSTMORTEM_TRIGGER_TOKEN",
  "DASHBOARD_PASSWORD",
  "CRON_SECRET",
] as const;

// Temporary: reveals presence + length of each expected env var so we can
// tell whether Vercel is missing keys, has trailing whitespace from a paste,
// or has the variable scoped to the wrong environment. Authenticated by
// proxy.ts password gate. DELETE this file after debugging.
export async function GET() {
  const out: Record<string, { present: boolean; len: number; trimmedLen: number; preview: string }> = {};
  for (const k of KEYS) {
    const v = process.env[k];
    out[k] = {
      present: typeof v === "string",
      len: v?.length ?? 0,
      trimmedLen: v?.trim().length ?? 0,
      preview: v ? v.slice(0, 4) + "…" + v.slice(-4) : "",
    };
  }
  return NextResponse.json({
    runtime: { node: process.version, vercelEnv: process.env.VERCEL_ENV ?? null },
    env: out,
  });
}
