-- Migration: notifications.json → Supabase
-- Run this in Supabase SQL Editor
-- Creates app_notifications table with RLS

CREATE TABLE IF NOT EXISTS app_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  role text,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  data jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_notifs_user ON app_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifs_role ON app_notifications(role, created_at DESC);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON app_notifications;
CREATE POLICY "Service role full access" ON app_notifications
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon" ON app_notifications;
CREATE POLICY "Block anon" ON app_notifications
  FOR ALL USING (false) WITH CHECK (false);
