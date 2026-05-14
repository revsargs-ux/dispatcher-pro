# Code Quality Audit — Dispatcher.PRO
**Дата:** 2026-05-14  
**Аудитор:** OpenClaw (auto)

---

## Сводка

| Критерий | Статус | Серьёзность |
|----------|--------|-------------|
| 🔴 Баг: использование `w` до объявления | **КРИТИЧНО** | 🔴 |
| 🟡 Мёртвый модуль `tracking.js` | Нужно убрать | 🟡 |
| 🟡 44 вызова sbFetch в routes.js (N+1) | Нужно оптимизировать | 🟡 |
| 🟡 Дублирование telegram.js ↔ max-bot.js (~80%) | Нужно рефакторить | 🟡 |
| 🟡 18 .bak файлов (560 KB) | Нужно удалить | 🟡 |
| 🟡 backup/ директория (62 файла, 1.3 MB) | Нужно удалить | 🟡 |
| 🟢 Секреты в config.js (hardcoded) | Безопасность | 🟡 |
| 🟢 code-gs-update.js (1758 строк) | Крупный файл | 🟢 |
| 🟢 index.html (2320 строк) | Крупный файл | 🟢 |

---

## 1. Dead Code Detection

### 🔴 БАГ: Переменная `w` используется до объявления (routes.js ~стр.343)
```js
if (asgn) {
    maxNotify('workers', w.phone, ...); // ← w ещё НЕ объявлена! ReferenceError
    const w = ((await ...)[0]);         // ← объявляется только здесь
```
**Влияние:** При смене `payment_status` через PATCH assignment — `maxNotify()` упадёт с ReferenceError. TG-уведомление после объявления `w` сработает, но МАКС-уведомление нет.  
**Исправление:** Переместить `const w = ...` выше `maxNotify()`, и проверить что `w` не null.

### 🟡 Мёртвый модуль: `modules/tracking.js`
- Файл существует (181 строка), экспортирует `startSession, stopSession, addLocation, getLocations`
- **НИГДЕ не импортируется** — ни в `server.js`, ни в `routes.js`, ни в других модулях
- В routes.js есть отдельные route handlers для трекинга, которые работают напрямую с Supabase (таблицы `tracking_sessions`, `tracking_locations`)
- Модуль tracking.js пишет в таблицу `worker_locations` — **другую таблицу!**
- Запускает `setInterval` для очистки, которые работают вхолостую  
**Решение:** Либо удалить, либо интегрировать. Сейчас это мёртвый код + лишние таймеры.

### 🟡 Неиспользуемые экспорты из tracking.js
Все 6 экспортов (`startSession, stopSession, getActiveSession, addLocation, getLocations, sessions`) не используются.

### 🟢 Неиспользуемые переменные
- `VERSION` в server.js — используется только в логе запуска, это ОК
- `apiLimiter` в routes.js — используется, ОК
- `trackingSessions` в routes.js — используется в route handlers, ОК

---

## 2. Duplicate Code

### 🔴 telegram.js ↔ max-bot.js: ~80% дублирование (474 + 474 = 948 строк)
Полностью дублированная логика:
| Функция | telegram.js | max-bot.js |
|---------|-------------|------------|
| `cmdHelp` | ✅ | ✅ (идентичная) |
| `cmdShifts` | ✅ | ✅ (идентичная) |
| `cmdEarnings` | ✅ | ✅ (идентичная) |
| `cmdOrders` | ✅ | ✅ (идентичная) |
| `cmdSelfEmployed` | ✅ | ✅ (идентичная) |
| `askAI` | ✅ | ✅ (идентичный промпт) |
| `linkUser` | ✅ (tgNotify) | ✅ (linkMaxUser) |
| `identifyUser` | ✅ | ✅ (identifyMaxUser) |
| `calcEarnings` | inline | inline (копипаст) |

**Решение:** Вынести общую логику в `modules/bot-common.js`:
- Команды (help, shifts, earnings, orders, selfemployed)
- AI запрос
- Ключевые слова для маппинга
- Адаптеры отправки: `sendMessage(platform, chatId, text)`

### 🟡 sbHeaders() дублирован
Определён в 3 местах:
1. `routes.js` — `function sbHeaders()`
2. `server.js` — `function sbHeadersBase()` (для миграции) и `const sbHeaders = () => ...` (для GAS sync)
3. `telegram.js` / `max-bot.js` — inline в каждом fetch

**Решение:** Вынести в `config.js` или отдельный `db.js`.

### 🟡 Дублированный pattern: Supabase fetch
Каждый модуль дублирует:
```js
const headers = { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
await fetch(`${config.sbUrl}/rest/v1/...`, { headers })
```
Хотя в routes.js есть `sbFetch()` helper, другие модули его не используют.

---

## 3. Unused Files

