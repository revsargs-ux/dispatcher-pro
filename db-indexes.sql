-- Dispatcher.PRO — Recommended Indexes
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- These indexes improve query performance for common lookups

-- Users: login by phone
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- Workers: lookup by phone
CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers (phone);
CREATE INDEX IF NOT EXISTS idx_workers_active ON workers (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workers_telegram ON workers (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- Clients: lookup by contact (phone)
CREATE INDEX IF NOT EXISTS idx_clients_contact ON clients (contact);
CREATE INDEX IF NOT EXISTS idx_clients_telegram ON clients (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- Shifts: query by status (pending orders, active shifts)
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts (status);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts (date);
CREATE INDEX IF NOT EXISTS idx_shifts_client ON shifts (client_id);
CREATE INDEX IF NOT EXISTS idx_shifts_created_by ON shifts (created_by);

-- Shift assignments: query by worker, by shift
CREATE INDEX IF NOT EXISTS idx_assignments_worker ON shift_assignments (worker_id);
CREATE INDEX IF NOT EXISTS idx_assignments_shift ON shift_assignments (shift_id);
CREATE INDEX IF NOT EXISTS idx_assignments_payment ON shift_assignments (payment_status);

-- Payments: query by assignment
CREATE INDEX IF NOT EXISTS idx_payments_assignment ON payments (assignment_id);

-- Service types (small table, but for completeness)
CREATE INDEX IF NOT EXISTS idx_service_types_active ON service_types (is_active) WHERE is_active = true;
