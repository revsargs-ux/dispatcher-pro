-- 01_supabase_setup.sql
-- Создаём функцию exec_sql для выполнения DDL через REST API
-- Запустить ОДИН РАЗ в SQL Editor Supabase Dashboard

-- 1. Создаём функцию exec_sql
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
END;
$$;

-- 2. Даём права на вызов
GRANT ALL ON FUNCTION exec_sql(text) TO service_role;
GRANT ALL ON FUNCTION exec_sql(text) TO anon;

-- 3. Создаём таблицу dispatchers (связь диспетчеров с городами)
CREATE TABLE IF NOT EXISTS dispatchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Добавляем dispatcher_id в shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS dispatcher_id UUID REFERENCES users(id);

-- 5. Синхронизируем dispatcher_id = created_by для существующих записей
UPDATE shifts SET dispatcher_id = created_by WHERE dispatcher_id IS NULL AND created_by IS NOT NULL;

-- 6. Индексы для chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_shift_id ON chat_messages(shift_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id, sender_role);

-- 7. Индекс для dispatcher_id
CREATE INDEX IF NOT EXISTS idx_shifts_dispatcher_id ON shifts(dispatcher_id);

-- 8. RLS для chat_messages (разрешить чтение всем участникам)
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_select_policy ON chat_messages;
CREATE POLICY chat_select_policy ON chat_messages
  FOR SELECT USING (true);
DROP POLICY IF EXISTS chat_insert_policy ON chat_messages;
CREATE POLICY chat_insert_policy ON chat_messages
  FOR INSERT WITH CHECK (true);
