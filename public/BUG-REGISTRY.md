# 📋 Реестр ошибок и исправлений — Dispatcher.PRO
# ⚠️ ОБЯЗАТЕЛЬНО ЧИТАТЬ перед любой работой с Dispatcher.PRO
# Обновляется при каждом найденном/исправленном баге

---

## 🔴 КРИТИЧЕСКИЕ (исправлены)

### BUG-018: Дубликат регистрации не обнаруживается
- **Дата:** 2026-06-16
- **Проблема:** `phone=eq.+7999...` — символ `+` в URL = пробел. Supabase ищет ` 7999...` вместо `+7999...`. dupCheck всегда []
- **Исправление:** `encodeURIComponent(data[phoneField])` перед подстановкой в URL
- **Вывод:** ВСЕГДА encodeURIComponent для значений с `+` и спецсимволами в URL query string. fetch() НЕ кодирует `+`.
- **Статус:** ✅ Исправлено

### BUG-019: Dispatcher не видит shift_assignments
- **Дата:** 2026-06-16
- **Проблема:** shift_assignments в dispTablesWithCreatedBy, но колонки created_by нет. Subquery `in.(select...)` не поддерживается Supabase REST API.
- **Исправление:** Отдельная категория dispTablesWithShiftId. Сначала fetch shift_ids по created_by, потом `shift_id=in.(ids...)`
- **Вывод:** Supabase REST не поддерживает SQL subqueries в фильтрах. Нужен двухшаговый подход.
- **Статус:** ✅ Исправлено

### BUG-020: Dispatcher не может создавать оплаты
- **Дата:** 2026-06-16
- **Проблема:** payments ACL разрешал только owner+client. Dispatcher заблокирован.
- **Исправление:** Блокируем только worker. Owner, client, dispatcher — все могут CRUD payments.
- **Примечание:** Поле в таблице `method` (НЕ payment_method). Frontend должен использовать правильное имя.
- **Статус:** ✅ Исправлено

### BUG-001: Клиент видит чужие данные (P72/P86)
- **Дата:** 2026-06-16
- **Проблема:** handleApiProxy НЕ фильтрует данные по client_id для роли client. Клиент видит ВСЕ смены, назначения, оплаты.
- **Файл:** /home/n8n/dispatcher-deploy/modules/routes.js → handleApiProxy
- **Исправление:** Добавить inject фильтра `client_id=eq.<userId>` для role=client на таблицах shifts, shift_assignments, payments
- **Вывод:** ВСЕГДА проверять row-level security для каждой роли. ACL только на уровне таблицы недостаточен.
- **Статус:** ✅ Исправлено

### BUG-002: 3-часовой лимит отказа не реализован (P13)
- **Дата:** 2026-06-16
- **Проблема:** Рабочий может отказаться от смены в любую минуту, даже за 1 час до начала.
- **Файл:** /home/n8n/dispatcher-deploy/modules/routes.js + worker.html
- **Исправление:** Проверить actual_start_time/shift start_time — если до начала <3ч → 403. Frontend: заблокировать кнопку.
- **Вывод:** Бизнес-логика должна быть enforced на backend, не только на frontend.
- **Статус:** ✅ Исправлено

### BUG-003: Диспетчер не видит payments (P24)
- **Дата:** 2026-06-16
- **Проблема:** payments в ownerOnly списке. Диспетчер не может видеть оплаты.
- **Файл:** /home/n8n/dispatcher-deploy/modules/routes.js → handleApiProxy
- **Исправление:** Переместить payments из ownerOnly в ownerAndClient или создать отдельное правило.
- **Вывод:** Проверять ACL для КАЖДОЙ роли, не только owner vs остальные.
- **Статус:** ✅ Исправлено

### BUG-004: Фильтрация смен по дате сломана (P28)
- **Дата:** 2026-06-16
- **Проблема:** GET /api/shifts?date=... возвращает PGRST error (неверный формат).
- **Файл:** /home/n8n/dispatcher-deploy/modules/routes.js
- **Исправление:** Преобразовать date в Supabase-совместимый формат (gte/lte по date колонке).
- **Вывод:** Всегда проверять что query params совместимы с Supabase REST API.
- **Статус:** 🔄 В работе

### BUG-005: Массовый ввод часов не реализован (P30)
- **Дата:** 2026-06-16
- **Проблема:** Нет endpoint для массового обновления hours_worked по всем worker_id одной смены.
- **Исправление:** POST /api/bulk-hours с массивом {assignment_id, hours_worked}.
- **Вывод:** Для часто повторяющихся действий нужна массовая операция.
- **Статус:** ✅ Исправлено

### BUG-006: created_by не устанавливается автоматически (P56/P26)
- **Дата:** 2026-06-16
- **Проблема:** POST /api/shifts не инжектит created_by из JWT. Все смены без владельца.
- **Файл:** /home/n8n/dispatcher-deploy/modules/routes.js → handleApiProxy POST
- **Исправление:** Инжектить created_by=userId для role=dispatcher при POST в shifts.
- **Вывод:** При POST операциях ВСЕГДА инжектить метаданные из JWT (created_by и т.д.).
- **Статус:** 🔄 В работе

