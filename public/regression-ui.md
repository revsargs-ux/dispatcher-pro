# 🔍 ФИНАЛЬНЫЙ РЕГРЕССИОННЫЙ UI-аудит Dispatcher.PRO
**Дата:** 2026-06-16 17:30 UTC  
**Аудитор:** Subagent (HTML/CSS/JS layers)  
**Файлы:** index.html (1889), worker.html (732), client.html (1298), owner.html (773)  
**Контекст:** 3 агента редактировали файлы одновременно — проверка конфликтов

---

## index.html (Диспетчер) — 1889 строк

### HTML валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Баланс тегов (div/table/thead/script/style) | ✅ OK |
| 2 | Мёртвые `<script src>` с inline кодом | ❌ **КРИТИЧНО!** Строка 1829: `<script src="/push-client.js">` содержит inline-функции: `editShift`, `closeEditShift`, `saveShiftEdit`, `claimShift`. Браузер ИГНОРИРУЕТ inline при наличии src. **4 функции — мёртвый код!** |
| 3 | Двойные `}}` в CSS | ✅ OK (найденные `}}` — валидные `@media{...}` и `@keyframes{...}`) |
| 4 | Viewport meta tag | ✅ OK (строка 6) |
| 5 | Дублирующиеся id | ✅ OK (нет дубликатов) |

### JS валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Все функции определены | ⚠️ `editShift`, `closeEditShift`, `saveShiftEdit`, `claimShift` — **определены но МЁРТВЫ** (внутри `<script src>`) |
| 2 | onclick → функция существует | ⚠️ onclick="editShift(...)", "closeEditShift()", "saveShiftEdit()", "claimShift()" → функции мёртвые (недоступны) |
| 3 | fetch() обрабатывает ошибки | ✅ api() имеет catch с toast (строка 572+) |
| 4 | innerHTML через esc() | ✅ Большинство через esc(). Несколько raw innerHTML для статического HTML (option lists) — приемлемо |
| 5 | btnLoading() определена и вызывается | ✅ Определена (1235), вызывается в saveWorker, saveClient, saveDispatcher, saveSettings, savePayment (6 вызовов) |
| 6 | toast() определена | ✅ OK |
| 7 | validatePhone/Hours/Amount | ✅ Все 3 определены |
| 8 | api() обрабатывает HTTP ошибки с toast | ✅ OK |
| 9 | Пустые состояния с 📭 | ✅ 12 мест с 📭 или "Нет данных" |
| 10 | ARIA labels на emoji-кнопках | ✅ 7 aria-label атрибутов |
| 11 | _triggerBtn в openModal/closeModal | ✅ 6 ссылок на _triggerBtn |
| 12 | confirm() при удалении | ✅ reassignWorkers, saveDispatcher(deactivate), confirmPay, deleteRecurring, claimShift — все с confirm() |
| 13 | Spinner CSS (.spinner, .loading-overlay) | ✅ Определены |
| 14 | min-height:44px на кнопках | ✅ OK |

### JS → API карта (мертвые функции отмечены ❌)

