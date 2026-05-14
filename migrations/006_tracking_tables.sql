-- GPS Tracking tables for Dispatcher.PRO
-- Run this in Supabase SQL Editor

-- Sessions table
CREATE TABLE IF NOT EXISTS tracking_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'stopped')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

-- Locations table
CREATE TABLE IF NOT EXISTS tracking_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES tracking_sessions(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery_level DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_worker ON tracking_sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_status ON tracking_sessions(status);
CREATE INDEX IF NOT EXISTS idx_tracking_locations_session ON tracking_locations(session_id);
CREATE INDEX IF NOT EXISTS idx_tracking_locations_worker ON tracking_locations(worker_id);
CREATE INDEX IF NOT EXISTS idx_tracking_locations_created ON tracking_locations(created_at DESC);

-- RLS policies
ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_locations ENABLE ROW LEVEL SECURITY;

-- Workers can see their own tracking
CREATE POLICY "Workers can view own sessions" ON tracking_sessions
  FOR SELECT USING (worker_id::text = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Workers can view own locations" ON tracking_locations
  FOR SELECT USING (worker_id::text = current_setting('request.jwt.claims', true)::json->>'sub');

-- Service role (backend) full access
CREATE POLICY "Service role full access sessions" ON tracking_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access locations" ON tracking_locations
  FOR ALL USING (true) WITH CHECK (true);