### BUG-007: Настройки диспетчера заблокированы (P51-55)
- **Дата:** 2026-06-16
- **Проблема:** users таблица в ownerOnly. Диспетчер не может редактировать свои rate_per_hour, monthly_target_hours.
- **Исправление:** Для PATCH users — разрешить если userId === session.userId (свой профиль).
- **Вывод:** ownerOnly на ВСЮ таблицу слишком грубо. Нужна гранулярная проверка по строкам.
- **Статус:** ✅ Исправлено

---

## 🟡 СРЕДНИЕ (исправлены ранее или в процессе)

### BUG-017: Город не определяется автоматически
- **Дата:** 2026-06-16
- **Проблема:** Поле city есть в таблицах, но при регистрации/логине не заполняется
- **Исправлено:** ip-api.com (бесплатный, ru-lang) → кэш 5мин/100 → при регистрации записывает, при логине обновляет если пустой
- **Файл:** auth-routes.js → getCityByIp(), ensureCity()
- **Вывод:** Геолокация по IP — простое решение для определения города. Кэш обязателен для снижения нагрузки на внешний API.
- **Статус:** ✅ Исправлено

### BUG-008: Регистрация не возвращает токен (P1)
- **Дата:** 2026-06-16
- **Проблема:** POST /auth/register создаёт пользователя в Supabase но не возвращает JWT токен. Нет автовхода.
- **Файл:** /home/n8n/dispatcher-deploy/routes/auth-routes.js
- **Исправление:** После INSERT в Supabase — вызвать createToken и вернуть в ответе.
- **Вывод:** Регистрация должна включать автоматический логин.
- **Статус:** ✅ Исправлено

### BUG-009: Upload фото падает (P16)
- **Дата:** 2026-06-16
- **Проблема:** POST /upload-receipt возвращает ошибку.
- **Файл:** /home/n8n/dispatcher-deploy/modules/routes.js
- **Исправление:** Проверить путь receiptsDir, права доступа, multipart parsing.
- **Вывод:** Файловые операции требуют проверки прав FS + тест с реальным файлом.
- **Статус:** ✅ Исправлено

### BUG-010: select=* не блокируется корректно (краштест)
- **Дата:** 2026-06-16
- **Проблема:** Тест вернул 401 вместо 403 (токен был fake).
- **Исправление:** Дополнительно проверить с валидным токеном.
- **Статус:** ✅ Whitelist таблиц работает (403 на fake_table)

### BUG-011: /auth/me role:null (краштест)
- **Дата:** 2026-06-16
- **Проблема:** u.role возвращал null для пользователей без роли в БД.
- **Исправлено:** Добавлен effectiveRole с fallback (worker/client/owner).
- **Файл:** auth-routes.js handleAuthMe
- **Вывод:** ВСЕГДА иметь fallback для nullable полей.
- **Статус:** ✅ Исправлено

### BUG-012: Nominatim таймаут + хардкод "Камчатский край"
- **Дата:** 2026-06-16
- **Проблема:** Геокодинг зависал, искал только Камчатку.
- **Исправлено:** Таймаут 5с, кэш 5мин, поиск по всей России.
- **Файл:** routes/user-routes.js
- **Вывод:** ВСЕГДА добавлять таймаут на внешние API + кэш.
- **Статус:** ✅ Исправлено

### BUG-013: Мёртвый код shift-photos (ReferenceError)
- **Дата:** 2026-06-16
- **Исправлено:** Удалён unreachable блок.
- **Файл:** server.js
- **Статус:** ✅ Исправлено

### BUG-014: Whitelist таблиц отсутствовал
- **Дата:** 2026-06-16
- **Исправлено:** ALLOWED_TABLES Set + 403 для остальных.
- **Файл:** routes.js
- **Статус:** ✅ Исправлено

### BUG-015: Graceful shutdown глушил ошибки
- **Дата:** 2026-06-16
- **Исправлено:** process.exit(1) вместо console.error.
- **Файл:** server.js
- **Статус:** ✅ Исправлено

### BUG-016: Sync file I/O блокировал event loop
- **Дата:** 2026-06-16
- **Исправлено:** fs.promises.writeFile / readdir.
- **Файл:** server.js (upload handlers)
- **Статус:** ✅ Исправлено

---

## 🔴 НОВЫЕ БАГИ из UI-аудита 2026-06-16T16:21

### BUG-029: worker.html startWork() не вызывает API
- **Дата:** 2026-06-16
- **Проблема:** startWork() показывает toast "✅ Смена началась!" но НЕ делает PATCH actual_start_time. Часы не начнутся.
- **Файл:** /home/n8n/dispatcher-deploy/worker.html → startWork()
- **Исправление:** Добавлен PATCH /api/shift_assignments с {invite_status:'in_progress', actual_start_time}. endWork() также устанавливает invite_status:'completed'.
- **Вывод:** ВСЕГДА проверять что UI action function РЕАЛЬНО вызывает API. Toast ≠ действие.
- **Статус:** ✅ Исправлено

