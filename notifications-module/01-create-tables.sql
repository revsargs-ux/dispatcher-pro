-- ============================================================
-- Dispatcher.PRO — Модуль уведомлений: новые таблицы
-- СТРОГО CREATE — не трогает существующие таблицы
-- ============================================================

-- 1. Push-токены устройств (Web Push подписки)
CREATE TABLE IF NOT EXISTS public.user_device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,           -- ссылка на users.id / workers.id / clients.id
  user_role TEXT NOT NULL DEFAULT 'worker',  -- worker / client / dispatcher / owner
  platform TEXT NOT NULL DEFAULT 'web',      -- web / android / ios
  push_endpoint TEXT NOT NULL,      -- PushSubscription.endpoint
  push_keys JSONB,                  -- { p256dh: ..., auth: ... }
  email TEXT,                       -- email для fallback
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(push_endpoint)
);

-- 2. Настройки уведомлений пользователя
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'worker',
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,
  telegram_enabled BOOLEAN DEFAULT true,  -- уже работает, не трогаем
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, user_role)
);

-- 3. Лог уведомлений
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  channel TEXT NOT NULL,            -- push / email / telegram
  event_type TEXT NOT NULL,         -- new_shift / shift_assigned / shift_updated / payment / etc
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / sent / delivered / failed
  payload JSONB,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.user_device_tokens(user_id, user_role);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON public.notification_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON public.notification_logs(status, created_at);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.user_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Пользователь может управлять только своими токенами
CREATE POLICY "Users manage own tokens" ON public.user_device_tokens
  FOR ALL USING (
    user_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- Пользователь видит свои настройки
CREATE POLICY "Users read own prefs" ON public.user_notification_prefs
  FOR SELECT USING (
    user_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );
CREATE POLICY "Users update own prefs" ON public.user_notification_prefs
  FOR UPDATE USING (
    user_id::text = current_setting('request.jwt.claims', true)->>'sub'
  );

-- Пользователь видит свои логи
CREATE POLICY "Users read own logs" ON public.notification_logs
  FOR SELECT USING (
    user_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- Service role (Edge Function) имеет полный доступ
CREATE POLICY "Service role full access tokens" ON public.user_device_tokens
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access prefs" ON public.user_notification_prefs
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access logs" ON public.notification_logs
  FOR ALL USING (true) WITH CHECK (true);
