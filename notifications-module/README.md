# Dispatcher.PRO — Модуль уведомлений: Инструкция по установке

## 📋 Обзор

Модуль ДОБАВЛЯЕТ push-уведомления к существующей системе. Ничего не ломает.

**Архитектура:**
```
Событие в БД (shift/assignment)
  → pg_net (асинхронный HTTP)
    → Edge Function (send-notification)
      → Web Push (основной канал)
      → Email через Resend (fallback #1)
      → Telegram (fallback #2, уже работает)
```

**Новые компоненты (все в notifications-module/):**
- `01-create-tables.sql` — новые таблицы
- `02-edge-function-send-notification.ts` — Edge Function
- `03-database-webhook.sql` — webhook функция
- `sw-notifications.js` — обновлённый Service Worker
- `push-client.js` — клиентский модуль регистрации
- `push-route.js` — серверный маршрут для подписок

**Существующие файлы — НЕ ТРОГАЮТСЯ. Обновляются через замену:**
- `sw.js` → заменяется на `sw-notifications.js` (старый функционал сохранён)
- HTML файлы → добавляется `<script src="/push-client.js">`
- `server.js` → добавляется один require и один if

---

## 🔧 Шаг 1: Генерация VAPID ключей

```bash
# Установить web-push глобально
npm install -g web-push

# Генерируем ключи
web-push generate-vapid-keys
```

Запишите:
- **Public Key** → в `push-client.js` (PUSH_CONFIG.vapidPublicKey)
- **Private Key** → в Supabase Edge Function .env (VAPID_PRIVATE_KEY)
- **Subject** → ваш email или URL (mailto:admin@dispatcher.pro)

---

## 🔧 Шаг 2: Supabase — создать таблицы

1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте и выполните `01-create-tables.sql`
3. Проверьте что создались 3 таблицы: user_device_tokens, user_notification_prefs, notification_logs

---

## 🔧 Шаг 3: Supabase — развернуть Edge Function

**Вариант A: Через Supabase CLI (рекомендуется)**
```bash
npm install -g supabase
supabase login
supabase init
# Скопировать 02-edge-function-send-notification.ts в supabase/functions/send-notification/index.ts
supabase functions deploy send-notification
```

**Вариант B: Через Dashboard**
1. Supabase Dashboard → Edge Functions → Create Function
2. Name: `send-notification`
3. Вставить код из `02-edge-function-send-notification.ts`

**Настроить секреты в Edge Function:**
```
Supabase Dashboard → Edge Functions → send-notification → Secrets:
- VAPID_PUBLIC_KEY=ваш_публичный_ключ
- VAPID_PRIVATE_KEY=ваш_приватный_ключ
- VAPID_SUBJECT=mailto:admin@dispatcher.pro
- RESEND_API_KEY=re_xxxxxxxxx (если нужен email fallback)
- NOTIFICATION_FROM_EMAIL=Dispatcher.PRO <noreply@yourdomain.com>
- NOTIFICATION_WEBHOOK_SECRET=dp_notify_secret_2026
```

---

## 🔧 Шаг 4: Supabase — Database Webhook

**Вариант A: Через Dashboard (рекомендуется)**
1. Supabase Dashboard → Database → Database Webhooks → Create
2. Name: `notify-on-shift-change`
3. Table: `shifts`
4. Events: Insert, Update
5. Type: HTTP Request
6. URL: `https://<your-project>.supabase.co/functions/v1/send-notification`
7. Secret: ваш NOTIFICATION_WEBHOOK_SECRET

Повторить для таблицы `shift_assignments`.

**Вариант B: Через SQL**
1. Выполните `03-database-webhook.sql`
2. Раскомментируйте триггеры когда будете готовы

---

## 🔧 Шаг 5: Обновить Service Worker

```bash
# Бэкап уже создан (sw.js.bak)
# Заменяем sw.js на новую версию
cp notifications-module/sw-notifications.js sw.js

# Проверяем
docker exec n8n-dispatcher-1 cat /app/sw.js | head -5
```

---