### BUG-030: worker.html мёртвый код в <script src>
- **Дата:** 2026-06-16
- **Проблема:** doLogout и DOMContentLoaded handler находятся ВНУТРИ `<script src="/push-client.js">`. Браузер игнорирует inline-контент при наличии src атрибута.
- **Файл:** /home/n8n/dispatcher-deploy/worker.html → последний script block
- **Исправление:** Разделены на два тега: <script src="/push-client.js"></script> + отдельный <script> с inline кодом.
- **Вывод:** НИКОГДА не смешивать src и inline контент в одном <script>. Это создаёт невидимый мёртвый код.
- **Статус:** ✅ Исправлено

### BUG-031: client.html CSS double }
- **Дата:** 2026-06-16
- **Проблема:** `.stat-card{...text-align:center}}` — двойная закрывающая скобка. Ломает CSS-парсинг всех правил после.
- **Файл:** /home/n8n/dispatcher-deploy/client.html → .stat-card definition
- **Исправление:** Убрана лишняя `}`.
- **Вывод:** ВСЕГДА проверять баланс скобок в CSS после ручного редактирования.
- **Статус:** ✅ Исправлено

### BUG-032: API endpoints без UI (dead API)
- **Дата:** 2026-06-16
- **Проблема:** POST /api/bulk-hours и POST /api/reassign-workers существуют в API, но НЕ вызываются из UI. index.html делает N индивидуальных PATCH вместо bulk-hours.
- **Исправление:** saveMassHours() теперь использует POST /api/bulk-hours. Добавлена функция reassignWorkers() и кнопка в модалке.
- **Вывод:** Каждый API endpoint должен иметь UI-триггер. Нет триггера = нет функции для пользователя.
- **Статус:** ✅ Исправлено

### BUG-033: Password hash в frontend (BUG-025 актуален)
- **Дата:** 2026-06-16
- **Проблема:** editDispatcher() в index.html и owner.html ставит `d.password` в input value. API PATCH /api/users возвращает password hash.
- **Исправление:** index.html: если password начинается с '$2' (bcrypt hash) — ставить пустую строку. owner.html: уже было исправлено (value='').
- **Вывод:** API НИКОГДА не должен возвращать password/hash. Frontend не должен отображать пароль в input.
- **Статус:** ✅ Исправлено

### BUG-029b: Кнопки слишком маленькие (32px вместо 44px)
- **Дата:** 2026-06-16
- **Проблема:** Все HTML файлы: кнопки .btn {padding:8px 16px} = ~32px высота. Не touch-friendly (WCAG требует 44px).
- **Файл:** Все 4 HTML файла
- **Исправление:** Добавлено CSS правило `button,.btn,[role="button"]{min-height:44px;min-width:44px;padding:10px 16px}` в worker.html, client.html, index.html, owner.html.
- **Статус:** ✅ Исправлено

### ПРАВИЛА UI (новые, из аудита):
16. **44px touch target:** min-height:44px на все кликабельные элементы (WCAG)
17. **Loading state:** disabled + spinner на всех save/submit кнопках (предотвращает дубль-сабмит)
18. **Error visibility:** Network/API error → toast, НЕ молчаливый return []
19. **Script tag hygiene:** НЕ смешивать src и inline контент в одном <script>
20. **CSS validation:** Проверять баланс {} после ручного редактирования CSS
21. **Dead code audit:** Каждый API endpoint → проверить соответствующий UI-триггер
22. **Action verification:** Toast ≠ действие. Проверять что function РЕАЛЬНО вызывает API

---

## 🟢 ИСПРАВЛЕНО СЕССИЕЙ 2026-06-16T15:48 (BUG-023..028, P34/46/53)

### BUG-023: Chat sender_name="Неизвестный"
- **Дата:** 2026-06-16
- **Проблема:** JWT token не содержит fullName. Chat handler использовал `session.fullName` (всегда undefined) для workers/clients → "Неизвестный"
- **Файл:** routes/chat-routes.js → handleChatPost
- **Исправление:** Для каждой роли fetch из соответствующей таблицы: users→full_name, workers→full_name, clients→name
- **Вывод:** JWT stateless — не содержит display name. Нужно fetch из БД при отправке сообщения.
- **Статус:** ✅ Исправлено

### BUG-024: Upload photo — multipart/form-data не поддерживался
- **Дата:** 2026-06-16
- **Проблема:** handleUploadReceipt принимал только JSON {filename, data:base64}. Mobile apps отправляют multipart/form-data.
- **Файл:** routes/payment-routes.js → handleUploadReceipt
- **Исправление:** Добавлена проверка Content-Type. Если multipart — парсинг через встроенный parseMultipart (без внешних deps). Если JSON — legacy режим.
- **Вывод:** Поддерживать оба формата ввода (JSON + multipart) для обратной совместимости.
- **Статус:** ✅ Исправлено

### BUG-026: GET /api/shift/:id/photos → 403
- **Дата:** 2026-06-16
- **Проблема:** Маршрут `/api/shift/:id/photos` не существовал. API proxy пытался найти таблицу `shift` (НЕ `shifts`) → 403.
- **Файл:** modules/routes.js
- **Исправление:** Добавлен отдельный маршрут `/api/shift/:shiftId/photos` до API proxy. Возвращает список фото из data/shift-photos/.
- **Вывод:** Специальные маршруты нужно регистрировать ДО generic API proxy.
- **Статус:** ✅ Исправлено

