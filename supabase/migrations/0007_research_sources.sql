-- research_sources: library of external research / data the routines consult
-- as priors when generating, researching, or scoring ideas.
--
-- This is intentionally NOT idea-specific. Sources live in their own table
-- so any Cloud Routine can `select … where tags && {…}` and pull citable
-- benchmarks (conversion %, churn, pricing norms, market sizes, etc.)
-- without us hard-coding them into prompts. The article itself is never
-- treated as a constraint — routines also have web access and may pull
-- additional context. See /api/ingest-source for the ingest flow.
--
-- Distillation shape (key_data_points jsonb): array of
--   { metric, value, context?, page_or_quote? }
-- objects. Stored verbatim from the model output so we can iterate on the
-- schema by re-ingesting rather than running data migrations.
--
-- RLS enabled with no policies for parity with ideas/feedback_patterns;
-- only the service-key client (lib/supabase.ts) touches this table.

CREATE TABLE public.research_sources (
  id              bigserial PRIMARY KEY,
  url             text NOT NULL UNIQUE,
  title           text NOT NULL,
  source_type     text NOT NULL CHECK (source_type IN ('pdf','article','report','other')),
  summary         text NOT NULL,
  key_data_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags            text[] NOT NULL DEFAULT '{}',
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_sources_tags_idx
  ON public.research_sources USING gin (tags);

CREATE TRIGGER research_sources_touch_updated_at
  BEFORE UPDATE ON public.research_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.research_sources ENABLE ROW LEVEL SECURITY;
