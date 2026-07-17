-- Missing indexes for frequently queried tables
-- Run: apply via Supabase SQL editor or psql

-- Shifts: filtered by client_id, date, status frequently
CREATE INDEX IF NOT EXISTS idx_shifts_client_id ON shifts(client_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_service_type_id ON shifts(service_type_id);

-- Shift assignments: filtered by shift_id, worker_id, invite_status
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift_id ON shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_worker_id ON shift_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_invite_status ON shift_assignments(invite_status);

-- Payments: filtered by assignment_id
CREATE INDEX IF NOT EXISTS idx_payments_assignment_id ON payments(assignment_id);

-- Chat messages: filtered by shift_id, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_chat_messages_shift_id ON chat_messages(shift_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Workers: filtered by phone, is_active
CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers(phone);
CREATE INDEX IF NOT EXISTS idx_workers_is_active ON workers(is_active);

-- Clients: filtered by contact
CREATE INDEX IF NOT EXISTS idx_clients_contact ON clients(contact);

-- Recurring orders: filtered by client_id, is_active
CREATE INDEX IF NOT EXISTS idx_recurring_orders_client_id ON recurring_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_orders_is_active ON recurring_orders(is_active);

-- Reviews: filtered by worker_id
CREATE INDEX IF NOT EXISTS idx_reviews_worker_id ON reviews(worker_id);

-- Shift requirements: filtered by shift_id
CREATE INDEX IF NOT EXISTS idx_shift_requirements_shift_id ON shift_requirements(shift_id);

-- Notifications: filtered by user_id
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Worker locations: filtered by worker_id
CREATE INDEX IF NOT EXISTS idx_worker_locations_worker_id ON worker_locations(worker_id);

-- Shift photos: filtered by shift_id
CREATE INDEX IF NOT EXISTS idx_shift_photos_shift_id ON shift_photos(shift_id);