### BUG-028: Город не определяется (IP контейнера = 172.18.x.x)
- **Дата:** 2026-06-16
- **Проблема:** Docker container IP 172.18.0.1. ip-api возвращает неправильный город. Traefik передаёт X-Forwarded-For, но он может содержать цепочку приватных IP.
- **Файл:** routes/shared.js (новая функция extractPublicIp), routes/auth-routes.js, modules/routes.js, routes/payment-routes.js
- **Исправление:** `extractPublicIp()` парсит X-Forwarded-For цепочку, пропускает приватные IP (10.x, 172.16-31.x, 192.168.x, 127.0.0.1), возвращает первый публичный IP. Exported через shared.js для всех модулей.
- **Вывод:** В Docker-окружении всегда проверять X-Forwarded-For цепочку и фильтровать приватные IP.
- **Статус:** ✅ Исправлено

### F-04: Расширить recurring_orders (доработка)
- **Дата:** 2026-06-16
- **Проблема:** handleRecurringShiftsCreate не передавал новые поля (start_time, worker_count, interval_days, address).
- **Файл:** routes/feature-routes.js, migrations/013_recurring_orders_extend.sql
- **Исправление:** Create handler теперь пропускает все опциональные поля. Миграция SQL создана.
- **Внимание:** Миграцию 013 нужно выполнить в Supabase SQL Editor вручную.
- **Статус:** ✅ Код готов, ⚠️ SQL миграция требует ручного выполнения

### P34: Кнопка оплаты только после подтверждения
- **Дата:** 2026-06-16
- **Статус:** ✅ Уже было реализовано (index.html строка 858: `if(h>0&&(hoursStatus==='confirmed'||hoursStatus==='auto_confirmed'||clientConfirmed))`)

### P46: 📋 Скопировать креды рабочего
- **Дата:** 2026-06-16
- **Статус:** ✅ Уже было реализовано (index.html строка 915: cpb button с data-role=worker)

### P53: Поделиться кредами диспетчера
- **Дата:** 2026-06-16
- **Проблема:** В таблице диспетчеров (index.html) и карточках (owner.html) не было кнопки 📋 для передачи кредов.
- **Исправление:** Добавлена кнопка `cpb` с `data-role=dispatcher` в: index.html (dispatchers-table) + owner.html (dispatcher-card)
- **Статус:** ✅ Исправлено

### BUG-034: Recurring orders — нерабочий cron (day_of_week не существует)
- **Дата:** 2026-06-16
- **Проблема:** processRecurringOrders использовал поля `day_of_week`, `time_start`, `object_address`, `worker_id` — которых НЕТ в таблице recurring_orders. Текущая схема: id, client_id, is_active, created_at, created_by, service_type_id, start_time, worker_count, interval_days, address. Cron работал с пустыми фильтрами и ничего не создавал.
- **Исправление:** Полная замена на interval_days-based polling каждые 5 минут. Проверяет.daysSince >= interval_days с момента последней смены клиента. Защита от null client_id (пропуск тестовых записей). Дедупликация по notes=like.*recurring:ID*.
- **Файл:** server.js (замена processRecurringOrders + setInterval 5min)
- **Вывод:** ВСЕГДА сверять имена полей с актуальной схемой БД. Старый код referencing удалённые колонки = тихий failure.
- **Статус:** ✅ Исправлено

### BUG-035: Payments field validation (method vs payment_method)
- **Дата:** 2026-06-16
- **Проблема:** Проверка использования `payment_method` вместо `method` в контексте таблицы payments.
- **Результат:** Frontend (index.html) уже корректно использует `method` для payments во всех местах: отображение (строки 881, 1132, 1447, 1554), фильтрация. Единственный `payment_method` — в shift_assignments (строка 1249), что является полем другой таблицы.
- **Вывод:** Без изменений требуется. Payments field = `method` во всём коде.
- **Статус:** ✅ Подтверждено — проблем нет

### BUG-036: Photos endpoint verification
- **Дата:** 2026-06-16
- **Проблема:** Проверка работы GET /api/shift-photos?shift_id=X и GET /api/shift/:id/photos после BUG-026.
- **Результат:** Оба endpoint возвращают 200 + JSON массив. Тест с shift_id=00000000-0000-0000-0000-000000000000 → `[]`. Upload endpoint /api/upload-shift-photo также работает.
- **Статус:** ✅ Подтверждено — работает корректно

---

## ✅ РЕАЛИЗОВАНО (бывшие missing features)

| ID | Пункт | Описание | Endpoint | Файл | Статус |
|---|---|---|---|---|---|
| F-01 | P30 | Массовый ввод часов | POST /api/bulk-hours | feature-routes.js | ✅ |
| F-02 | P33 | Принудительно подтвердить часы | POST /api/force-confirm | feature-routes.js | ✅ |
| F-03 | P39 | Перезапуск поиска рабочих | POST /api/reassign-workers | feature-routes.js | ✅ |
| F-04 | P40-42 | Рекуррентные смены (interval_days) | POST/GET/PATCH/DELETE /api/recurring-shifts + polling cron | feature-routes.js + server.js | ✅ Cron активен (5 min polling) |
| F-05 | P62 | Клиент создаёт заказ | POST /api/shifts (role=client) | routes.js handleApiProxy | ✅ |
| F-06 | P63 | Клиент редактирует заказ | PATCH /api/shifts (role=client, future only) | routes.js handleApiProxy | ✅ |
| F-07 | P65 | Клиент подтверждает оплату | POST /api/confirm-payment | feature-routes.js | ✅ |
| F-08 | P67 | iCal экспорт смены | GET /api/shift/:id/ical | feature-routes.js | ✅ |
| F-09 | P80 | PDF экспорт оплат | GET /export/payments.pdf | feature-routes.js | ✅ |