| Кнопка/действие | Функция | API endpoint | Живой? |
|----------------|---------|-------------|--------|
| Войти | doLogin() | POST /auth/login | ✅ |
| Регистрация | doRegister() | POST /auth/register | ✅ |
| 2FA | doVerify2FA() | POST /auth/verify-2fa | ✅ |
| Выход | doLogout() | POST /auth/logout | ✅ |
| Save Worker | saveWorker() | POST/PATCH /api/workers | ✅ |
| Save Client | saveClient() | POST/PATCH /api/clients | ✅ |
| Save Dispatcher | saveDispatcher() | POST/PATCH /api/users | ✅ |
| Save Payment | savePayment() | POST /api/payments | ✅ |
| Save Settings | saveSettings() | PATCH /api/users | ✅ |
| Mass Hours | saveMassHours() | POST /api/bulk-hours | ✅ |
| Reassign | reassignWorkers() | POST /api/reassign-workers | ✅ |
| Client Confirm | clientConfirm() | POST /api/client-hours-confirm | ✅ |
| Toggle Recurring | toggleRecurring() | PATCH /api/recurring | ✅ |
| Delete Recurring | deleteRecurring() | DELETE /api/recurring | ✅ |
| Save Recurring | saveRecurring() | POST /api/recurring | ✅ |
| Send Invites | doSendInvites() | PATCH /api/shift_assignments | ✅ |
| Chat | sendChatMsg() | POST /api/chat/:id | ✅ |
| Upload Receipt | (в savePayment) | POST /upload-receipt | ✅ |
| **Edit Shift** | **editShift()** | **PATCH /api/shifts** | **❌ МЁРТВАЯ** |
| **Save Shift Edit** | **saveShiftEdit()** | **PATCH /api/shifts** | **❌ МЁРТВАЯ** |
| **Close Edit Shift** | **closeEditShift()** | — | **❌ МЁРТВАЯ** |
| **Claim Shift** | **claimShift()** | **PATCH /api/shifts** | **❌ МЁРТВАЯ** |
| Upload Receipt | saveWorkerDetailPayment() | POST /upload-receipt + /api/payments | ✅ |

---

## worker.html (Рабочий) — 732 строки

### HTML валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Баланс тегов | ✅ OK |
| 2 | Мёртвые `<script src>` с inline | ✅ OK! `<script src="/push-client.js"></script>` (строка 713) — отдельный тег, inline в `<script>` (714) |
| 3 | Двойные `}}` в CSS | ✅ OK |
| 4 | Viewport meta tag | ✅ OK (строка 6) |
| 5 | Дублирующиеся id | ✅ OK |

### JS валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Все функции определены | ✅ OK (54 функции) |
| 2 | onclick → функция существует | ✅ Все 18 onclick ссылаются на существующие функции |
| 3 | fetch() обрабатывает ошибки | ✅ api() имеет catch с toast |
| 4 | innerHTML через esc() | ⚠️ Большинство через esc(). alarm overlay (строка 623) — статический HTML, OK |
| 5 | btnLoading() определена | ✅ Определена (244) |
| 6 | toast() определена | ✅ OK |
| 7 | validatePhone() | ✅ Определена |
| 8 | validateHours() | ❌ **НЕТ!** Не определена |
| 9 | validateAmount() | ❌ **НЕТ!** Не определена |
| 10 | api() с toast на ошибки | ✅ OK |
| 11 | Пустые состояния с 📭 | ✅ 4 места ("Нет смен", 📭) |
| 12 | ARIA labels | ✅ Есть (password eye, theme toggle) |
| 13 | _triggerBtn в modal | ✅ Для chat-modal |
| 14 | confirm() при удалении | ✅ endWork() имеет confirm() |
| 15 | Spinner CSS | ✅ OK |
| 16 | min-height:44px | ✅ OK |
| 17 | startWork() вызывает API | ✅ **BUG-029 исправлен!** PATCH actual_start_time + invite_status:'in_progress' |
| 18 | **btnLoading ВЫЗЫВАЕТСЯ** | ❌ **НЕ ВЫЗЫВАЕТСЯ НИ РАЗУ!** Определена, но ни одна функция не использует btnLoading. respond(), startWork(), endWork() — нет loading state |

### JS → API карта

| Кнопка | Функция | API endpoint | Живой? |
|--------|---------|-------------|--------|
| Войти | login() | POST /auth/login | ✅ |
| Регистрация | register() | POST /auth/register | ✅ |
| Выход | doLogout() / logout() | POST /auth/logout | ✅ |
| Принять смену | respond() | PATCH /api/shift_assignments | ✅ |
| Отказаться | respond() | PATCH /api/shift_assignments | ✅ |
| Начать работу | startWork() | PATCH /api/shift_assignments (actual_start_time) | ✅ |
| Завершить | endWork() | PATCH /api/shift_assignments (actual_end_time, hours_worked) | ✅ |
| Отмена (confirmed) | cancelConfirmed() | PATCH /api/shift_assignments | ✅ |
| Чат | sendChatMsg() | POST /api/chat/:id | ✅ |
| Загрузить фото | uploadShiftPhoto() | POST /api/upload-shift-photo | ✅ |
| Забыли пароль | forgotPassword() | POST /auth/forgot | ✅ |
| Telegram | linkTelegram() | (redirect) | ✅ |
| МАКС | linkMax() | (redirect) | ✅ |

