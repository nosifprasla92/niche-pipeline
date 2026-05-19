-- Singleton row holding the post-mortem-generated "founder profile" summary
-- that the Insights tab shows above the Likes/Avoids columns and that the
-- Generator routine reads to bias new ideas. Written by /api/run-postmortem.
--
-- Single-tenant by design: there is exactly one row, enforced by the CHECK
-- constraint on id. RLS is enabled with no policies for parity with the
-- other tables; only the service-key client in lib/supabase.ts touches it.

CREATE TABLE public.pipeline_profile (
  id           int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  summary      text NOT NULL DEFAULT '',
  generated_at timestamptz,
  pattern_count int NOT NULL DEFAULT 0,
  idea_count    int NOT NULL DEFAULT 0
);

INSERT INTO public.pipeline_profile (id) VALUES (1);

ALTER TABLE public.pipeline_profile ENABLE ROW LEVEL SECURITY;