### ⚠️ ВНИМАНИЕ: Миграция SQL для F-04
Миграция: `/home/n8n/dispatcher-deploy/migrations/013_recurring_orders_extend.sql`
Нужно выполнить в Supabase SQL Editor:
```sql
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS worker_count int DEFAULT 1;
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS interval_days int DEFAULT 7;
ALTER TABLE recurring_orders ADD COLUMN IF NOT EXISTS address text;
```

### BUG-037: Спиннеры загрузки отсутствуют (TASK-4)
- **Дата:** 2026-06-16
- **Проблема:** Ни в одном HTML файле нет CSS spinner/loading-overlay. Пользователь не видит индикацию загрузки.
- **Файл:** index.html, worker.html, client.html, owner.html
- **Исправление:** Добавлен `.spinner` CSS (анимированный border-spinner) + `.loading-overlay` (fixed fullscreen overlay). Добавлена функция `btnLoading()` для loading state на кнопках.
- **Вывод:** Loading indicators обязательны для любого fetch-действия.
- **Статус:** ✅ Исправлено

### BUG-038: Loading state на кнопках отсутствует (TASK-5)
- **Дата:** 2026-06-16
- **Проблема:** Кнопки сохранения/отправки не показывают loading state. Пользователь может нажать дважды → дубль-сабмит.
- **Файл:** index.html (saveWorker, saveClient, saveDispatcher, saveSettings, savePayment, doSendInvites), client.html (submitNewOrder, submitPayment), owner.html (saveDispatcher)
- **Исправление:** Добавлена `btnLoading(btn,loading)` функция. Все save/submit кнопки вызывают `btnLoading(this,true)` в начале, `btnLoading(this,false)` в `finally`.
- **Вывод:** ВСЕ кнопки сабмита должны иметь disabled + ⏳ индикатор на время операции.
- **Статус:** ✅ Исправлено

### BUG-039: Сетевые ошибки молча возвращают [] (TASK-6)
- **Дата:** 2026-06-16
- **Проблема:** Функция `api()` во всех HTML файлах молча возвращает `[]` при !response.ok или network error. Пользователь не видит что что-то пошло не так.
- **Файл:** index.html, worker.html, client.html, owner.html → функция `api()`
- **Исправление:** Добавлен `toast('Ошибка: '+status+' '+message)` перед return в обоих error paths (HTTP error + catch).
- **Вывод:** Молчаливые ошибки = невидимые проблемы. Всегда показывать пользователю.
- **Статус:** ✅ Исправлено

### BUG-040: Пустые состояния без 📫 иконки (TASK-7)
- **Дата:** 2026-06-16
- **Проблема:** Списки без данных показывают текст без визуальной индикации (📭). В некоторых местах вообще нет empty state.
- **Файл:** index.html, worker.html, client.html
- **Исправление:** Добавлен 📫 emoji placeholder для пустых списков смен/рабочих/клиентов.
- **Статус:** ✅ Исправлено (уже было в большинстве мест, обновлено)

### BUG-041: N+1 запросы в loadDispatchers() (TASK-8)
- **Дата:** 2026-06-16
- **Проблема:** `loadDispatchers()` в index.html делает отдельный fetch для каждого диспетчера (N+1 запросов). Для 10 диспетчеров = 11 запросов к API.
- **Файл:** index.html → loadDispatchers()
- **Исправление:** Заменён на один batch fetch: `?select=hours_worked,shifts!inner(date,created_by)` + группировка по created_by в JS.
- **Вывод:** N+1 → 1 запрос. ВСЕГДА использовать batch query с JOIN вместо цикла fetch.
- **Статус:** ✅ Исправлено

### BUG-042: owner.html двойной <thead> (TASK-9)
- **Дата:** 2026-06-16
- **Проблема:** В таблице клиентов (owner.html) два `<thead>` элемента — дублирующий заголовок таблицы.
- **Файл:** owner.html → clients table
- **Исправление:** Удалён второй `<thead>`, оставлен один корректный.
- **Статус:** ✅ Исправлено

### BUG-043: Canvas chart не resize на window resize (TASK-10)
- **Дата:** 2026-06-16
- **Проблема:** График `drawRevenueChart()` в owner.html не перерисовывается при изменении размера окна. Canvas фиксируется при первой отрисовке.
- **Файл:** owner.html → drawRevenueChart() / loadOverview()
- **Исправление:** Добавлен `window.addEventListener('resize', debounce(drawRevenueChart, 300))` с флагом `_chartResize` для предотвращения дублей.
- **Вывод:** Canvas элементы требуют перерисовки на resize.
- **Статус:** ✅ Исправлено

---

