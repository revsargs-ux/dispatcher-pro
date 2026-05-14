-- Reviews table for worker ratings
CREATE TABLE IF NOT EXISTS reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id uuid REFERENCES shifts(id),
  client_id uuid REFERENCES clients(id),
  worker_id uuid REFERENCES workers(id),
  rating int CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

-- One review per shift per client
CREATE UNIQUE INDEX IF NOT EXISTS reviews_shift_client_idx ON reviews(shift_id, client_id);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON reviews;
CREATE POLICY "Service role full access" ON reviews FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon" ON reviews;
CREATE POLICY "Block anon" ON reviews FOR ALL USING (false) WITH CHECK (false);
