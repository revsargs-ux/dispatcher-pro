-- Подтверждение часов клиентом
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS client_hours_status TEXT DEFAULT 'pending'
    CHECK (client_hours_status IN ('pending','confirmed','disputed','auto_confirmed')),
  ADD COLUMN IF NOT EXISTS client_hours NUMERIC(5,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hours_submitted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMPTZ DEFAULT NULL;

-- Индекс для автоподтверждения (cron-like запросы)
CREATE INDEX IF NOT EXISTS idx_shift_asgn_hours_status
  ON shift_assignments(client_hours_status, hours_submitted_at)
  WHERE client_hours_status = 'pending';