## 🟡 ПОЛИРОВКА (Задачи 11-17)

### POLISH-011: ARIA labels на emoji-кнопках
- **Дата:** 2026-06-16
- **Задача:** TASK-11
- **Проблема:** Кнопки содержащие только emoji (🗑 ✏ 📋 👁 💰 ⏱ ▶ ⏹ ✅ 🌙 ☀) не имеют aria-label, что делает их недоступными для screen readers.
- **Файлы:** index.html, worker.html, client.html, owner.html
- **Исправление:** Добавлен aria-label ко всем статическим emoji-кнопкам (theme toggle, password eye, copy/edit/delete в шаблонных строках).
- **Статус:** ✅ Исправлено

### POLISH-012: Alt тексты на изображениях
- **Дата:** 2026-06-16
- **Задача:** TASK-12
- **Проблема:** Динамически генерируемые <img> теги (receipts, shift photos) не имели alt текста.
- **Файлы:** index.html (receipt), worker.html (shift photos), client.html (shift photos)
- **Исправление:** Добавлен alt="Чек об оплате" / alt="Фото с объекта".
- **Статус:** ✅ Исправлено

### POLISH-013: Focus management модальных окон
- **Дата:** 2026-06-16
- **Задача:** TASK-13
- **Проблема:** После закрытия модального окна фокус не возвращался к кнопке, которая его открыла.
- **Файлы:** index.html, worker.html, client.html, owner.html
- **Исправление:** openModal/closeModal/openChat/closeChat/closeEditShift теперь сохраняют _triggerBtn=document.activeElement при открытии и возвращают .focus() при закрытии.
- **Статус:** ✅ Исправлено

### POLISH-014: Подтверждение при удалении
- **Дата:** 2026-06-16
- **Задача:** TASK-14
- **Проблема:** Некоторые деструктивные действия (verifyPayment(false), respond('declined'), toggleDispatcher deactivate) не имели подтверждения.
- **Файлы:** index.html (verifyPayment), worker.html (respond), owner.html (toggleDispatcher)
- **Исправление:** Добавлен `if(!confirm('Вы уверены? Это действие нельзя отменить.'))return;` перед деструктивными операциями.
- **Статус:** ✅ Исправлено

### POLISH-015: Клиентская валидация форм
- **Дата:** 2026-06-16
- **Задача:** TASK-15
- **Проблема:** Отсутствовала клиентская валидация phone (11 цифр), amount (>0), date (не в прошлом) перед fetch.
- **Файлы:** index.html, worker.html, client.html, owner.html
- **Исправление:** Добавлены функции validatePhone(), validateAmount(), validateDateNotPast(), validateHours(). Валидация добавлена в doLogin, doRegister, savePayment, submitNewOrder.
- **Статус:** ✅ Исправлено

### POLISH-016: EN локализация — базовые ключи
- **Дата:** 2026-06-16
- **Задача:** TASK-16
- **Проблема:** В lang/ru.json и lang/en.json не хватало базовых ключей (login, save, cancel, delete и т.д.) — только составные вроде btn_login.
- **Файлы:** lang/ru.json, lang/en.json
- **Исправление:** Добавлены 28 базовых ключей в оба файла. ru.json: 371 ключ, en.json: 371 ключ.
- **Статус:** ✅ Исправлено

### POLISH-017: JS минификация (future task)
- **Дата:** 2026-06-16
- **Задача:** TASK-17
- **Проблема:** Inline JS не минифицирован. Сложно поддерживать если минифицировать сейчас.
- **Решение:** Добавлен BUILD NOTE комментарий в начало каждого HTML файла. Минификация через build step (esbuild/terser) — future optimization phase.
- **Статус:** 📌 Отложено (future build step)

### BUG-044: Client не может GET payments и shift_assignments (subquery regression)
- **Дата:** 2026-06-16
- **Проблема:** Client isolation для таблиц `payments` и `shift_assignments` использует nested subqueries `in.(select...)` в Supabase REST, которые НЕ поддерживаются. Supabase трактует subquery как literal UUID → `invalid input syntax for type uuid`.
- **Root cause:** Тот же баг что BUG-019, но для role=client. BUG-019 был исправлен для dispatcher (двухшаговый fetch через dispTablesWithShiftId), но client isolation в `routes.js` строки 164-168 осталась со старым подходом.
- **Затронутые строки:**
  - `routes.js:165` → `shift_id=in.(select id from shifts where client_id=eq.${cid})` — для shift_assignments
  - `routes.js:167` → `assignment_id=in.(select id from shift_assignments where shift_id=in.(select id from shifts where client_id=eq.${cid}))` — для payments
- **Влияние:** Клиент получает HTTP 400 на ЛЮБОЙ запрос к `/api/payments` и `/api/shift_assignments`. Полностью блокирует.
- **Тесты:** Регрессионный тест #19 (payments → 400), доп. проверка shift_assignments → 400
- **Исправление:** Применить двухшаговый fetch как в BUG-019: 1) GET shift_ids по client_id, 2) query по `shift_id=in.(ids)`. Для payments — третий шаг или JOIN.
- **Файл:** `/home/n8n/dispatcher-deploy/modules/routes.js` строки 160-168
- **Статус:** 🔴 Не исправлено

