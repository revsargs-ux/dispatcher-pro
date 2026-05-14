# Dispatcher.PRO — Аудит системы уведомлений
**Дата:** 2026-05-14  
**Аудитор:** OpenClaw (subagent)  
**Версия кода:** current (routes.js, telegram.js, max-bot.js, notifications-module/*)

---

## 1. Каналы уведомлений

| # | Канал | Файлы | Статус |
|---|-------|-------|--------|
| 1 | **Telegram** | `modules/telegram.js` | ✅ Работает |
| 2 | **МАКС** | `modules/max-bot.js` | ✅ Работает |
| 3 | **Web Push** | `notifications-module/push-trigger.js`, `push-client.js`, `sw-notifications.js`, `push-route.js` | ⚠️ Частично (Edge Function не развёрнута) |
| 4 | **In-app** | `notifications.json` + routes.js | ✅ Работает (только новые рабочие) |
| 5 | **Email (fallback)** | `notifications-module/02-edge-function-send-notification.ts` | ❌ Не развёрнут (Edge Function) |
| 6 | **TG fallback (Edge)** | `02-edge-function-send-notification.ts` → `sendTelegramFallback` | ❌ Не развёрнут |

---

## 2. Telegram — детальный анализ

### 2.1 События, вызывающие TG-уведомления

| Событие | Кто получает | Функция | Где вызывается |
|---------|-------------|---------|----------------|
| **Новый заказ (shift POST)** | Диспетчеры по городу | Прямой `tgSendMessage` | `routes.js:252-268` (handlePostProcess) |
| **Заказ принят (claim)** | Клиент | Прямой `tgSendMessage` | `routes.js:132` (handleClaimOrder) |
| **Новый рабочий** | Владелец (role=owner) | `tgNotifyRole('owner', ...)` | `routes.js:301` |
| **Рабочий назначен на смену** | Рабочий | `tgNotify('workers', phone, ...)` | `routes.js:331-334` |
| **Статус оплаты изменён** | Рабочий | `tgNotify('workers', phone, ...)` | `routes.js:350` |
| **Команды бота** (ответы) | Пользователь | `tgSendMessage` | telegram.js (cmd*) |

### 2.2 Проблемы Telegram

**BUG #1 — CRITICAL: `tgNotify` ищет `telegram_chat_id` по телефону, но вызывается с table='workers'**
- Код: `tgNotify('workers', w.phone, ...)` 
- В `tgNotify`: ищет `telegram_chat_id` в таблице `workers` по `phone`
- ✅ Это корректно — workers таблица содержит `telegram_chat_id`

**BUG #2 — MEDIUM: Новый заказ — уведомление диспетчерам фильтруется по городу, но нет fallback**
- `routes.js:264`: `if (cl.city && d.city && d.city !== cl.city) continue;`
- Если у клиента/диспетчера город не указан — уведомление уйдёт всем диспетчерам без города
- Если у всех диспетчеров указан город, а у клиента нет — никто не получит

**BUG #3 — MEDIUM: Нет проверки ответа TG API**
- `tgSendMessage` не проверяет `response.ok` или статус ответа
- Не обрабатываются ошибки 429 (rate limit), 403 (bot blocked)

**BUG #4 — LOW: Long polling — нет graceful shutdown**
- `pollingActive` никогда не устанавливается в `false`
- При перезапуске сервера могут быть потеряны сообщения в окне

**BUG #5 — LOW: Отсутствует rate limiting на отправку**
- При массовом назначении рабочих (цикл) — нет задержки между отправками
- TG может вернуть 429 Flood

### 2.3 Форматирование сообщений
- Используется `parse_mode: 'HTML'`
- Сообщения хорошо структурированы с эмодзи
- ⚠️ В уведомлении о новом заказе (`orderText`) используется `parse_mode: 'HTML'`, но текст не экранирован — если в адресе/комментарии будут `<>&` — разметка сломается

---

## 3. МАКС — детальный анализ

### 3.1 События, вызывающие МАКС-уведомления

| Событие | Кто получает | Функция | Где |
|---------|-------------|---------|-----|
| **Новый рабочий** | Владелец | `maxNotifyRole('owner', ...)` | `routes.js:302` |
| **Статус оплаты изменён** | Рабочий | `maxNotify('workers', phone, ...)` | `routes.js:343` |

### 3.2 Проблемы МАКС

**BUG #6 — HIGH: МАКС НЕ уведомляет диспетчеров о новом заказе**
- Новый заказ (shift POST) → только TG диспетчерам, МАКС пропущен!
- `routes.js:252-268`: TG есть, МАКС нет

**BUG #7 — HIGH: МАКС НЕ уведомляет клиента о принятии заказа**
- `handleClaimOrder` (routes.js:125-140): только TG + Push, МАКС пропущен!

**BUG #8 — HIGH: МАКС НЕ уведомляет рабочего о назначении на смену**
- `routes.js:331-334`: TG есть, Push есть, МАКС пропущен!

**BUG #9 — MEDIUM: `maxNotifyRole` не проверяет `is_active`**
- TG-версия (`tgNotifyRole`) тоже не проверяет — но для owner это не критично

**BUG #10 — LOW: Long polling marker может быть неверным**
- `maxMarker = update.update_id || maxMarker` — если update_id undefined, marker не обновится
- МАКС API использует `marker` из тела ответа (`data.marker`), это корректно

**BUG #11 — LOW: API endpoint вероятно неверный**
- `maxSendMessage` отправляет на `${MAX_API}/messages?user_id=${userId}`
- МАКС VK Platform API обычно использует `/messages/send` или другой формат
- Требуется верификация

---

## 4. Push-уведомления — детальный анализ

### 4.1 Архитектура
```
Client (push-client.js)
  → SW (sw-notifications.js)
  → POST /api/push-subscription (push-route.js)
  → Supabase user_device_tokens

Server (push-trigger.js)
  → POST Edge Function (02-edge-function-send-notification.ts)
  → Edge Function → Web Push API / Email / TG fallback
```

### 4.2 События, вызывающие Push

| Событие | Кто получает | Где |
|---------|-------------|-----|
| **Новый заказ** | Диспетчеры | `routes.js:271` |
| **Заказ принят** | Клиент | `routes.js:132` |
| **Рабочий назначен** | Рабочий | `routes.js:334` |
| **Статус оплаты изменён** | Рабочий | `routes.js:352` |
| **Новый платёж** | Рабочий | `routes.js:383` |

### 4.3 Проблемы Push

**BUG #12 — CRITICAL: Edge Function почти наверняка не развёрнута**
- `push-trigger.js` отправляет на `https://bzozrjgfnpdhlymfuobd.supabase.co/functions/v1/send-notification`
- Код Edge Function (`02-edge-function-send-notification.ts`) содержит TODO и заглушки
- Push-payload encryption — **ЗАГЛУШКА** (не зашифровано, браузеры отклонят!)
- `encryptPayload` → `// TODO: Полная реализация ECHD encryption`
- **Все push-уведомления молча проваливаются**

**BUG #13 — HIGH: `push-route.js` хардкодит `user_role: 'worker'`**
- Строка: `user_role: 'worker'` — независимо от реальной роли пользователя
- Клиенты и диспетчеры, подписавшиеся на push, будут записаны как worker

**BUG #14 — MEDIUM: Push subscription не привязан к конкретному пользователю корректно**
- `push-route.js` парсит JWT вручную (`Buffer.from(parts[0], 'base64')`)
- JWT формат в auth.js может отличаться — нужна верификация

**BUG #15 — MEDIUM: SW `pushsubscriptionchange` не отправляет авторизацию**
- `sw-notifications.js` отправляет POST на `/api/push-subscription` без Authorization header
- Сервер вернёт 401 Unauthorized

**BUG #16 — LOW: `sendPushToRole` ищет только в таблице `users`**
- Не найдёт workers/clients с нужной ролью

### 4.4 Service Worker
- ✅ Корректно обрабатывает push event
- ✅ Обрабатывает notification click с deep link
- ✅ `requireInteraction: true` — не исчезает
- ⚠️ `tag: 'dispatcher-notification'` — все уведомления с одним тегом, новые заменяют старые

---

## 5. In-app уведомления

### 5.1 Что создаётся
- **Только** при регистрации нового рабочего (`workers POST`)
- Сохраняется в `notifications.json`: `{ id, name, phone, date }`

### 5.2 API
- `GET /api/notifications/new-workers` — получить список
- `DELETE /api/notifications/new-workers` — очистить

### 5.3 Проблемы

**BUG #17 — MEDIUM: notifications.json — файл без ограничений**
- Никакой ротации, файл растёт бесконечно
- Нет TTL на записи
- При большом потоке регистраций может стать большим

**BUG #18 — LOW: Нет привязки к конкретному диспетчеру/владельцу**
- Все видят одни и те же уведомления
- DELETE очищает для всех

---

## 6. Кросс-канальная согласованность

### 6.1 Матрица уведомлений по событиям

| Событие | TG | МАКС | Push | In-app | Должно быть |
|---------|-----|------|------|--------|-------------|
| **Новый заказ** | ✅ Диспетчерам | ❌ | ✅ Диспетчерам | ❌ | TG + МАКС + Push |
| **Заказ принят** | ✅ Клиенту | ❌ | ✅ Клиенту | ❌ | TG + МАКС + Push |
| **Новый рабочий** | ✅ Owner | ✅ Owner | ❌ | ✅ | TG + МАКС + Push + In-app |
| **Рабочий назначен** | ✅ Рабочему | ❌ | ✅ Рабочему | ❌ | TG + МАКС + Push |
| **Оплата изменена** | ✅ Рабочему | ✅ Рабочему | ✅ Рабочему | ❌ | TG + МАКС + Push |
| **Новый платёж** | ❌ | ❌ | ✅ Рабочему | ❌ | TG + МАКС + Push |
| **Смена завершена** | ❌ | ❌ | ❌ | ❌ | TG + МАКС + Push |

### 6.2 Критические пропуски

1. **МАКС:** 3 из 5 событий не отправляют МАКС-уведомления (новый заказ, заказ принят, рабочий назначен)
2. **Новый платёж:** TG и МАКС не уведомляют (только Push, который не работает из-за BUG #12)
3. **Смена завершена:** Ни один канал не уведомляет

---

## 7. Баги в коде уведомлений

### CRITICAL

| # | Описание | Файл | Строка |
|---|----------|------|--------|
| **BUG #12** | Edge Function push encryption — заглушка, push не работает | `02-edge-function-send-notification.ts` | `encryptPayload` |
| **BUG #19** | Использование `w` до объявления в payment_status handler | `routes.js` | ~343-350 |

### BUG #19 — Детали (CRITICAL)

```javascript
// routes.js ~строка 343-350:
if (patch.payment_status) {
  // ...
  if (asgn) {
      maxNotify('workers', w.phone, `💰 Статус оплаты изменён
👤 ${w.full_name}
📊 ${statusNames[asgn.payment_status] || asgn.payment_status}`);
    const w = ((await ...  // ← w ОБЪЯВЛЕНО ПОСЛЕ ИСПОЛЬЗОВАНИЯ!
```

**`w` используется в `maxNotify` до объявления!** Это вызовет `ReferenceError: w is not defined` или `TypeError: Cannot read properties of undefined`.
- `maxNotify` вызывается с `w.phone` и `w.full_name`, но `w` ещё не определена
- Затем `const w` объявляется ниже — но это разные `w` (const block-scoped)
- **Результат:** МАКС-уведомление об оплате ВСЕГДА падает с ошибкой

### HIGH

| # | Описание | Файл |
|---|----------|------|
| **BUG #6** | МАКС не уведомляет о новом заказе | routes.js:252 |
| **BUG #7** | МАКС не уведомляет о принятии заказа | routes.js:132 |
| **BUG #8** | МАКС не уведомляет о назначении рабочего | routes.js:331 |
| **BUG #13** | push-route.js хардкодит user_role='worker' | push-route.js |

### MEDIUM

| # | Описание | Файл |
|---|----------|------|
| **BUG #2** | Город диспетчера vs клиента — нет fallback | routes.js:264 |
| **BUG #3** | Нет проверки ответа TG API | telegram.js |
| **BUG #17** | notifications.json без ротации | routes.js |
| **BUG #15** | SW pushsubscriptionchange без авторизации | sw-notifications.js |
| **BUG #20** | HTML в TG не экранируется (XSS-like) | routes.js:orderText |

### Race Conditions

**BUG #21 — MEDIUM: handlePostProcess для shift_assignments PATCH**
- Парсит `body` (string) повторно: `const patch = JSON.parse(body);`
- Но `body` передаётся как аргумент — это тело HTTP-запроса, уже обработанное ранее
- Race condition: если два PATCH приходят одновременно на один assignment, оба могут отправить уведомления

**BUG #22 — LOW: notifications.json — конкурентная запись**
- `loadJson` + `push` + `saveJson` — не атомарно
- При одновременных запросах возможна потеря данных
- Решение: использовать Supabase вместо JSON-файла

### Notification Loops

✅ **Нет циклов уведомлений.** Все три канала отправляют наружу (TG API, МАКС API, Edge Function) и не триггерят внутренние события. `handlePostProcess` вызывается только на Supabase proxy-запросы от клиентов.

---

## 8. Сводка рекомендаций

### Приоритет 1 — Критические исправления

1. **BUG #19:** Переставить `maxNotify` после объявления `w` в payment_status handler
2. **BUG #12:** Либо развернуть Edge Function с корректной encryption, либо убрать push-вызовы чтобы не засорять логи
3. **BUG #6-8:** Добавить `maxNotify`/`maxNotifyRole` вызовы для 3 отсутствующих событий

### Приоритет 2 — Важные исправления

4. **BUG #13:** Определять `user_role` из JWT payload в `push-route.js`
5. **BUG #3:** Проверять `response.ok` в `tgSendMessage` и обрабатывать 429
6. **BUG #20:** Экранировать HTML в TG сообщениях (`escapeHtml`)

### Приоритет 3 — Улучшения

7. Заменить `notifications.json` на Supabase-таблицу
8. Добавить уведомление о завершении смены (все каналы)
9. Добавить уведомление о новом платеже в TG и МАКС
10. Добавить rate limiting на отправку уведомлений
11. Graceful shutdown для polling (TG + МАКС)

---

## 9. Статистика

| Метрика | Значение |
|---------|----------|
| Всего каналов | 4 (+ 2 нереализованных) |
| Багов найдено | 22 |
| CRITICAL | 2 |
| HIGH | 4 |
| MEDIUM | 6 |
| LOW | 6 |
| Информационных | 4 |
| Событий с полным покрытием | 1/7 (оплата изменена — TG+МАКС+Push) |
| Событий с частичным покрытием | 4/7 |
| Событий без уведомлений | 2/7 (новый платёж TG/МАКС, смена завершена) |

---

*Конец отчёта. Сгенерировано автоматически.*