---

## client.html (Клиент) — 1298 строк

### HTML валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Баланс тегов | ✅ OK |
| 2 | Мёртвые `<script src>` с inline | ❌ **КРИТИЧНО!** Строка 1206: `<script src="/push-client.js">` содержит inline-функции: `editClientShift`, `saveClientShiftEdit`, `initAddressAutocomplete`, `fetchSuggestions`. **4 функции — мёртвый код!** |
| 3 | Двойные `}}` в CSS | ✅ OK (BUG-031 исправлен — больше нет двойных `}}` на .stat-card) |
| 4 | Viewport meta tag | ✅ OK (строка 6) |
| 5 | Дублирующиеся id | ✅ OK |

### JS валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Все функции определены | ⚠️ `editClientShift`, `saveClientShiftEdit`, `initAddressAutocomplete`, `fetchSuggestions` — **определены но МЁРТВЫ** (внутри `<script src>`) |
| 2 | onclick → функция существует | ⚠️ onclick="editClientShift(...)", "saveClientShiftEdit()" → функции мёртвые |
| 3 | fetch() обрабатывает ошибки | ✅ api() имеет catch с toast |
| 4 | innerHTML через esc() | ⚠️ Большинство через esc(). **line 1259: `list.innerHTML=d.suggestions.map(s=>...${s.value}...)` — БЕЗ esc()!** XSS через внешний API (Dadata) |
| 5 | btnLoading() определена и вызывается | ✅ Определена (294), вызывается в submitPayment и submitNewOrder |
| 6 | toast() определена | ✅ OK |
| 7 | validatePhone() | ✅ Определена |
| 8 | validateAmount() | ✅ Определена |
| 9 | validateHours() | ❌ **НЕТ!** Не определена |
| 10 | api() с toast на ошибки | ✅ OK |
| 11 | Пустые состояния с 📭 | ✅ 9 мест |
| 12 | ARIA labels | ✅ Есть |
| 13 | _triggerBtn в modal | ✅ Для chat-modal |
| 14 | confirm() при удалении/выходе | ✅ confirm(t('confirm_exit')) в logout |
| 15 | Spinner CSS | ✅ OK |
| 16 | min-height:44px | ✅ OK |
| 17 | **Dadata API token в frontend** | ❌ **БЕЗОПАСНОСТЬ!** `Authorization:'Token cd57e4b2e13f49cfb1eb1fbed9f1d7f49ba685b1'` — захардкожен в JS. Любой может украсть. |

### JS → API карта

| Кнопка | Функция | API endpoint | Живой? |
|--------|---------|-------------|--------|
| Войти | login() | POST /auth/login | ✅ |
| Регистрация | register() | POST /auth/register | ✅ |
| Выход | logout() | POST /auth/logout | ✅ |
| Новый заказ | submitNewOrder() | POST /api/shifts | ✅ |
| Оплата | submitPayment() | POST /api/payments + /upload-receipt | ✅ |
| Подтвердить часы | clientConfirmHours() | POST /api/client-hours-confirm | ✅ |
| Оспорить часы | submitDispute() | POST /api/client-hours-confirm | ✅ |
| Чат | sendChatMsg() | POST /api/chat/:id | ✅ |
| Фото | loadShiftPhotos() | GET /api/shift-photos | ✅ |
| Отзыв | submitReview() | POST /api/reviews | ✅ |
| iCal | exportIcal() | client-side (Blob) | ✅ |
| **Редактировать заказ** | **editClientShift()** | — | **❌ МЁРТВАЯ** |
| **Сохранить правки** | **saveClientShiftEdit()** | **PATCH /api/shifts** | **❌ МЁРТВАЯ** |
| **Адресные подсказки** | **fetchSuggestions()** | **Dadata API** | **❌ МЁРТВАЯ** |
| **Address init** | **initAddressAutocomplete()** | — | **❌ МЁРТВАЯ** |
| Подписки | loadClientSubscriptions() | GET /api/recurring | ✅ |