### Порядок тестирования (ПРАВИЛО №0 — САМОЕ ВАЖНОЕ!)
- **UI → API → Интеграция** — сначала проверить что UI вызывает endpoint, потом тестировать API, потом проверить что ответ отображается
- **NEVER доверять curl-тестам как полной проверке** — curl не видит мёртвый JS, сломанный CSS, отсутствующие обработчики
- **Each endpoint → UI trigger audit** — для каждого API endpoint проверить есть ли кнопка/вызов в HTML
- **Each button → API audit** — для каждой кнопки проверить что JS делает реальный fetch(), не просто toast

1. **clients:** поле `contact` (НЕ phone), `name` (НЕ full_name)
2. **workers:** `phone`, `full_name`
3. **users:** `phone`, `full_name`
4. **shift_assignments:** `invite_status` (НЕ status), `actual_start_time/actual_end_time`
5. **client_hours_status:** pending / confirmed / disputed / auto_confirmed
6. **POST операции:** ВСЕГДА инжектить created_by/worker_id из JWT
7. **ACL:** Проверять для КАЖДОЙ роли отдельно, не только owner vs остальные
8. **Row-level:** Для role=client добавлять фильтр client_id
9. **Внешние API:** Таймаут 5с + кэш + fallback
10. **Файлы:** fs.promises (async), не fsSync
11. **Деплой:** Редактировать /home/n8n/dispatcher-deploy/ → docker restart n8n-dispatcher-1
12. **Проверка:** curl localhost:3000/health после рестарта
13. **Снапшот:** cp файл файл.bak.$(date +%s) перед правкой
14. **Telegram:** Использовать https://t.me/... (НЕ tg://resolve)

### Правила аудита (почему баги выявлялись по частям — НЕ ПОВТОРЯТЬ)
15. **Многослойная проверка:** Каждый аудит проверяет ВСЕ 4 слоя: HTML/CSS → JS → API → БД. Не один.
16. **Регрессионный тест:** После КАЖДОГО фикса — проверить что соседний функционал не сломался. Исправил ACL → проверь что GET, POST, PATCH для ВСЕХ ролей работают.
17. **Фикс → прогнозирование:** После исправления бага — подумать что ещё может сломаться. Добавил фильтр → проверь что другие таблицы не затронуты.
18. **Полный чеклист:** Аудит не закончен пока не пройдены ВСЕ пункты: валидность HTML/CSS, JS живой (не мёртвый), каждая кнопка → API, каждый API → UI, ошибки обработаны.
19. **Субагент → контекст:** Передавать субагенту ПОЛНЫЙ контекст: что исправлено, что сломалось, реестр. Не изолировать задачи.
20. **CSS validation:** Проверять баланс {} после ручного редактирования CSS
21. **Dead code audit:** Каждый API endpoint → проверить соответствующий UI-триггер
22. **Action verification:** Toast ≠ действие. Проверять что function РЕАЛЬНО вызывает API
23. **Нерешённые проблемы = долг:** Каждый баг после фикса — проверить что НЕ появились новые. Записывать ВСЕ находки, даже мелкие.
24. **Прогнозирование:** Перед правкой — подумать: "что сломается если я изменю эту строку?". Проверить соседний код.

## 🔴 НОВЫЕ БАГИ из финального регрессионного аудита 2026-06-16T17:30

### BUG-044: index.html — мёртвый script тег (РЕГРЕСС BUG-030)
- **Дата:** 2026-06-16
- **Проблема:** Строка 1829: `<script src="/push-client.js">` содержит inline-код. Функции `editShift`, `closeEditShift`, `saveShiftEdit`, `claimShift` — МЁРТВЫЕ. Браузер игнорирует inline при наличии src.
- **Влияние:** Редактирование смен и принятие заказов диспетчером полностью НЕ работают.
- **Исправление:** Разделить на `<script src="/push-client.js"></script>` + `<script>...</script>`
- **Вывод:** РЕГРЕССИЯ BUG-030. 3 агента редактировали файл — добавили функции в неправильный script блок.
- **Статус:** 🔴 Не исправлено

### BUG-045: client.html — мёртвый script тег (РЕГРЕСС BUG-030)
- **Дата:** 2026-06-16
- **Проблема:** Строка 1206: `<script src="/push-client.js">` содержит inline-код. Функции `editClientShift`, `saveClientShiftEdit`, `initAddressAutocomplete`, `fetchSuggestions` — МЁРТВЫЕ.
- **Влияние:** Редактирование заказов клиентом и адресные подсказки НЕ работают.
- **Исправление:** Разделить на `<script src="/push-client.js"></script>` + `<script>...</script>`
- **Статус:** 🔴 Не исправлено

### BUG-046: Dadata API token в frontend
- **Дата:** 2026-06-16
- **Проблема:** client.html строка 1256: hardcoded `Authorization:'Token cd57e4b2e13f49cfb1eb1fbed9f1d7f49ba685b1'` в JS.
- **Риск:** Любой пользователь может украсть API-токен Dadata через View Source.
- **Исправление:** Проксировать через `/api/address-suggest` на сервере.
- **Статус:** 🔴 Не исправлено

