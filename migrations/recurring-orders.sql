-- Recurring orders / subscriptions
-- Auto-create shifts from templates
CREATE TABLE IF NOT EXISTS recurring_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id),
  worker_id uuid REFERENCES workers(id),
  service_type_id uuid REFERENCES service_types(id),
  day_of_week int,            -- 0=Sun, 1=Mon, ..., 6=Sat
  time_start time,
  hours numeric DEFAULT 4,
  object_address text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

ALTER TABLE recurring_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON recurring_orders;
CREATE POLICY "Service role full access" ON recurring_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon" ON recurring_orders;
CREATE POLICY "Block anon" ON recurring_orders FOR ALL USING (false) WITH CHECK (false);
