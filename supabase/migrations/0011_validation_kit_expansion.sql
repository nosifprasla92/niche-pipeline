-- Adds 4 new validation-kit fields + 1 synthesis recap to the ideas table.
-- The validator handler (worker/handlers/validator.ts) writes these alongside
-- the existing landing_copy / interview_questions / ad_test_plan /
-- validation_signals columns. All nullable so existing rows are unaffected;
-- the validation tab UI guards on presence.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS decision_rubric        text,
  ADD COLUMN IF NOT EXISTS distribution_beachhead text,
  ADD COLUMN IF NOT EXISTS open_questions         text,
  ADD COLUMN IF NOT EXISTS pricing_anchor         text,
  ADD COLUMN IF NOT EXISTS validation_recap       text;
