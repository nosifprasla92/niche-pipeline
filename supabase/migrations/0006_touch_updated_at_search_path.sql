-- Pin search_path on public.touch_updated_at to silence the linter and
-- close the "function_search_path_mutable" hole.
--
-- Without an explicit search_path, a role with CREATE on a schema earlier
-- in the search path could shadow built-ins (e.g., now()) and influence
-- what the trigger executes. The function body only calls now(), which
-- lives in pg_catalog, so pinning search_path to pg_catalog, pg_temp is
-- both sufficient and the hardening Supabase's linter recommends.

ALTER FUNCTION public.touch_updated_at() SET search_path = pg_catalog, pg_temp;
