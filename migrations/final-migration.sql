-- ===== DISPATCHER.PRO — ФИНАЛЬНАЯ МИГРАЦИЯ =====
-- Запустить 1 раз в Supabase SQL Editor

-- 1. Функция exec_sql (для DDL через REST API)
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  EXECUTE query;
END;
$func$;
GRANT ALL ON FUNCTION public.exec_sql(text) TO service_role;
GRANT ALL ON FUNCTION public.exec_sql(text) TO anon;

-- 2. Таблица диспетчеров
CREATE TABLE IF NOT EXISTS public.dispatchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Колонка dispatcher_id в shifts
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS dispatcher_id UUID REFERENCES users(id);
UPDATE public.shifts SET dispatcher_id = created_by WHERE dispatcher_id IS NULL AND created_by IS NOT NULL;

-- 4. Индексы
CREATE INDEX IF NOT EXISTS idx_chat_messages_shift_id ON public.chat_messages(shift_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON public.chat_messages(sender_id, sender_role);
CREATE INDEX IF NOT EXISTS idx_shifts_dispatcher_id ON public.shifts(dispatcher_id);

-- 5. RLS для чата
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_select_policy ON public.chat_messages;
CREATE POLICY chat_select_policy ON public.chat_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS chat_insert_policy ON public.chat_messages;
CREATE POLICY chat_insert_policy ON public.chat_messages FOR INSERT WITH CHECK (true);

-- 6. Вставляем диспетчеров из users
INSERT INTO public.dispatchers (user_id, city)
SELECT id, city FROM public.users 
WHERE role = 'dispatcher'
AND NOT EXISTS (SELECT 1 FROM public.dispatchers d WHERE d.user_id = users.id);
