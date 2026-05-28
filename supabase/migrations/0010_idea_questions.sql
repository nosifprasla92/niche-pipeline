-- idea_questions: per-idea Q&A pairs from the in-app reasoning surface.
--
-- The user asks a question on an idea card; the route streams a Sonnet 4.6
-- (extended thinking) answer over the idea's full context and persists the
-- pair here. Two downstream consumers read from this table:
--   * worker/handlers/postmortem.ts pulls Q&A for killed ideas to learn the
--     real objection behind a kill (richer than ideas.kill_reason alone).
--   * worker/handlers/generator.ts pulls recent Q&A across all ideas as soft
--     priors for what the founder has been chewing on.
--
-- RLS enabled with no policies, mirroring ideas / feedback_patterns /
-- research_sources (0003, 0007). Only the service-key client touches this.

CREATE TABLE public.idea_questions (
  id              bigserial PRIMARY KEY,
  idea_id         bigint NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  question        text NOT NULL,
  answer          text NOT NULL,
  model           text NOT NULL,
  thinking_tokens integer,
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idea_questions_idea_created_idx
  ON public.idea_questions (idea_id, created_at DESC);

ALTER TABLE public.idea_questions ENABLE ROW LEVEL SECURITY;
