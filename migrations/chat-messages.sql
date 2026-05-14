CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id uuid REFERENCES shifts(id),
  sender_id uuid,
  sender_role text, -- 'client', 'worker', 'dispatcher'
  sender_name text,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_chat_shift ON chat_messages(shift_id, created_at);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON chat_messages;
CREATE POLICY "Service role full access" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon" ON chat_messages;
CREATE POLICY "Block anon" ON chat_messages FOR ALL USING (false) WITH CHECK (false);