### 🔴 .bak файлы (18 штук, ~560 KB)
```
index.html.bak (140K)
index.html.notifications.bak (120K)
index.html.bak.max (127K)
index.html.bak.payment-fix (129K)
client.html.bak.auth (55K)
client.html.bak.fix2 (56K)
client.html.bak.payment-fix (57K)
client.html.notifications.bak (54K)
worker.html.bak.auth (34K)
worker.html.bak.fix2 (34K)
worker.html.bak.gps (35K)
worker.html.notifications.bak (33K)
server.js.bak (2.4K)
server.js.bak.max (2.7K)
sw.js.bak (233B)
sw.js.bak.gps (3.9K)
```

### 🟡 modules/ .bak файлы (7 штук, ~208 KB)
```
modules/config.js.bak
modules/config.js.bak.max
modules/max-bot.js.bak.fix3
modules/max-bot.js.bak.fix4
modules/routes.js.bak
modules/routes.js.bak.gps
modules/routes.js.bak.max
modules/routes.js.bak.payment-fix
modules/routes.js.bak.tracking
modules/telegram.js.bak
modules/telegram.js.bak.bot
modules/telegram.js.bak.fix3
modules/telegram.js.bak.max
```

### 🟡 backups/ директория (62 файла, 1.3 MB)
```
backups/pre-gas-sync/
backups/pre-audit-2026-05-14/
backups/pre-fix-2026-05-12/
backups/pre-completion-2026-05-14/
```

**Рекомендация:** Удалить все .bak файлы и backups/. Git — ваша система бэкапов.

### 🟡 `code-gs-update.js` (1758 строк, 66 KB)
Google Apps Script код, который развёрнут в GAS, а не на сервере. Не подключён к Node.js.  
Это ОК, но стоит пометить как `gas/` или добавить README.

---

## 4. Code Patterns & Issues

### 🔴 Использование переменной до объявления (routes.js)
См. раздел 1. Переменная `w` и `statusNames` используются до `const w = ...` и `const statusNames = ...`.

### 🟡 Отсутствие try/catch в некоторых async handlers
- `handleClaimOrder` — есть try/catch только частично
- Некоторые route handlers не обёрнуты в try/catch:
  - `handleClientPayMethodPost` — `.then()` без `.catch()`
  - `handleNotificationsDelete` — нет try/catch (но simple)

### 🟡 setInterval без clearInterval
Все `setInterval` в проекте не сохраняют ссылки и не очищаются:
- `server.js:35` — очистка receipts (24h)
- `server.js:94` — GAS sync (5min)
- `modules/auth.js:83` — blacklist cleanup (10min)
- `modules/auth.js:162` — rate limit cleanup (10min)
- `modules/monitoring.js:107` — stats cleanup (10min)
- `modules/routes.js:758` — API rate limit cleanup (10min)
- `modules/tracking.js:176-177` — session/location cleanup

**Влияние:** Для сервера это ОК (процесс живёт вечно). Но при тестировании или graceful shutdown — утечки. Низкий приоритет.

### 🟢 console.log
21 console.log/error — в пределах нормы для серверного приложения.

### 🟢 Magic numbers
Основные захардкожены в config.js, что хорошо. Но в routes.js есть:
- `max: 5, windowMs: 300000` (rate limit) — в config ✅
- `120 requests per minute` — захардкожено в routes.js:753
- `60000` (1 min), `600000` (10 min) — в auth.js и routes.js cleanup intervals
- `30` (poll timeout seconds) — в telegram.js, захардкожено

---

## 5. Architecture Review

### Структура модулей
```
server.js          → Entry point (97 строк) ✅ Хорошо
modules/
  config.js        → Конфигурация (65 строк) ✅
  routes.js        → ВСЕ route handlers (863 строки) ⚠️ СЛИШКОМ БОЛЬШОЙ
  auth.js          → JWT + bcrypt (174 строки) ✅
  telegram.js      → TG бот (486 строк) ✅
  max-bot.js       → МАКС бот (474 строки) ⚠️ Дубль telegram.js
  gas-sync.js      → Google Sheets (132 строки) ✅
  monitoring.js    → Метрики (109 строк) ✅
  audit.js         → Аудит лог (67 строк) ✅
  cors.js          → CORS (26 строк) ✅
  tracking.js      → Трекинг (181 строка) ❌ МЁРТВЫЙ
notifications-module/
  push-trigger.js  → Push уведомления ✅
  push-route.js    → Push subscription route ✅
```

### 🟡 routes.js — 863 строки, монолит
Содержит 33 функции-обработчика + роутер. Стоит разбить:
- `routes/auth.js` — login, register, forgot, me, refresh, logout
- `routes/tracking.js` — GPS tracking routes
- `routes/api-proxy.js` — handleApiProxy + handlePostProcess
- `routes/admin.js` — export, upload, receipts
- `routes/index.js` — роутер

