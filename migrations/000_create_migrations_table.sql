-- Migration tracking table
-- Run this FIRST before any other migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id serial PRIMARY KEY,
  version text UNIQUE NOT NULL,
  filename text,
  applied_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- Only service_role can manage migrations
CREATE POLICY "Service role full access on schema_migrations"
  ON schema_migrations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