## 🔧 Шаг 6: Добавить push-client.js в HTML

В каждый HTML-файл добавить ОДНУ строку перед `</body>`:

```html
<script src="/push-client.js"></script>
```

**Файлы для обновления:**
- `index.html` (диспетчер)
- `worker.html` (рабочий)
- `client.html` (клиент)

**Как добавить безопасно:**
```bash
# Добавить перед </body> в каждый файл
sed -i 's|</body>|<script src="/push-client.js"></script>\n</body>|' index.html
sed -i 's|</body>|<script src="/push-client.js"></script>\n</body>|' worker.html
sed -i 's|</body>|<script src="/push-client.js"></script>\n</body>|' client.html
```

---

## 🔧 Шаг 7: Добавить маршрут в server.js

Добавить 3 строки в server.js (ПОСЛЕ существующих require):

```javascript
const { handlePushSubscription } = require('./notifications-module/push-route');
```

И в обработчик запроса (ПЕРЕД основным роутером):

```javascript
if (req.url === '/api/push-subscription' && req.method === 'POST') {
  return handlePushSubscription(req, res);
}
```

⚠️ Это единственное изменение в существующем коде. Откат = убрать 3 строки.

---

## 🔧 Шаг 8: Скопировать файлы и перезапустить

```bash
# Копируем push-client.js в корень (монтируется Docker)
cp notifications-module/push-client.js push-client.js

# Добавляем push-client.js в docker-compose volumes
# - ./push-client.js:/app/push-client.js:ro

# Перезапуск
docker restart n8n-dispatcher-1
```

---

## ✅ Чек-лист тестирования

### 1. Push при открытом приложении (foreground)
- [ ] Открыть worker.html
- [ ] Создать смену через dispatcher
- [ ] Уведомление должно появиться мгновенно

### 2. Push при свёрнутом приложении (background)
- [ ] Открыть worker.html, затем переключить вкладку
- [ ] Создать смену
- [ ] Уведомление должно появиться в системном трее

### 3. Push при закрытом приложении (terminated)
- [ ] Закрыть все вкладки dispatcher
- [ ] Создать смену
- [ ] Уведомление должно появиться от Service Worker

### 4. Клик по уведомлению
- [ ] Нажать на уведомление
- [ ] Должен открыться Dispatcher.PRO на нужной странице

### 5. Telegram fallback
- [ ] Заблокировать push в браузере
- [ ] Создать событие
- [ ] Должно прийти в Telegram

### 6. Логирование
- [ ] Проверить notification_logs в Supabase
- [ ] Каждый канал должен быть залогирован

### 7. Обратная совместимость
- [ ] Диспетчер — создаёт смены, приглашает, редактирует (как раньше)
- [ ] Рабочий — видит смены, подтверждает, старт/финиш (как раньше)
- [ ] Клиент — заказывает, оплачивает (как раньше)
- [ ] Telegram бот — привязка, уведомления (как раньше)
- [ ] Google Sheets — синхронизация работает (как раньше)

---

## 🔄 Откат (если что-то пойдёт не так)

```bash
# Вернуть sw.js
cp sw.js.bak sw.js

# Вернуть HTML файлы
cp index.html.notifications.bak index.html
cp worker.html.notifications.bak worker.html
cp client.html.notifications.bak client.html

# Вернуть server.js
cp server.js.bak server.js

# Перезапуск
docker restart n8n-dispatcher-1
```

Все бэкапы уже созданы. Откат — 4 команды.

---

## 📦 .env переменные (итого)

| Переменная | Где | Обязательно |
|---|---|---|
| VAPID_PUBLIC_KEY | push-client.js + Edge Function | ✅ |
| VAPID_PRIVATE_KEY | Edge Function secret | ✅ |
| VAPID_SUBJECT | Edge Function secret | ✅ |
| RESEND_API_KEY | Edge Function secret | ❌ (email fallback) |
| NOTIFICATION_FROM_EMAIL | Edge Function secret | ❌ |
| NOTIFICATION_WEBHOOK_SECRET | Edge Function + Webhook | ✅ |
