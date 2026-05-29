-- Adds last_postmortem to pipeline_profile. Written at the end of each
-- postmortem run with a snapshot of what changed (added patterns, retired
-- pattern text, saturation findings). Surfaces in the Insights tab as a
-- "what changed in the last run" recap card.

ALTER TABLE public.pipeline_profile
  ADD COLUMN last_postmortem jsonb;
