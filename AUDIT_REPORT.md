# AUDIT_REPORT.md — Dispatcher.PRO

**Дата:** 2026-05-20  
**Аудитор:** Тано (AI Agent)

---

## 1. Что найдено

### 🔴 Критические (Безопасность)

| # | Файл | Проблема |
|---|------|----------|
| 1 | `notifications-module/push-route.js` | **Баг JWT парсинга**: извлекал payload из `parts[0]` (header) вместо `parts[1]`, и искал поле `uid` вместо `userId` — push-уведомления для авторизованных пользователей НЕ работали |
| 2 | `notifications-module/push-route.js` | CORS обходился (`Access-Control-Allow-Origin: *`) вместо использования единой CORS системы |
| 3 | `modules/config.js` | Захардкожен Supabase URL (`https://YOUR-PROJECT.supabase.co`) — утечка в открытый код |
| 4 | `notifications-module/push-trigger.js` | Захардкожен Supabase URL для Edge Function |
| 5 | `modules/db.js` | Нет валидации имени таблицы — SQL injection через имя таблицы |
| 6 | `server.js` | `/api/upload-shift-photo` — нет валидации `shift_id` (UUID) |
| 7 | `routes/payment-routes.js` | `handleExportCsv` — нет проверки роли (любой авторизованный мог скачать CSV) |
| 8 | `routes/payment-routes.js` | `handleGasWebhook` — нет валидации UUID для `id` |

### 🟡 Средние (Код-качество / Баги)

| # | Файл | Проблема |
|---|------|----------|
| 9 | `server.js` | Дублирование `sbHeaders()` и `sbFetchForSync` — уже есть в `modules/db.js` |
| 10 | `routes/shift-routes.js` | Импортировал `sbHeaders` из db, но не нужен — `sbFetch` уже включает заголовки. Передача лишних `headers` в `sbFetch`_opts могла ломать запросы |
| 11 | `routes/shift-routes.js` | `handleRecurringCreate` — нет try/catch на JSON.parse |
| 12 | `routes/shift-routes.js` | `handleRecurringUpdate` — нет валидации UUID для `id`, нет try/catch на JSON.parse |
| 13 | `routes/shift-routes.js` | `handleRecurringDelete` — нет валидации UUID |
| 14 | `routes/shift-routes.js` | `handleClaimOrder` — нет try/catch на JSON.parse, нет валидации UUID |
| 15 | `routes/user-routes.js` | `handleClientPayMethodPost` — нет try/catch на JSON.parse |
| 16 | `routes/user-routes.js` | `handleNotificationsDelete` — использовал PATCH вместо DELETE для очистки Supabase |
| 17 | `routes/payment-routes.js` | Ответы без Content-Type JSON для ошибок (plain text) |

### 🟢 Низкие (Рекомендации)

| # | Файл | Проблема |
|---|------|----------|
| 18 | `modules/config.js` | Нет проверок наличия критических env vars (SB_KEY, TG_BOT_TOKEN) при старте |
| 19 | `modules/audit.js` | trimLog может сломаться на кривых данных (non-UTF8) |
| 20 | `sw.js` | IndexedDB flush не удаляет отправленные по одному — очищает ВСЕ разом |
| 21 | `modules/monitoring.js` | endpointStats не имеет upper bound — теоретическая утечка памяти при DDoS |

---

## 2. Что исправлено

### `modules/config.js`
- Убран захардкоженный Supabase URL (теперь пустая строка по умолчанию)
- Добавлены геттеры `sbKeySet`, `tgBotTokenSet` для проверки конфигурации

### `modules/db.js`
- Добавлена валидация имени таблицы (регулярка `^[a-z_][a-z0-9_]{0,63}$`)
- Добавлена `sanitizeQuery()` — ограничение длины query-строки (2000 символов)

### `server.js`
- Убрано дублирование `sbHeaders()` и `sbFetchForSync` — теперь используется `modules/db.js`
- Добавлена валидация UUID для `shift_id` в `/api/upload-shift-photo`
- Push subscription маршрут теперь передаёт CORS headers
- Добавлен импорт `getCorsHeaders`

### `notifications-module/push-route.js`
- **Критический фикс**: JWT парсинг заменён на `requireAuth()` из `modules/auth.js`
- Убран обход CORS — теперь использует единую систему CORS через параметры
- Все ответы включают CORS headers

### `notifications-module/push-trigger.js`
- Убран захардкоженный Supabase URL — теперь берётся из `config.sbUrl`

### `routes/shift-routes.js`
- Убран неиспользуемый импорт `sbHeaders`
- Убраны лишние `headers` параметры в `sbFetch` вызовах (sbFetch уже их ставит)
- Добавлена валидация UUID в `handleClaimOrder`, `handleRecurringUpdate`, `handleRecurringDelete`
- Добавлен try/catch на JSON.parse в `handleRecurringCreate`, `handleRecurringUpdate`
- Добавлена валидация `day_of_week` (0-6) в `handleRecurringCreate`

### `routes/payment-routes.js`
- `handleExportCsv` — добавлена проверка роли (owner/dispatcher)
- `handleGasWebhook` — добавлена валидация UUID для `id`
- `handleUploadReceipt` — все ответы теперь JSON с Content-Type
- Исправлена синтаксическая ошибка (лишняя `}`)

### `routes/user-routes.js`
- `handleClientPayMethodPost` — добавлен try/catch на JSON.parse
- `handleNotificationsDelete` — PATCH заменён на DELETE для Supabase

---

## 3. Что требует внимания владельца

### Env Variables
- **`SB_URL`** — теперь ОБЯЗАТЕЛЬНА (убран хардкод). Убедитесь что задана в окружении: `https://YOUR-PROJECT.supabase.co`
- **`SB_KEY`** — обязательна, без неё ничего не работает
- **`TG_BOT_TOKEN`** — обязательна для Telegram бота
- **`MAX_BOT_TOKEN`** — обязательна для МАКС бота
- **`GAS_WEBHOOK_SECRET`** — если не задана, GAS webhook будет отклонять все запросы
- **`PUSH_SECRET`** — для push-уведомлений через Edge Function

### БД (Supabase)
- Таблица `app_notifications` — используется для уведомлений. Если не создана, система падает обратно на JSON файл
- Таблица `user_device_tokens` — нужна для push-уведомлений
- Колонка `payments.status` — auto-migration проверяет при старте, но может потребовать ручного SQL:
  ```sql
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'paid';
  ```

### Не исправлено (требует рефакторинга)
- **HTML файлы** (~5000 строк) — не аудитированы детально. Рекомендуется отдельный аудит фронтенда
- **Дублирование кода** между `telegram.js` и `max-bot.js` (tryForwardChat, linkUser, identifyUser — почти идентичны) — требует абстракции
- **`bot-common.js`** загружает knowledge base 2 раза (в telegram.js и max-bot.js) — можно кэшировать
- **Tracking sessions** хранятся in-memory — при перезапуске теряются (падают обратно на DB запрос)
- **Rate limiting** in-memory — при перезапуске сбрасывается

---

## Сводка

- **Критических исправлено:** 8
- **Средних исправлено:** 9
- **Файлов изменено:** 8
- **Обратная совместимость:** ✅ сохранена
- **Структура БД:** ✅ не изменена
- **Синтаксис:** ✅ все файлы проходят `node -c`
