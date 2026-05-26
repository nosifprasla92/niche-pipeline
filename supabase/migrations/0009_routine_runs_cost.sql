-- Migration: routine_runs cost columns
-- Adds per-run token + cost fields written by the local worker on
-- successful completion (see worker/claude.ts: result message carries
-- total_cost_usd + usage.input_tokens + usage.output_tokens).
--
-- All three columns are nullable so existing rows stay valid and any
-- handler write that can't compute a value (e.g., the SDK omitted usage)
-- coalesces to NULL rather than failing the run. Cost is decorative;
-- never let it block actual run completion.
--
-- cost_usd is NUMERIC(10,4) — enough precision for fractional-cent Max
-- plan equivalents, enough range for unforeseen high-cost outliers
-- (a single $9,999.9999 row would not corrupt the column).

alter table public.routine_runs
  add column if not exists input_tokens  integer        null,
  add column if not exists output_tokens integer        null,
  add column if not exists cost_usd      numeric(10,4)  null;
