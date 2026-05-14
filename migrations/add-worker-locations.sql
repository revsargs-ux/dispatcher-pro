CREATE TABLE IF NOT EXISTS worker_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid REFERENCES workers(id),
  session_id text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  battery_level integer,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_worker_locations_worker ON worker_locations(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_locations_session ON worker_locations(session_id);
CREATE INDEX IF NOT EXISTS idx_worker_locations_time ON worker_locations(recorded_at DESC);
