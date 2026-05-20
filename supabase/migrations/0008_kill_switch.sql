-- Routine kill switch: a single boolean on pipeline_profile that, when true,
-- causes insertTriggered() in lib/routine-runs.ts to short-circuit before
-- claiming the in-flight slot. Flip it on to halt all routine fires
-- (generator / researcher / validator / planner / postmortem) without
-- redeploying the app.
--
-- Why: routines run as autonomous Claude Code cloud sessions and there is no
-- documented API to cancel a session in flight. The only working brake is to
-- stop NEW fires. The Cloud routine schedules can be paused in the Claude
-- Code web UI; this in-repo switch is a belt-and-suspenders layer that also
-- blocks manual "Run now" presses from the dashboard.
--
-- Not gated: /api/ingest-source. That's an on-demand, value-producing call
-- (one model invocation, no long sessions), so it's exempt.

ALTER TABLE public.pipeline_profile
  ADD COLUMN kill_switch boolean NOT NULL DEFAULT false;