---

## owner.html (Владелец/РОП) — 773 строки

### HTML валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Баланс тегов | ✅ OK |
| 2 | Мёртвые `<script src>` с inline | ✅ OK! `<script src="/push-client.js"></script>` (строка 772) — правильно закрыт |
| 3 | Двойные `}}` в CSS | ✅ OK (все валидные @media/@keyframes) |
| 4 | Viewport meta tag | ✅ OK (строка 6) |
| 5 | Дублирующиеся id | ✅ OK |
| 6 | Двойной `<thead>` (BUG-042) | ✅ Исправлен — один `<thead>` в clients table |

### JS валидность

| # | Проверка | Результат |
|---|---------|----------|
| 1 | Все функции определены | ✅ OK (41 функция) |
| 2 | onclick → функция существует | ✅ Все 23 onclick ссылаются на существующие функции |
| 3 | fetch() обрабатывает ошибки | ✅ api() имеет catch с toast |
| 4 | innerHTML через esc() | ✅ Большинство через esc() |
| 5 | btnLoading() определена и вызывается | ✅ Определена (274), вызывается в saveDispatcher (616) |
| 6 | toast() определена | ✅ OK |
| 7 | validatePhone() | ✅ Определена |
| 8 | validateHours() | ❌ **НЕТ!** Не определена |
| 9 | validateAmount() | ❌ **НЕТ!** Не определена |
| 10 | api() с toast на ошибки | ✅ OK |
| 11 | Пустые состояния с 📭 | ✅ 5 мест |
| 12 | ARIA labels | ✅ Есть (month nav, theme toggle) |
| 13 | _triggerBtn в modal | ✅ openModal/closeModal |
| 14 | confirm() при удалении | ✅ toggleDispatcher (deactivate) имеет confirm |
| 15 | Spinner CSS | ✅ OK |
| 16 | min-height:44px | ✅ OK |
| 17 | Password hash в editDispatcher | ✅ **Исправлено!** `value=''` (не ставит hash) |
| 18 | Canvas chart resize handler | ✅ `window.addEventListener('resize', debounce(drawRevenueChart, 300))` (BUG-043 фикс) |

### JS → API карта

| Кнопка | Функция | API endpoint | Живой? |
|--------|---------|-------------|--------|
| Войти | doLogin() | POST /auth/login | ✅ |
| 2FA | doVerify2FA() | POST /auth/verify-2fa | ✅ |
| Выход | doLogout() | POST /auth/logout | ✅ |
| Add/Edit Dispatcher | saveDispatcher() | POST /auth/register + PATCH /api/users | ✅ |
| Toggle Dispatcher | toggleDispatcher() | PATCH /api/users | ✅ |
| Export CSV | exportCSV() | GET /export/payments.csv | ✅ |
| Export PDF | exportPDF() | window.print() | ⚠️ Не использует API endpoint |
| System Health | (inline fetch) | GET /health | ✅ |
| Month nav | changeMonth() | — (перерисовка) | ✅ |
| Load Shifts | loadAllShifts() | GET /api/shifts + /api/shift_assignments | ✅ |
| Copy Creds | copyCred()/shareCred() | — (clipboard) | ✅ |

---

## 🔴 КОНФЛИКТЫ МЕЖДУ 3 АГЕНТАМИ

### Обнаруженные конфликты:

1. **index.html: `<script src>` + inline (СТРОКА 1829)** — один агент добавил edit-shift модалку и функции ПОСЛЕ строки с push-client.js, не разделив теги. **Регресс BUG-030.**

2. **client.html: `<script src>` + inline (СТРОКА 1206)** — аналогично. Агент добавлял editClientShift, address autocomplete и review функции в существующий script блок с src. **Регресс BUG-030.**

3. **worker.html и owner.html** — **БЕЗ КОНФЛИКТОВ**. push-client.js правильно отделен.

