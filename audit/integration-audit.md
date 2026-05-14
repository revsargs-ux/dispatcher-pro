# Integration Audit: Telegram + МАКС — Dispatcher.PRO

**Дата:** 2026-05-14  
**Аудитор:** Peptide Bot (subagent)

---

## 1. Telegram Bot (modules/telegram.js)

### 1.1 Connection — Long Polling

| Пункт | Статус | Комментарий |
|---|---|---|
| Long polling | ✅ Реализован | `getUpdates` с `timeout=30` |
| Error handling | ✅ Есть | try/catch с логированием |
| Reconnection | ⚠️ Частично | Backoff + cooldown 5 мин после 10 ошибок, но **после cooldown — цикл продолжается бесконечно**, нет глобального лимита |
| Множественные инстансы | ⚠️ Риск | Переменная `pollingActive` не даёт запустить 2 poll loop в одном процессе, но при перезапуске контейнера старый webhook/poll может конфликтовать |

**🔴 КРИТИЧЕСКАЯ ПРОБЛЕМА: HTTP 409 Conflict**
Логи показывают постоянную ошибку `HTTP 409` — это означает что **другой процесс уже забирает updates** (webhook установлен или другой инстанс пушит). Бот полностью неработоспособен для входящих сообщений.

```
[TG] Poll error (1-10/10, retry in 5-50s): HTTP 409
[TG] Max retries, cooling down for 5 minutes...
```
*(Повторяется бесконечно)*

**Решение:** Проверить `getWebhookInfo` и удалить webhook (`deleteWebhook`), либо переключить на webhook-режим вместо polling.

### 1.2 Message Handling

| Пункт | Статус |
|---|---|
| Команды | ✅ `/start`, `/help`, `/shifts`, `/earnings`, `/orders`, `/selfemployed` + русские алиасы |
| Идентификация | ✅ По `telegram_chat_id` → поиск в workers, clients, users |
| Типы сообщений | ⚠️ Только text и contact. Фото, документы, стикеры — игнорируются (без уведомления) |
| Rate limiting | ❌ Нет — пользователь может спамить без ограничений |
| Текст → команды | ✅ Ключевые слова ("смены", "зарплата" и т.д.) мапятся на команды |
| AI fallback | ✅ Всё нераспознанное → ZhipuAI glm-4-plus |

### 1.3 Outgoing Messages

| Пункт | Статус |
|---|---|
| tgNotify | ✅ Ищет пользователя по телефону в таблице, шлёт в telegram_chat_id |
| tgNotifyRole | ✅ Рассылка по роли из БД |
| Форматирование | ✅ HTML parse_mode |
| Hardcoded chat_ids | ✅ Нет — всё из БД |
| Обрезка | ✅ AI ответы обрезаются до 4000 символов |

### 1.4 Security

| Пункт | Статус |
|---|---|
| Bot token | ✅ Из env var `TG_BOT_TOKEN` |
| Неавторизованные | ⚠️ Могут писать /start, но не получат данных. Однако AI будет отвечать незарегистрированным (нет — проверка `user` есть) |
| Command injection | ✅ Нет риска — текст идёт в AI prompt, не в shell |
| SQL injection | ⚠️ Нет SQL, но Supabase REST API параметры не экранируются (ilike с `%25`). Риск минимален для PostgREST |

### 1.5 Дополнительные проблемы

- **`/start <phone>` — позволяет привязать чужой аккаунт** если знаешь chat_id и номер телефона. Нет верификации.
- **AI API key захардкожен** в config.js: `geminiKey: process.env.GEMINI_API_KEY || 'e3f35d3d...'` — если env var не установлена, используется fallback-ключ прямо в коде.
- **МАКС Bot Token захардкожен**: `maxBotToken: process.env.MAX_BOT_TOKEN || 'f9LHod...'` — аналогично.

---

## 2. МАКС Bot (modules/max-bot.js)

### 2.1 Connection — Long Polling

