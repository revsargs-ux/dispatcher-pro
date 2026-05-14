-- ============================================================
-- Supabase RLS Security Migration for Dispatcher.PRO
-- Generated: 2026-05-14
-- ============================================================
-- Run this in Supabase SQL Editor.
-- DO NOT run on tables used by Edge Functions:
--   user_device_tokens, notification_logs, blacklist,
--   user_notification_prefs
-- ============================================================

-- ============================================================
-- 1. Helper: updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Unique indexes on phone (nullable-safe)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_phone_unique
  ON workers(phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON users(phone) WHERE phone IS NOT NULL;

-- ============================================================
-- 3. Enable RLS + policies on data tables
-- ============================================================
-- Pattern:
--   ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Service role full access" ON <t> FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "Block anon access" ON <t> FOR ALL USING (false) WITH CHECK (false);

-- --- users ---
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON users;
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON users;
CREATE POLICY "Block anon access" ON users FOR ALL USING (false) WITH CHECK (false);

-- --- workers ---
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON workers;
CREATE POLICY "Service role full access" ON workers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON workers;
CREATE POLICY "Block anon access" ON workers FOR ALL USING (false) WITH CHECK (false);

-- --- clients ---
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON clients;
CREATE POLICY "Service role full access" ON clients FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON clients;
CREATE POLICY "Block anon access" ON clients FOR ALL USING (false) WITH CHECK (false);

-- --- shifts ---
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON shifts;
CREATE POLICY "Service role full access" ON shifts FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON shifts;
CREATE POLICY "Block anon access" ON shifts FOR ALL USING (false) WITH CHECK (false);

-- --- shift_assignments ---
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON shift_assignments;
CREATE POLICY "Service role full access" ON shift_assignments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON shift_assignments;
CREATE POLICY "Block anon access" ON shift_assignments FOR ALL USING (false) WITH CHECK (false);

-- --- shift_requirements ---
ALTER TABLE shift_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON shift_requirements;
CREATE POLICY "Service role full access" ON shift_requirements FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON shift_requirements;
CREATE POLICY "Block anon access" ON shift_requirements FOR ALL USING (false) WITH CHECK (false);

-- --- service_types ---
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON service_types;
CREATE POLICY "Service role full access" ON service_types FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON service_types;
CREATE POLICY "Block anon access" ON service_types FOR ALL USING (false) WITH CHECK (false);

-- --- payments ---
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON payments;
CREATE POLICY "Service role full access" ON payments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON payments;
CREATE POLICY "Block anon access" ON payments FOR ALL USING (false) WITH CHECK (false);

-- --- worker_rates ---
ALTER TABLE worker_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON worker_rates;
CREATE POLICY "Service role full access" ON worker_rates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON worker_rates;
CREATE POLICY "Block anon access" ON worker_rates FOR ALL USING (false) WITH CHECK (false);

-- --- client_service_rates ---
ALTER TABLE client_service_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON client_service_rates;
CREATE POLICY "Service role full access" ON client_service_rates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON client_service_rates;
CREATE POLICY "Block anon access" ON client_service_rates FOR ALL USING (false) WITH CHECK (false);

-- --- tracking_sessions ---
ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON tracking_sessions;
CREATE POLICY "Service role full access" ON tracking_sessions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON tracking_sessions;
CREATE POLICY "Block anon access" ON tracking_sessions FOR ALL USING (false) WITH CHECK (false);

-- --- tracking_locations ---
ALTER TABLE tracking_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON tracking_locations;
CREATE POLICY "Service role full access" ON tracking_locations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon access" ON tracking_locations;
CREATE POLICY "Block anon access" ON tracking_locations FOR ALL USING (false) WITH CHECK (false);

-- ============================================================
-- 4. updated_at triggers for tables with that column
-- ============================================================
-- Drop existing triggers first to avoid duplicates on re-run.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users', 'workers', 'clients', 'shifts', 'shift_assignments',
    'shift_requirements', 'service_types', 'payments', 'worker_rates',
    'client_service_rates', 'tracking_sessions', 'tracking_locations'
  ];
  col_exists boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t AND column_name = 'updated_at'
    ) INTO col_exists;
    IF col_exists THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS set_updated_at ON %I;', t
      );
      EXECUTE format(
        'CREATE TRIGGER set_updated_at
           BEFORE UPDATE ON %I
           FOR EACH ROW
           EXECUTE FUNCTION update_updated_at();',
        t
      );
      RAISE NOTICE 'Trigger set_updated_at created on %', t;
    ELSE
      RAISE NOTICE 'Skipping % (no updated_at column)', t;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 5. Note on password exposure
-- ============================================================
-- RLS blocks anon key from reading any rows, so passwords are
-- not reachable via the anon key. The service_role key (used by
-- the backend only) bypasses RLS by design.
--
-- For defence-in-depth, consider adding a security-definer view
-- that excludes the password column from `users`:
--
-- CREATE OR REPLACE VIEW public.users_safe AS
--   SELECT id, phone, name, role, is_active, created_at, updated_at
--   FROM public.users;
-- ALTER VIEW public.users_safe OWNER TO postgres;
--
-- Then use users_safe wherever the password hash is not needed.
-- ============================================================