**Вывод:** Агенты, редактировавшие index.html и client.html, допустили одну и ту же ошибку: вставили новый код внутрь `<script src="...">` тега вместо создания отдельного `<script>` блока.

---

## 📊 ОБЩАЯ ОЦЕНКА UI

| Категория | Оценка | Детали |
|-----------|--------|--------|
| HTML валидность | 70% | index.html и client.html: мёртвые script теги |
| CSS валидность | 100% | Все `}}` валидны, BUG-031 исправлен |
| JS валидность | 75% | 8 функций мёртвые (4+4), validateHours/Amount местами отсутствует |
| API интеграция | 80% | bulk-hours ✅, reassign ✅, но edit-shift и claim-shift мёртвые |
| Обработка ошибок | 90% | api() везде с toast, хороший уровень |
| UX (loading/states) | 85% | btnLoading везде кроме worker.html |
| Безопасность | 75% | Dadata token exposed, XSS в address suggestions |
| Доступность (a11y) | 70% | ARIA labels есть, но не везде |

### **Итоговая оценка: 78%**

---

## 🔴 НОВЫЕ БАГИ ДЛЯ BUG-REGISTRY.md

### BUG-044: index.html — мёртвый script тег (РЕГРЕСС BUG-030)
- **Дата:** 2026-06-16
- **Проблема:** Строка 1829: `<script src="/push-client.js">` содержит inline-код. Функции `editShift`, `closeEditShift`, `saveShiftEdit`, `claimShift` — МЁРТВЫЕ. Браузер игнорирует inline при наличии src.
- **Влияние:** Редактирование смен и принятие заказов диспетчером полностью НЕ работают.
- **Исправление:** Разделить на `<script src="/push-client.js"></script>` + `<script>...</script>`
- **Вывод:** РЕГРЕССИЯ BUG-030. Агент не проверил структуру script тегов при добавлении новых функций.

### BUG-045: client.html — мёртвый script тег (РЕГРЕСС BUG-030)
- **Дата:** 2026-06-16
- **Проблема:** Строка 1206: `<script src="/push-client.js">` содержит inline-код. Функции `editClientShift`, `saveClientShiftEdit`, `initAddressAutocomplete`, `fetchSuggestions` — МЁРТВЫЕ.
- **Влияние:** Редактирование заказов клиентом и адресные подсказки НЕ работают.
- **Исправление:** Разделить на `<script src="/push-client.js"></script>` + `<script>...</script>`

### BUG-046: Dadata API token в frontend
- **Дата:** 2026-06-16
- **Проблема:** client.html: hardcoded `Authorization:'Token cd57e4b2e13f49cfb1eb1fbed9f1d7f49ba685b1'` в JS.
- **Риск:** Любой пользователь может просмотреть исходный код и украсть API-токен Dadata.
- **Исправление:** Проксировать запросы через серверный endpoint `/api/address-suggest` (уже может существовать в routes, но frontend обращается напрямую).

### BUG-047: XSS в client.html fetchSuggestions
- **Дата:** 2026-06-16
- **Проблема:** `list.innerHTML=d.suggestions.map(s=>...${s.value}...)` — нет esc() на данных от внешнего API Dadata.
- **Риск:** Если Dadata вернёт вредоносный HTML (или через MITM), он выполнится в браузере клиента.
- **Исправление:** `esc(s.value)` вместо `s.value`.

### BUG-048: validateHours/validateAmount отсутствуют
- **Дата:** 2026-06-16
- **Проблема:** validateHours() и validateAmount() не определены в worker.html, client.html (только validateAmount), owner.html.
- **Исправление:** Добавить функции во все файлы или вынести в общий shared validate.js.

### BUG-049: worker.html btnLoading() определена но не используется
- **Дата:** 2026-06-16
- **Проблема:** Функция btnLoading() существует (строка 244), но НИ ОДНА функция worker.html её не вызывает. respond(), startWork(), endWork(), register() — все без loading state.
- **Риск:** Двойной клик на "Принять"/"Начать работу" = двойной PATCH запрос.
- **Исправление:** Добавить btnLoading(btn,true/false) в функции с fetch.
