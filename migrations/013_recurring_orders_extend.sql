-- F-04: Extend recurring_orders table
-- Run in Supabase SQL Editor
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS worker_count int DEFAULT 1;
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS interval_days int DEFAULT 7;
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS address text;
