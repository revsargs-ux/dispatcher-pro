-- Bot verification codes table
CREATE TABLE IF NOT EXISTS bot_verification_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  code text NOT NULL,
  platform text NOT NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '10 minutes')
);
ALTER TABLE bot_verification_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON bot_verification_codes;
CREATE POLICY "Service role full access" ON bot_verification_codes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Block anon" ON bot_verification_codes;
CREATE POLICY "Block anon" ON bot_verification_codes FOR ALL USING (false) WITH CHECK (false);
