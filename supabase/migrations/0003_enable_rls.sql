-- Enable Row Level Security on public.ideas and public.feedback_patterns.
--
-- Supabase's security advisor flagged both tables as having RLS disabled,
-- which means anyone holding the anon key could read or modify every row.
--
-- The dashboard is single-tenant and password-gated via proxy.ts; the only
-- Supabase client in this repo uses SUPABASE_SERVICE_KEY (lib/supabase.ts),
-- which bypasses RLS. No anon-key code path exists. Enabling RLS with NO
-- policies therefore locks out anon access entirely while the dashboard
-- keeps working unchanged.
--
-- If a future feature ever needs anon-key access (e.g., a public read
-- endpoint), add narrowly-scoped CREATE POLICY statements at that point.
-- Until then, no-policies-RLS is the safe default.

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_patterns ENABLE ROW LEVEL SECURITY;
