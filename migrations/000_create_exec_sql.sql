-- ==========================================================
-- Migration 000: Create exec_sql function for auto-migrations
-- ==========================================================
CREATE OR REPLACE FUNCTION public.exec_sql(sql_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;
