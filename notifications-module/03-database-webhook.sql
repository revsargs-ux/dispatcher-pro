-- ============================================================
-- Database Webhook: вызывает Edge Function при событиях заказов
-- Использует pg_net (встроенное расширение Supabase)
-- НЕ использует триггеры на основные таблицы — полностью изолировано
-- ============================================================

-- Включаем pg_net если не включён
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Создаём функцию-обёртку для вызова Edge Function через pg_net
-- Это НЕ триггер — это функция, которую вызовет Supabase Database Webhook
CREATE OR REPLACE FUNCTION public.notify_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  webhook_url TEXT;
  webhook_secret TEXT;
  payload JSONB;
  user_id_val UUID;
  user_role_val TEXT;
BEGIN
  -- URL Edge Function
  webhook_url := current_setting('app.settings.notification_url', true);
  webhook_secret := current_setting('app.settings.notification_secret', true);
  
  -- Если настройки не заданы — тихо выходим (ничего не ломаем)
  IF webhook_url IS NULL OR webhook_url = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Определяем тип события
  payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'record', COALESCE(to_jsonb(NEW), to_jsonb(OLD)),
    'timestamp', now()
  );

  -- Асинхронный HTTP-вызов через pg_net (НЕ блокирует транзакцию)
  PERFORM net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.sb_service_key', true),
      'X-Webhook-Secret', webhook_secret
    ),
    body := payload,
    -- Таймаут 5 секунд, чтобы не держать транзакцию
    timeout_milliseconds := 5000
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- ⚠️ ВАЖНО: Триггеры НЕ создаём автоматически!
-- 
-- Триггеры создаются ТОЛЬКО через Supabase Dashboard:
-- Database → Database Webhooks → Create Webhook
-- 
-- Это гарантирует что Supabase управляет жизненным циклом
-- и при необходимости легко отключить без удаления кода.
--
-- Если нужно через SQL — раскомментируйте ниже:
-- ============================================================

-- Триггер на создание/обновление смен (shifts)
-- CREATE TRIGGER on_shift_change
--   AFTER INSERT OR UPDATE ON public.shifts
--   FOR EACH ROW
--   EXECUTE FUNCTION public.notify_event();

-- Триггер на назначения (shift_assignments)  
-- CREATE TRIGGER on_assignment_change
--   AFTER INSERT OR UPDATE ON public.shift_assignments
--   FOR EACH ROW
--   EXECUTE FUNCTION public.notify_event();
