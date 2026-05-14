# Backend API & Security Audit v2
**Дата:** 2026-05-14  
**Аудитор:** Peptide Bot (subagent)  
**Целевая директория:** `/home/n8n/dispatcher-deploy/`

---

## 1. API Endpoint Inventory

### Public (без авторизации)

| Method | Path | Handler | Описание |
|--------|------|---------|----------|
| GET | `/health` | `handleHealth` | Health check (uptime, memory, version) |
| POST | `/auth/login` | `authRoutes.handleLogin` | Логин по телефону + пароль |
| POST | `/auth/register` | `authRoutes.handleRegister` | Регистрация (workers/clients самост., users — с auth) |
| POST | `/auth/forgot` | `authRoutes.handleForgot` | Сброс пароля через TG |
| POST | `/auth/verify-2fa` | `authRoutes.handleVerify2FA` | Проверка 2FA кода |
| POST | `/auth/tg-login` | `authRoutes.handleTgLogin` | TG Mini App логин по chat_id |
| POST | `/api/gas-webhook` | `paymentRoutes.handleGasWebhook` | Вебхук из Google Sheets (HMAC sig.) |

### Auth-required

| Method | Path | Handler | Auth | Описание |
|--------|------|---------|------|----------|
| GET | `/auth/me` | `handleAuthMe` | requireAuth | Верификация токена + данные юзера |
| POST | `/auth/refresh` | `handleAuthRefresh` | — (token in body) | Ротация refresh token |
| POST | `/auth/logout` | `handleAuthLogout` | requireAuth | Блеклистит токен |
| GET | `/api/stats` | `handleStats` | owner/dispatcher | Мониторинг статистика |
| GET | `/api/client-pay-method` | `userRoutes.handleClientPayMethodGet` | requireAuth | Метод оплаты клиента |
| POST | `/api/client-pay-method` | `userRoutes.handleClientPayMethodPost` | requireAuth | Сохранить метод оплаты |
| GET | `/api/notifications/new-workers` | `userRoutes.handleNotificationsGet` | requireAuth | Уведомления о новых рабочих |
| DELETE | `/api/notifications/new-workers` | `userRoutes.handleNotificationsDelete` | requireAuth | Пометить прочитанными |
| GET | `/api/pending-orders` | `shiftRoutes.handlePendingOrders` | requireAuth | Список pending-заказов |
| POST | `/api/claim-order` | `shiftRoutes.handleClaimOrder` | requireAuth | Взять заказ диспетчером |
| POST | `/api/reviews` | `shiftRoutes.handleSubmitReview` | requireAuth (client only) | Оставить отзыв |
| GET | `/api/reviews/worker/:id` | `shiftRoutes.handleGetWorkerReviews` | requireAuth | Отзывы рабочего |
| GET | `/api/recurring` | `shiftRoutes.handleRecurringList` | requireAuth | Шаблоны рекуррентных заказов |
| POST | `/api/recurring` | `shiftRoutes.handleRecurringCreate` | requireAuth | Создать шаблон |
| PATCH | `/api/recurring/:id` | `shiftRoutes.handleRecurringUpdate` | requireAuth | Обновить шаблон |
| DELETE | `/api/recurring/:id` | `shiftRoutes.handleRecurringDelete` | requireAuth | Удалить шаблон |
| GET | `/api/chat/:shift_id` | `chatRoutes.handleChatGet` | requireAuth + access check | Получить сообщения чата |
| POST | `/api/chat/:shift_id` | `chatRoutes.handleChatPost` | requireAuth + access check | Отправить сообщение |
| GET | `/api/tracking/status` | `trackingRoutes.handleTrackingStatus` | requireAuth | Статус GPS-трекинга |
| POST | `/api/tracking/start` | `trackingRoutes.handleTrackingStart` | requireAuth | Начать трекинг |
| POST | `/api/tracking/stop` | `handleTrackingStop` | requireAuth | Остановить трекинг |
| POST | `/api/tracking/location` | `trackingRoutes.handleTrackingLocation` | requireAuth | Отправить координаты |
| GET | `/api/tracking/workers-location` | `trackingRoutes.handleTrackingWorkersLocation` | requireAuth | Координаты рабочих |
| GET | `/api/address-suggest` | `userRoutes.handleAddressSuggest` | requireAuth | Подсказки адресов (Nominatim) |
| GET | `/api/telegram-status` | `userRoutes.handleTelegramStatus` | requireAuth | Привязан ли TG |
| GET | `/api/upload-shift-photo` (server.js) | inline | Authorization header only | Загрузить фото смены |
| GET | `/api/shift-photos` (server.js) | inline | **NO AUTH** ⚠️ | Список фото смены |
| GET | `/api/push-subscription` | `push-route.handlePushSubscription` | **NO AUTH** ⚠️ | Подписка на push |
| GET | `/export/payments.csv` | `paymentRoutes.handleExportCsv` | requireAuth | Экспорт CSV |
| POST | `/upload-receipt` | `paymentRoutes.handleUploadReceipt` | requireAuth | Загрузить чек |
| GET | `/receipts/:file` | `paymentRoutes.handleReceipt` | requireAuth | Скачать чек |
| GET/POST/PATCH/DELETE | `/api/:table` | `handleApiProxy` | requireAuth | Generic Supabase proxy |

