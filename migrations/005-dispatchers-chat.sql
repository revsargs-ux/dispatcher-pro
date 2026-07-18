-- ==========================================================
-- Migration 005: Диспетчеры + Чат по заказам + Push
-- ==========================================================

-- ---
-- 1. Таблица диспетчеров
-- ---
CREATE TABLE IF NOT EXISTS dispatchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL DEFAULT '',
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  telegram_chat_id TEXT,
  max_chat_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---
-- 2. Поле dispatcher_id в shifts (кто создал/курирует заказ)
-- ---
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS dispatcher_id UUID REFERENCES dispatchers(id) ON DELETE SET NULL;

-- ---
-- 3. Индексы для быстрого поиска
-- ---
CREATE INDEX IF NOT EXISTS idx_shifts_dispatcher_id ON shifts(dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_shifts_city ON shifts(city);
CREATE INDEX IF NOT EXISTS idx_dispatchers_city ON dispatchers(city);
CREATE INDEX IF NOT EXISTS idx_chat_messages_shift_id ON chat_messages(shift_id);

-- ---
-- 4. RLS для chat_messages — любой участник смены может читать/писать
-- ---
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'chat_messages_all_policy') THEN
    CREATE POLICY chat_messages_all_policy ON chat_messages
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ---
-- 5. Добавим поле city в shifts (для фильтрации по городу)
-- ---
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS city TEXT;
