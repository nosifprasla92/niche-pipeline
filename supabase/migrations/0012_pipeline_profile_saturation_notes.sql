-- Adds saturation_notes to the singleton pipeline_profile row. Written by the
-- postmortem routine when it detects oversaturated archetypes / tag tuples in
-- the recent 60-day idea pool. Read by the generator to cool off repeated
-- shapes. Distinct from `summary` (founder-profile prose) so each can be
-- rewritten without clobbering the other.

ALTER TABLE public.pipeline_profile
  ADD COLUMN saturation_notes text NOT NULL DEFAULT '';
