-- Migration: routine_runs
-- Adds the observability table for Claude Cloud Routine invocations and
-- enforces the at-most-one-in-flight invariant per routine via a UNIQUE
-- partial index.
--
-- The dashboard's existing pattern is to run schema SQL manually in the
-- Supabase SQL editor. Copy this whole file into the editor and execute.
--
-- Lifecycle:
--   1. Trigger endpoint INSERTs with status='triggered' (UNIQUE partial
--      index makes concurrent triggers fail with 23505 → trigger returns
--      409 to the caller).
--   2. fire-routine succeeds → UPDATE status='accepted', store
--      fire_response_body.
--   3. fire-routine fails  → UPDATE status='fire_failed', store
--      error_message.
--   4. Routine callback     → UPDATE status='completed' or 'error', set
--      finished_at, summary. Idempotent (status-check before update).
--   5. Sweeper (T15) periodically promotes long-stuck rows to 'timed_out'
--      so the UNIQUE index doesn't permanently wedge a routine.

create table if not exists routine_runs (
  id                bigserial primary key,
  routine_name      text not null,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null,
  triggered_by      text not null,
  idea_context_id   bigint references ideas(id) on delete set null,
  error_message     text,
  fire_response_body text,
  summary           text,
  constraint routine_runs_status_check check (
    status in ('triggered','accepted','fire_failed','completed','error','timed_out','cancelled')
  ),
  constraint routine_runs_triggered_by_check check (
    triggered_by in ('cron','ui','callback')
  )
);

-- The UNIQUE partial index is the race-fix mechanism. Concurrent INSERTs
-- with status='triggered' or 'accepted' for the same routine_name will
-- collide on this index; the second one raises a 23505 unique_violation
-- which the trigger endpoint catches and returns as 409.
--
-- NOTE: stuck 'accepted' rows block ALL future triggers for that routine
-- until the sweeper (T15) timesout them or a callback transitions them
-- to 'completed' / 'error'. Do not ship this index without the sweeper.
create unique index if not exists routine_runs_in_flight_idx
  on routine_runs (routine_name)
  where status in ('triggered','accepted');

-- Covering index for the runs-panel history query (last 20 by routine).
create index if not exists routine_runs_history_idx
  on routine_runs (routine_name, started_at desc);