### 🟡 Нет circular dependencies
Проверено — зависимости линейные. ✅

### 🟢 config.js — единый источник конфигурации ✅
Все модули импортируют из `./config`. Секреты из env vars (с fallback'ами — см. раздел безопасности).

---

## 6. Performance Concerns

### 🔴 N+1 запросы в handlePostProcess (routes.js)
При создании нового заказа (`POST /shifts`):
1. Fetch client info
2. Fetch service type
3. Fetch shift requirements
4. Fetch dispatchers → loop: sendMessage per dispatcher
5. Loop: sendPushNotification per dispatcher
6. Fetch client again (!) для GAS sync
7. Fetch service type again (!) для GAS sync

**Итого: ~8-12 API вызовов на один POST /api/shifts.**

Аналогично в `handleClaimOrder`: ~8-10 вызовов.

**Решение:** Batch-запросы, Supabase supports `select=*,clients(...),service_types(...)` — многие данные уже есть в join.

### 🟡 handleTrackingWorkersLocation — N+1
Для каждого worker_id делает отдельный запрос к tracking_sessions + tracking_locations.
```js
for (const wid of workerIds) {  // N запросов в цикле
```
**Решение:** Использовать `worker_id=in.(id1,id2,...)` batch запрос.

### 🟢 Gas sync — sequential loop
`gasSyncWorkers` и `gasSyncShifts` делают запросы в цикле последовательно. При большом количестве записей — медленно. Но для текущих объёмов ОК.

---

## 7. File Sizes

| Файл | Строк | Флаг |
|------|-------|------|
| index.html | 2320 | ⚠️ > 500 |
| code-gs-update.js | 1758 | ⚠️ > 500 (GAS, не Node) |
| client.html | 896 | ⚠️ > 500 |
| modules/routes.js | 863 | ⚠️ > 500 |
| worker.html | 812 | ⚠️ > 500 |
| owner.html | 641 | ⚠️ > 500 |
| modules/telegram.js | 486 | ✅ |
| modules/max-bot.js | 474 | ✅ |
| sw.js | 349 | ✅ |
| modules/tracking.js | 181 | ✅ |
| modules/auth.js | 174 | ✅ |
| push-client.js | 148 | ✅ |
| modules/gas-sync.js | 132 | ✅ |
| modules/monitoring.js | 109 | ✅ |
| server.js | 97 | ✅ |
| modules/audit.js | 67 | ✅ |
| modules/config.js | 65 | ✅ |
| modules/cors.js | 26 | ✅ |

**Итого:** 9598 строк кода (без node_modules, backups, .bak).

---

## 8. Security Concerns

### 🔴 Захардкоженные секреты в config.js
```js
maxBotToken: 'f9LHodD0cOLgiq-JgG1JB-vYPJv79mc3jdJNL0xWm9DiMZk4g5gvHjIAzeOwEw_L1K6-BsX92qknFhQVeUTH'
geminiKey: 'e3f35d3da0ff430ea723fac65fcfc2bf.weqojee5xK0xpyEx'
```
**Решение:** Вынести в env vars (`MAX_BOT_TOKEN`, `GEMINI_API_KEY`). Другие секреты уже из env.

### 🟡 Webhook secret в push-trigger.js
```js
const WEBHOOK_SECRET = 'dp_notify_secret_2026';
```
Стоит вынести в env/config.

### 🟡 SQL injection через query builder
URL-параметры напрямую подставляются в Supabase query:
```js
const shiftId = new URLSearchParams(query).get('id')?.replace('eq.', '');
```
Supabase REST API экранирует параметры, но стоит валидировать формат UUID.

---

## 9. Приоритетные действия

### P0 — Критично (сделать сейчас)
1. **Исправить баг с `w` до объявления** в routes.js ~стр.343 — перестают работать МАКС-уведомления об оплате
2. **Удалить мёртвый `modules/tracking.js`** или интегрировать — сейчас работает вхолостую с таймерами

### P1 — Важно (на этой неделе)
3. **Удалить все .bak файлы** (18 шт, 560 KB) + backups/ (62 файла, 1.3 MB)
4. **Вынести секреты из config.js** в env vars (maxBotToken, geminiKey)
5. **Разбить routes.js** на подмодули (auth-routes, tracking-routes, api-proxy)

### P2 — Улучшения (в следующем спринте)
6. **Вынести общую логику ботов** из telegram.js + max-bot.js в bot-common.js (~400 строк экономии)
7. **Оптимизировать N+1 запросы** в handlePostProcess и handleTrackingWorkersLocation
8. **Вынести sbHeaders/sbFetch** в общий db helper

### P3 — Косметика
9. Заменить magic numbers на именованные константы
10. Добавить try/catch в handleClientPayMethodPost