| Пункт | Статус |
|---|---|
| Long polling | ✅ Через `platform-api.max.ru/updates` с timeout=25 |
| Error handling | ✅ try/catch + backoff |
| Reconnection | ⚠️ Аналогично TG — cooldown после 10 ошибок, бесконечный цикл |
| Marker tracking | ✅ Используется `marker` из ответа API |

**Логи:** MAX polling перезапускается несколько раз (`[MAX] Polling started` × 5 в логах), но нет явных ошибок — видимо, процесс перезапускался. Один timeout замечен: `The operation was aborted due to timeout`.

### 2.2 Message Handling

| Пункт | Статус |
|---|---|
| bot_started | ✅ Аналог /start |
| message_created | ✅ Текстовые сообщения |
| Идентификация | ✅ По `max_chat_id` → workers, clients, users |
| Команды | ✅ Те же что у TG: /help, /shifts, /earnings, /orders, /selfemployed |
| Ключевые слова | ✅ Аналог TG |
| AI fallback | ✅ Тот же ZhipuAI |

### 2.3 Outgoing Messages

| Пункт | Статус |
|---|---|
| maxSendMessage | ✅ Через `platform-api.max.ru/messages` |
| maxNotify | ✅ Ищет `max_chat_id` в таблице по телефону |
| maxNotifyRole | ✅ Рассылка по роли |
| Форматирование | ⚠️ Нет HTML (простой текст) — МАКС может не поддерживать HTML, но нужно проверить |

### 2.4 Security

- Те же проблемы с захардкоженными ключами в config.js
- Нет rate limiting

### 2.5 Дублирование кода

🔴 **Значительное дублирование** между telegram.js и max-bot.js:
- `cmdHelp`, `cmdShifts`, `cmdEarnings`, `cmdOrders`, `cmdSelfEmployed` — полностью скопированы
- `askAI` — идентичный, отличается только `sendMessage`
- `linkUser` — идентичный логически
- `handleMessage` — идентичный flow

**Рекомендация:** Вынести общую логику в `bot-common.js`, платформенные адаптеры — тонкие обёртки.

---

## 3. Cross-integration Issues

### 3.1 Взаимная блокировка
| Пункт | Статус |
|---|---|
| Раздельные polling loops | ✅ TG и МАКС поллят независимо |
| Общая БД (Supabase) | ⚠️ Да — если Supabase ляжет, оба бота перестанут работать |
| Общий AI endpoint | ⚠️ Да — ZhipuAI. Если API упадёт — оба бота не смогут отвечать на неизвестные вопросы |

### 3.2 Shared State
- **Нет общих переменных** между модулями — каждый модуль независим ✅
- **Polling loops не блокируют друг друга** — оба while-loops в event loop Node.js ✅
- **При падении одного бота — второй продолжает работать** ✅

### 3.3 Мониторинг
- Логи показывают **ошибку 50-60%** в monitoring — это не связано с ботами напрямую, но высокая error rate
- Нет health-check endpoint для проверки статуса polling

---

## 4. Summary — Приоритеты исправления

### 🔴 Критическое
1. **TG HTTP 409** — бот полностью неработоспособен для входящих. Нужно: `curl https://api.telegram.org/bot<TOKEN>/deleteWebhook`, затем проверить что polling работает.
2. **Захардкоженные API ключи** в config.js (MAX bot token, Gemini/ZAI key) — должны быть ТОЛЬКО из env vars без fallback.

### 🟡 Важное
3. **Rate limiting** — нет защиты от спама в обоих ботах
4. **Привязка без верификации** — `/start <phone>` позволяет привязать чужой номер
5. **Дублирование кода** — ~80% max-bot.js это копия telegram.js
6. **Необработанные типы сообщений** — фото/голос/стикеры молча игнорируются

### 🟢 Желательное
7. Health-check endpoint для мониторинга polling статуса
8. Graceful shutdown (остановка polling при SIGTERM)
9. Логирование идентификаторов update_id для отладки
10. Структурированные логи вместо console.log

---

*Отчёт создан автоматически.*