---

## 2. Auth Flow Audit

### Login (`handleLogin`)
- ✅ **Rate limit:** 5 attempts per 5 min per IP
- ✅ **is_active фильтр:** Добавляется для workers/users (`&is_active=eq.true`), НЕ для clients — **ПРАВИЛЬНО** (Lesson #38)
- ✅ **Проверка пароля:** `checkPassword()` — bcrypt compare или SHA-256 legacy. **Plaintext сравнение УДАЛЕНО** (Lesson #61 ✅)
- ✅ **Двойная проверка is_active:** После логина дополнительно `if (u.is_active === false) return error`
- ✅ **Auto-upgrade:** SHA-256 → bcrypt при успешном логине
- ✅ **Phone column:** clients → `contact`, workers → `phone`
- ⚠️ **Роль из body:** `role` берётся из тела запроса и сравнивается — это позволяет логиниться как worker если нашёлся в workers, но параметр не авторитетен

### Register (`handleRegister`)
- ✅ **Без auth:** workers и clients могут саморегистрироваться
- ✅ **С auth:** users — нужен auth + роль owner/dispatcher. Нельзя создать owner будучи dispatcher
- ✅ **Role protection:** Без auth + table=users → forced role=dispatcher
- ✅ **Дубликат:** Проверка по последним 10 цифрам телефона (Lesson #28 ✅)
- ✅ **Пароль хешируется:** `hashPassword()` вызывается перед вставкой

### Forgot password (`handleForgot`)
- ✅ Генерирует случайный пароль, хеширует, отправляет в TG
- ✅ Проверяет привязку telegram_chat_id

### 2FA (`handleVerify2FA`)
- ✅ 6-значный код, 5 мин TTL
- ✅ Только для owner/dispatcher с привязанным TG
- ✅ Код отправляется в TG
- ⚠️ **Брутфорс:** Нет rate limit на /auth/verify-2FA — можно перебрать 6-значный код (1M комбинаций)

### TG Login (`handleTgLogin`)
- ⚠️ **Нет валидации telegram_chat_id:** Принимает любое значение из body — позволяет логиниться под любым привязанным пользователем, если знаешь chat_id
- ⚠️ **Нет rate limit**
- ⚠️ **Нет HMAC проверки** — TG Mini App должен отправлять `initData` с подписью, а не голый chat_id

### Refresh Token Rotation
- ✅ Реализована family-based ротация
- ✅ Повторное использование → blacklist всей family (детект кражи)
- ✅ Blacklist persisted в `data/sessions.json`

### Token Blacklist
- ✅ Работает корректно (in-memory + persisted)
- ✅ Очистка expired каждые 10 минут

### JWT Secret
- ✅ Persisted в `data/.jwt_secret`
- ✅ Выживает после restart

---

## 3. Security Check

### CSP Header
- ⚠️ **Report-Only mode:** `Content-Security-Policy-Report-Only` вместо `Content-Security-Policy`
- CSP применяется ТОЛЬКО к static files (SEC_HEADERS в `handleStatic`), **НЕ** к API ответам
- **Рекомендация:** Переключить на enforcing mode после проверки логов

### HMAC Webhook (GAS)
- ✅ `verifyGasSignature()` использует timing-safe comparison
- ✅ Проверяет timestamp freshness (5 min)
- ✅ Вызывается в routes.js перед `handleGasWebhook`
- ✅ Whitelist таблиц: workers, clients, shifts, shift_assignments, payments, users

### Rate Limiting
- **Login:** 5 attempts / 5 min per IP ✅
- **API:** 120 req/min per IP ✅
- **2FA:** Нет rate limit ⚠️
- **TG Login:** Нет rate limit ⚠️
- **Register:** Нет rate limit ⚠️

### CORS
- ⚠️ **localhost в production:** `http://localhost:8080` и `http://localhost:3000` в allowedOrigins (Lesson #54 НЕ исправлено)
- Production домены: `https://xn----gtbdan3bddhceo9d.xn--p1ai`, `https://bot.plus-rabochie.ru`

### Passwords in API Responses
- ⚠️ **Generic API proxy** (`handleApiProxy`) прокидывает ответ Supabase как есть. Если Supabase таблица `workers`/`clients`/`users` содержит `password` колонку — она вернётся в ответе (Lesson #47)
- **Решение:** Либо RLS (anon key не видит password), либо proxy должен фильтровать колонку. Сейчас используется **service_role key** (обходит RLS) — значит пароли МОГУТ утекать

### Secrets in Source Code
- 🔴 **MAX_BOT_TOKEN** hardcoded в config.js: `process.env.MAX_BOT_TOKEN || 'f9LHod...'` (Lesson #49 НЕ исправлено)
- 🔴 **GEMINI_API_KEY** hardcoded: `process.env.GEMINI_API_KEY || 'e3f35d...'`
- 🔴 **GAS_WEBHOOK_SECRET** hardcoded: `'dp_gas_sync_2026'`
- 🔴 **Push webhook secret** hardcoded в push-trigger.js: `'dp_notify_secret_2026'`

### UUID Validation
- ✅ Reviews: regex `/^[0-9a-f-]{36}$/` на shift_id и worker_id
- ✅ Chat: regex на shift_id
- ✅ Recurring: regex на id
- ⚠️ **Tracking routes:** worker_id, session_id — **БЕЗ валидации UUID**. Передаются напрямую в sbFetch query
- ⚠️ **API proxy:** table name и query params — **БЕЗ валидации**. `encodeURIComponent` не используется

### Tracking — Ownership Check
- 🔴 **НЕТ проверки принадлежности:** `/api/tracking/start` принимает любой `worker_id` — любой авторизованный пользователь может начать трекинг за другого (Lesson #56 НЕ исправлено)
- 🔴 `/api/tracking/location` — та же проблема
- ⚠️ `/api/tracking/workers-location` — N+1 запрос (цикл по worker_ids)

### Shift Photo Endpoints (server.js)
- ⚠️ `/api/upload-shift-photo` — проверяет Authorization header, но не использует `requireAuth()` (нет проверки JWT, просто наличие header)
- 🔴 `/api/shift-photos` — **СОВСЕМ БЕЗ АВТОРИЗАЦИИ** — кто угодно может перечислить фото по shift_id
- 🔴 `/shift-photos/` — serving файлов **без авторизации** — path traversal защищён (`startsWith` check), но любой может скачать фото

---

## 4. Data Flow Audit

### Salary Calculation (handlePostProcess → shift completed)
- ✅ Формула: `hours × rate + extra_amount`
- ✅ `rate_per_hour` defaults to 400
- ✅ Вызывается только если `hours_worked > 0`
- ✅ Записывает `calculated_salary` в assignment
- ⚠️ **N+1:** Для каждого assignment — отдельный запрос worker данных + maxNotify + tgNotify (3-4 запроса на assignment)

### Notifications on Shift Completion
- ✅ Worker получает TG + MAX + Push о расчёте зарплаты
- ⚠️ **Клиент НЕ уведомляется** о завершении смены
- ⚠️ **Диспетчер НЕ уведомляется** о завершении смены

### Photo Upload
- ⚠️ `/api/upload-shift-photo` в server.js — базовая авторизация (только наличие header), нет JWT проверки
- ✅ Max size 5MB
- ✅ Filename sanitization
- ✅ Path traversal protection

### Chat Message Forwarding
- ✅ Worker → отправляется клиенту (TG + MAX)
- ✅ Client → отправляется всем assigned workers (TG + MAX)
- ✅ Dispatcher — не форвардится (видит в web)
- ✅ Rate limit: 1 сообщение / 2 сек per user
- ✅ HTML escaping: `escHtml()` применяется
- ✅ Shift access verification: `verifyShiftAccess()` проверяет assignment/client ownership

---

## 5. Notification Matrix

| Событие | TG | MAX | Push | Примечание |
|---------|-----|-----|------|------------|
| **Новый заказ (shifts POST)** | ✅ dispatchers (filtered by city) | ❌ | ✅ dispatchers | MAX не уведомляет о новом заказе |
| **Заказ принят (claim-order)** | ✅ client | ❌ | ✅ client | MAX не уведомляет клиента |
| **Рабочий назначен (assignment POST)** | ✅ worker | ❌ | ✅ worker | MAX не уведомляет о назначении |
| **Смена завершена (shift PATCH→completed)** | ✅ worker (salary) | ✅ worker (salary) | ✅ worker (salary) | Клиент/диспетчер НЕ уведомляются |
| **Статус оплаты изменён** | ✅ worker | ✅ worker | ✅ worker | |
| **Оплата проведена (payments POST)** | ❌ | ❌ | ✅ worker | TG/MAX не отправляют |
| **Новый рабочий зарегистрирован** | ✅ owner (tgNotifyRole) | ✅ owner (maxNotifyRole) | ❌ | Push owner не уведомляется |
| **Пароль сброшен** | ✅ user | ❌ | ❌ | Только TG |

### Критические пробелы:
1. 🔴 **MAX не уведомляет** о новых заказах, принятых заказах, назначении рабочих
2. 🔴 **Клиент НЕ уведомляется** о завершении смены (ни через один канал)
3. 🔴 **Диспетчер НЕ уведомляется** о завершении смены
4. ⚠️ **Push owner** не уведомляется о новом рабочем

---

## 6. Integration Check

### GAS Sync (Google Sheets)
- ✅ **Periodic sync:** Каждые 5 минут (`setInterval` в server.js)
- ✅ **Startup sync:** Через 30 сек после запуска
- ✅ **Push sync:** При каждом изменении (shift/worker/assignment/payment/client/user)
- ✅ **Pull sync:** `gasSyncWorkers()` + `gasSyncShifts()` — сравнивает данные GAS ↔ Supabase
- ✅ **Webhook:** HMAC подпись + whitelist таблиц
- ⚠️ **GAS URL** из env, но `gasWebhookSecret` hardcoded

### GPS Tracking
- ✅ Все endpoints замаунчены в routes.js
- ✅ In-memory кэш + fallback к Supabase
- 🔴 **Нет ownership проверки** (Lesson #56)
- ⚠️ N+1 в `handleTrackingWorkersLocation`

### Recurring Orders
- ✅ Cron запускается каждый день в 00:05 UTC
- ✅ Startup run через 60 сек
- ✅ Проверяет day_of_week + is_active
- ✅ Проверяет дубликат (notes like `recurring:ID`)
- ✅ Auto-assign worker если задан
- ⚠️ **Нет уведомлений** при auto-создании смены из recurring

### Chat Forwarding
- ✅ TG: `sendTgMessage()` 
- ✅ MAX: `sendMaxMessage()` через REST API
- ✅ Асинхронная отправка (не блокирует)
- ✅ Access control: `verifyShiftAccess()` проверяет role + ownership

### Telegram Polling
- ✅ `startPolling()` вызывается в server.js
- ✅ Поддержка команд: /start, /help, /shifts, /earnings, /orders, /selfemployed

### MAX Polling
- ✅ `startMaxPolling()` вызывается в server.js
- ✅ Аналогичные команды как TG

---

## Критические находки (Summary)

### 🔴 Critical
1. **Секреты в исходниках** — MAX_BOT_TOKEN, GEMINI_API_KEY, GAS_WEBHOOK_SECRET, Push secret (Lesson #49)
2. **Пароли могут утекать через API proxy** — service_role key обходит RLS, SELECT * вернёт password hash
3. **Tracking без ownership проверки** — любой авторизованный юзер может трекить чужого worker_id
4. **Shift photos без авторизации** — `/api/shift-photos` и `/shift-photos/` доступны без логина
5. **TG Login без валидации** — можно логиниться зная чужой telegram_chat_id

### ⚠️ Warning
6. **CSP report-only** — не блокирует XSS, только логирует
7. **localhost в CORS** — оставлен в production
8. **2FA без rate limit** — брутфорс 6-значного кода
9. **MAX не уведомляет** о 3 из 5 событиях (новый заказ, принят, назначен)
10. **Клиент/диспетчер не уведомляются** о завершении смены
11. **N+1 запросы** в handlePostProcess и tracking workers-location
12. **UUID validation** отсутствует на tracking endpoints
13. **Upload shift photo** — нет JWT проверки, только presence header

### ✅ Good
- Auth flow корректный (bcrypt, is_active, phone columns)
- Token blacklist + refresh rotation с theft detection
- Chat access control работает
- GAS sync bidirectional
- Recurring orders auto-creation
- Rate limiting на login и API
- HMAC verification на GAS webhook
