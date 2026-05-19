-- Convert why_it_works and devils_advocate from text to jsonb arrays of
-- InsightPoint = { text: string, important?: boolean }. Existing prose
-- rows backfill as single-bullet arrays with important=false.
--
-- Driven by the user feedback that paragraph walls overwhelmed the card
-- read. Structured bullets let the UI render scannable lists and the
-- routine prompts can mark at most one bullet as important.

ALTER TABLE ideas
  ALTER COLUMN why_it_works TYPE jsonb
  USING jsonb_build_array(
    jsonb_build_object('text', why_it_works, 'important', false)
  );

ALTER TABLE ideas
  ALTER COLUMN devils_advocate TYPE jsonb
  USING jsonb_build_array(
    jsonb_build_object('text', devils_advocate, 'important', false)
  );
