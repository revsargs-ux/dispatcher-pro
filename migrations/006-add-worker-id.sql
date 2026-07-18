-- Add worker_id column to shifts (if not exists)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id) ON DELETE SET NULL;

-- Drop existing RLS policies that might block
DROP POLICY IF EXISTS "Workers can view their own shifts" ON shifts;
DROP POLICY IF EXISTS "Workers can update their confirmed shifts" ON shifts;

-- Create RLS policies
CREATE POLICY "Workers can view their own shifts" ON shifts
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM workers WHERE id = worker_id
    )
  );

CREATE POLICY "Workers can update their confirmed shifts" ON shifts
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM workers WHERE id = worker_id
    )
    AND (status = 'invited' OR status = 'confirmed')
  );

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_shifts_worker_id ON shifts(worker_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