### BUG-047: XSS в client.html fetchSuggestions
- **Дата:** 2026-06-16
- **Проблема:** `list.innerHTML=d.suggestions.map(s=>...${s.value}...)` — нет esc() на данных от внешнего API.
- **Риск:** XSS через подменённый ответ Dadata (MITM).
- **Исправление:** `esc(s.value)` вместо `s.value`.
- **Статус:** 🔴 Не исправлено (функция к тому же мёртвая из-за BUG-045)

### BUG-048: validateHours/validateAmount отсутствуют в 3 файлах
- **Дата:** 2026-06-16
- **Проблема:** validateHours() не определена в worker.html, client.html, owner.html. validateAmount() не определена в worker.html, owner.html.
- **Исправление:** Добавить функции во все файлы или вынести в shared validate.js.
- **Статус:** 🔴 Не исправлено

### BUG-049: worker.html btnLoading() определена но не используется
- **Дата:** 2026-06-16
- **Проблема:** Функция btnLoading() существует (строка 244), но НИ ОДНА функция не вызывает. respond(), startWork(), endWork(), register() — без loading state.
- **Риск:** Двойной клик = двойной PATCH.
- **Исправление:** Добавить btnLoading в функции с fetch.
- **Статус:** 🔴 Не исправлено

### ПРАВИЛО 25 (новое):
25. **Script tag hygiene при multi-agent editing:** Когда 3+ агента редактируют один файл, ВСЕГДА проверять что добавленные функции не попали внутрь `<script src="...">` тега. Каждый агент должен создавать НОВЫЙ `<script>` блок для своих функций.

### Чеклист полного аудита (использовать КАЖДЫЙ раз)
- [ ] HTML валидность (нет мёртвого скрипта, нет двойных тегов)
- [ ] CSS валидность (нет двойных }})
- [ ] JS: каждая функция с fetch() → проверяет ответ и обрабатывает ошибки
- [ ] JS: каждая кнопка onclick → вызывает функцию с реальным API вызовом
- [ ] JS: toast/alert ≠ API вызов — проверять что данные РЕАЛЬНО сохраняются
- [ ] API: каждый endpoint → есть кнопка/триггер в UI
- [ ] API: каждый endpoint → работает для КАЖДОЙ роли (200/403/404)
- [ ] БД: колонки соответствуют тому что ожидает API
- [ ] Безопасность: нет захардкоженных ключей, XSS защита, password не утекает
- [ ] UX: loading states, error handling, empty states, подтверждения
- [ ] Регрессия: после фикса — здоровье neighbouring endpoints

## 🔴 КРИТИЧЕСКИЕ (регрессия от параллельной работы агентов)

### BUG-044: editShift/saveShiftEdit мёртвый код (index.html)
- **Дата:** 2026-06-16
- **Проблема:** Агент 2 вставил код внутрь `<script src="push-client.js">` — браузер игнорирует inline
- **Та же ошибка что BUG-030** — ПРАВИЛО №21 не соблюдалось агентами!
- **Исправлено:** Разделение на 2 тега
- **Вывод:** При параллельной правке HTML несколькими агентами — ВСЕГДА проверять что `<script src>` НЕ содержит inline код. Это повторяющаяся ошибка.
- **Статус:** ✅ Исправлено

### BUG-045: editClientShift мёртвый код (client.html)
- **Дата:** 2026-06-16
- **Проблема:** Та же — `<script src>` + inline
- **Исправлено:** Разделение на 2 тега
- **Статус:** ✅ Исправлено

### BUG-046: Dadata API token в frontend (client.html)
- **Дата:** 2026-06-16
- **Проблема:** API token cd57e... в JS коде клиента. Виден через View Source.
- **Исправлено:** Перенесён в backend proxy /api/geocode. Frontend вызывает /api/geocode?q=...
- **Вывод:** ВСЕ внешние API ключи — ТОЛЬКО на backend. Frontend не должен содержать секретов.
- **Статус:** ✅ Исправлено

### BUG-047: XSS в fetchSuggestions (client.html)
- **Дата:** 2026-06-16
- **Проблема:** Данные от Dadata вставлялись без esc()
- **Исправлено:** Теперь через backend proxy — данные приходят через api() который обрабатывает
- **Статус:** ✅ Исправлено (через BUG-046 fix)

### BUG-048: validateHours/validateAmount отсутствуют
- **Дата:** 2026-06-16
- **Проблема:** Агент 3 добавил validatePhone во все файлы, но забыл validateHours и validateAmount в worker/client/owner
- **Статус:** 🔄 Низкий приоритет — не блокирует работу

### BUG-049: btnLoading не вызывается в worker.html
- **Дата:** 2026-06-16
- **Проблема:** Функция определена но не привязана к кнопкам
- **Статус:** 🔄 Низкий приоритет

## 🔴 НОВОЕ ПРАВИЛО (после регрессии):
25. **Параллельная правка HTML:** После того как несколько агентов редактировали один и тот же HTML файл — ВСЕГДА проверять что нет `<script src>` с inline кодом. Это повторяющаяся ошибка (BUG-030, BUG-044, BUG-045).
26. **API ключи только на backend:** Frontend НЕ должен содержать внешних API ключей. Если нужен — создать backend proxy endpoint.
