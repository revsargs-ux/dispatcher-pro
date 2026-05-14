# Frontend Inventory v3 — Dispatcher.PRO

**Date:** 2026-05-14  
**Files:** index.html (165KB), owner.html (52KB), worker.html (59KB), client.html (75KB)

---

## 1. index.html (Dispatcher)

### Tabs
| Tab Text | data-panel | Panel ID exists? |
|----------|-----------|-----------------|
| 📊 Дашборд | panel-dashboard | ✅ |
| 📅 Смены | panel-shifts | ✅ |
| 👷 Рабочие | panel-workers | ✅ |
| 🏢 Клиенты | panel-clients | ✅ |
| 👥 Диспетчеры | panel-dispatchers | ✅ (hidden by default, id=tab-dispatchers) |
| ⚙️ Настройки | panel-settings | ✅ |
| 🔄 Подписки | panel-recurring | ✅ |

**Note:** `panel-payments` exists as id but has NO tab button — it's shown via `showWorkerPayments()` / `showClientPayments()` from within Workers/Clients panels.

### Modals (17 total)
| Modal ID | Title | Opens via | Closes via | Form Fields |
|----------|-------|-----------|------------|-------------|
| `modal-shift` | Новая смена | `openNewShift()` | `closeModal('modal-shift')`, ✕ btn | `shift-date` (date), `shift-time` (time), `shift-end-time` (time), `shift-client` (select), `shift-address` (text + autocomplete), `shift-comment` (text), service rows (dynamic) |
| `modal-hours` | Данные | `openHours()` | `closeModal('modal-hours')`, ✕ btn | `hours-start` (datetime-local), `hours-end` (datetime-local), `hours-input` (number, readonly), `hours-extra` (number) |
| `modal-payment` | 💰 Оплата | `openPayment()` | `closeModal('modal-payment')`, ✕ btn | `payment-assignment-id` (hidden), `payment-amount` (number), `payment-method` (select: transfer/cash/card), `payment-note` (text) |
| `modal-worker-detail` | 👷 Карточка рабочего | `openWorkerDetail()` | `closeModal('modal-worker-detail')`, ✕ btn | `wd-filter` (select), `wd-search` (text), `wd-pay-amount` (number), `wd-pay-method` (select), `wd-receipt` (file) |
| `modal-client-detail` | 🏢 Карточка клиента | `openClientDetail()` | `closeModal('modal-client-detail')`, ✕ btn | `cd-filter` (select), `cd-search` (text) |
| `modal-worker` | Рабочий | `openAddWorker()` / `editWorker()` | `closeModal('modal-worker')`, ✕ btn | `worker-edit-id` (hidden), `worker-name` (text), `worker-phone` (tel), `worker-password` (text + auto-gen) |
| `modal-client` | Клиент | `openAddClient()` / `editClient()` | `closeModal('modal-client')`, ✕ btn | `client-edit-id` (hidden), `client-name` (text), `client-contact` (tel), `client-password` (text + auto-gen), `client-rate` (number), `client-worker-rate` (number), `client-pay-method` (select: transfer/cash/invoice) |
| `modal-dispatcher` | Диспетчер | `openAddDispatcher()` / `editDispatcher()` | `closeModal('modal-dispatcher')`, ✕ btn | `dispatcher-edit-id` (hidden), `dispatcher-name` (text), `dispatcher-phone` (tel), `dispatcher-password` (text + auto-gen), `dispatcher-rate` (number), `dispatcher-target` (number) |
| `modal-pay` | 💰 Оплата | dynamic | `closeModal('modal-pay')`, ✕ btn | `pay-amount` (number), `pay-method` (select: cash/card/transfer) |
| `modal-mass-hours` | ⏱ Ввести часы всем | `openMassHours()` | `closeModal('modal-mass-hours')`, ✕ btn | `mass-start-time` (datetime-local), `mass-end-time` (datetime-local), dynamic worker list |
| `modal-verify` | 🔍 Проверка оплаты | dynamic | `closeModal('modal-verify')`, ✕ btn | display only (verify-info, verify-receipt) |
| `modal-notif` | 🔔 Новые регистрации | `showNotifications()` | `closeModal('modal-notif')`, ✕ btn | display only (notif-content) |
| `modal-credentials` | 📋 Данные для входа | dynamic | `closeModal('modal-credentials')`, ✕ btn | `cred-text` (textarea, readonly) |
| `shift-map-modal` | 📍 Карта смены | `openShiftMap()` | `closeShiftMapModal()`, ✕ btn | display only (shift-location-map, shift-map-legend) |
| `modal-recurring` | 🔄 Новая подписка | `openNewRecurring()` | `closeModal('modal-recurring')`, ✕ btn | `rec-client` (select), `rec-worker` (select), `rec-service` (select), `rec-day` (select), `rec-time` (time), `rec-hours` (number), `rec-address` (text), `rec-notes` (text) |
| `chat-modal` | 💬 Чат по смене | `openChat()` | `closeChat()`, ✕ btn | `chat-input` (text), `chat-messages` (display) |
| `twofa-modal` | 2FA | dynamic | (inline, no dedicated close) | `twofa-code` (text, maxlength=6) |

### Auth Forms
- **Login:** `auth-phone` (tel), `auth-pass` (password) → `doLogin()`
- **Register:** `reg-name` (text), `reg-phone` (tel), `reg-pass` (password), `reg-role` (select: dispatcher/client/worker) → `doRegister()`

### Dynamic Content Areas (innerHTML)
- `dashboard-stats`, `dashboard-motivation`, `shiftsListEl` (today shifts), shift cards container
- `invite-services`, `shift-services`, service rows
- Worker/client lists, payment tables, tracking panels
- Chat messages
- **59 innerHTML usages total, 13 with esc(), ~46 without esc()** (mostly static HTML snippets or controlled data)

### Key Buttons (by function category)
- **Auth:** `doLogin()`, `doRegister()`, `doLogout()`, `doVerify2FA()`, `showLoginForm()`, `showRegForm()`
- **Shifts:** `openNewShift()`, `createShiftStep1()`, `closeShift()`, `restartSearch()`, `openShiftMap()`
- **Workers:** `openAddWorker()`, `editWorker()`, `saveWorker()`, `showWorkerList()`, `showWorkerPayments()`, `openWorkerDetail()`
- **Clients:** `openAddClient()`, `editClient()`, `saveClient()`, `showClientList()`, `showClientPayments()`, `openClientDetail()`
- **Payments:** `openPayment()`, `savePayment()`, `confirmPay()`, `verifyPayment()`, `saveWorkerDetailPayment()`
- **Hours:** `openHours()`, `saveHours()`, `openMassHours()`, `saveMassHours()`
- **Tracking:** `openTrackingPanel()`, `closeTrackingPanel()`, `startTracking()`, `stopTracking()`, `trackingSelectAll()`, `trackingDeselectAll()`, `showTrackingWorker()`
- **Recurring:** `openNewRecurring()`, `saveRecurring()`, `toggleRecurring()`, `deleteRecurring()`
- **Dispatchers:** `openAddDispatcher()`, `editDispatcher()`, `saveDispatcher()`
- **Chat:** `openChat()`, `closeChat()`, `sendChatMsg()`
- **Settings:** `saveSettings()`
- **Misc:** `toggleTheme()`, `setLang()`, `addServiceRow()`, `doSendInvites()`, `copyInviteLink()`, `copyCred()`, `shareCred()`, `copyText()`, `handleSort()`, `showNotifications()`
- **Sort headers:** `handleSort(this, 'clients-table')`, `handleSort(this, 'cpay-table')`, `handleSort(this, 'dispatchers-table')`, `handleSort(this, 'workers-table')`, `handleSort(this, 'wpay-table')`

---

## 2. owner.html (Owner)

### Tabs
| Tab Text | data-panel | Panel ID exists? |
|----------|-----------|-----------------|
| 📊 Обзор | panel-overview | ✅ |
| 📈 Аналитика | panel-analytics | ✅ |
| 👥 Диспетчеры | panel-dispatchers | ✅ |
| 💰 Финансы | panel-finances | ✅ |
| 🏢 Клиенты | panel-clients | ✅ |
| 📅 Смены | panel-shifts | ✅ |
| ⚙️ Система | panel-system | ✅ |

### Modals (3 total)
| Modal ID | Title | Opens via | Closes via | Form Fields |
|----------|-------|-----------|------------|-------------|
| `modal-dispatcher` | Диспетчер | `openAddDispatcher()` / `editDispatcher()` | `closeModal('modal-dispatcher')`, ✕ btn | `disp-edit-id` (hidden), `disp-name` (text), `disp-phone` (tel), `disp-city` (text), `disp-pass` (text + auto-gen), `disp-rate` (number), `disp-target` (number) |
| `modal-credentials` | 📋 Данные для входа | dynamic | `closeModal('modal-credentials')`, ✕ btn | `cred-text` (textarea, readonly) |
| `twofa-modal` | 2FA | dynamic | (inline) | `twofa-code` (text) |

### Auth Forms
- **Login:** `auth-phone` (tel), `auth-pass` (password) → `doLogin()`
- (No registration form — owner is pre-created)

### Dynamic Content Areas
- `overview-stats`, `overview-dispatchers`, `top-clients`, `top-workers`
- `dispatchers-list`, `finance-stats`, `finance-table`
- `clients-table`, `shifts-list`
- **14 innerHTML usages, 2 with esc(), ~12 without esc()**

### Key Buttons
- **Auth:** `doLogin()`, `doLogout()`, `doVerify2FA()`
- **Dispatchers:** `openAddDispatcher()`, `editDispatcher()`, `saveDispatcher()`, `toggleDispatcher()`
- **Finance:** `exportCSV()`, `exportPDF()`
- **Shifts:** `loadAllShifts()`
- **System:** health check (inline fetch)
- **Misc:** `toggleTheme()`, `setLang()`, `copyCred()`, `shareCred()`, `changeMonth(-1)`, `changeMonth(1)`

### Additional UI
- Date filters: `shift-from` (date), `shift-to` (date)
- System panel: health check button, system log area

---

## 3. worker.html (Worker)

### Tabs
None — single-page layout with assignment cards.

### Modals (2 persistent + 1 dynamic)
| Modal ID | Title | Opens via | Closes via | Form Fields |
|----------|-------|-----------|------------|-------------|
| `chat-modal` | 💬 Чат по смене | `openChat()` | `closeChat()`, ✕ btn | `chat-input` (text), `chat-messages` (display) |
| GPS permission overlay | (dynamic) | `toggleGpsTracking()` | deny/allow buttons | none |
| (Shift reminder overlay) | ⏰ Смена начинается! | auto | button click | none |

### Auth Forms
- **Login:** `phone-input` (tel), `pass-input` (password) → `login()`
- **Register:** `reg-name` (text), `reg-phone` (tel), `reg-pass` (password), `reg-pass2` (password) → `register()`
- **Forgot:** `forgotPassword()` / `forgotPassword()` (inline, dynamic UI)

### GPS Tracking UI
- `gps-banner` — status banner with dot indicator
  - `gps-dot` — animated dot (green=active, grey=off, orange=error)
  - `gps-status-text` — status label
  - `gps-details` — coordinates/accuracy info
- `gps-toggle-input` — checkbox to enable/disable tracking
- GPS permission modal — dynamically created overlay with allow/deny buttons

### Photo Upload UI
- No dedicated upload form. Photos are sent via API call from `pickShiftPhoto()` function.
- Worker photo display: photos shown inline in shift cards via API

### Chat Modal
- `chat-messages` — message display area
- `chat-input` — text input with Enter key support

### Salary Breakdown Display
- `worker-stats` — shows: `X₽ к выплате · Yч · Z₽ получено`
- Rating appended: `⭐ 4.5 (3 отзыва)` (if reviews exist)
- Per-assignment: calculated salary shown in shift card

### Dynamic Content Areas
- `worker-name` — worker's full name
- `worker-stats` — salary summary
- Assignment list (main content area)
- **9 innerHTML usages, 0 with esc()**

### Key Buttons
- **Auth:** `login()`, `register()`, `showLogin()`, `showReg()`, `forgotPassword()`
- **Shift actions:** `respond('confirmed')`, `respond('declined')`, `startWork()`, `endWork()`, `cancelConfirmed()`
- **Chat:** `openChat()`, `closeChat()`, `sendChatMsg()`
- **Notifications:** `linkTelegram()`, `linkMax()`
- **GPS:** `toggleGpsTracking()`
- **Misc:** `toggleTheme()`, `setLang()`, `togglePw()`, `pickShiftPhoto()`

### Notification Banners
- `tg-banner` / `tg-linked` — Telegram connection status
- `max-banner` / `max-linked` — МАКС connection status

---

## 4. client.html (Client)

### Tabs
None explicit — uses `tab-shifts`, `tab-payments`, `tab-analytics`, `tab-subscriptions` divs toggled by bottom nav buttons.

### Modals (5 total)
| Modal ID | Title | Opens via | Closes via | Form Fields |
|----------|-------|-----------|------------|-------------|
| `chat-modal` | 💬 Чат по смене | `openChat()` | `closeChat()`, ✕ btn | `chat-input` (text), `chat-messages` (display) |
| `modal-new-order` | ➕ Новый заказ | `openNewOrderModal()` | `closeModal('modal-new-order')`, ✕ btn | `order-date` (date), `order-time` (time), `order-address` (text + autocomplete), `order-comment` (textarea), service rows (dynamic) |
| `modal-pay` | 💳 Оплата | `openPaySingle()` / `openPayMulti()` | `closeModal('modal-pay')`, ✕ btn | `pay-amount` (number), `pay-receipt` (file), pay method buttons (cash/invoice/transfer) |
| `review-modal` | ⭐ Оценить работу | `openReview()` | `✕ btn → style.display='none'` | `review-stars` (clickable stars), `review-comment` (textarea), `review-shift-id` (hidden), `review-worker-id` (hidden), `review-rating-val` (hidden) |
| (Forgot password) | (dynamic overlay) | `forgotPassword()` | `hideForgot()` | `forgot-phone` (tel) |

### Auth Forms
- **Login:** `phone-input` (tel), `pass-input` (password) → `login()`
- **Register:** `reg-name` (text), `reg-phone` (tel), `reg-pass` (password), `reg-pass2` (password), `reg-city` (select) → `register()`

### Photo Gallery
- Triggered by `loadShiftPhotos()` button on each shift card
- Photos loaded from `/api/shift-photos?shift_id=...`
- Displayed in grid layout (`photos-{shiftId}` div)
- Click to open full-size in new tab

### Chat Modal
- Same structure as worker.html: `chat-messages` + `chat-input`

### Star Rating UI
- `review-stars` — 5 clickable stars rendered by `renderStars(i)`
- Selected rating stored in `review-rating-val` (hidden input)
- Worker selection: `review-workers-list` (clickable worker cards)
- Submit: `submitReview()`

### iCal Download
- Button rendered per shift: `📅 Календарь`
- `exportIcal()` — generates .ics file and triggers download
- Parameters: shiftId, serviceName, date, startTime, endTime

### Review Submission
- Triggered by `⭐ Оценить работу` button on completed shifts
- Fields: worker selection, star rating (1-5), comment
- Submit: `submitReview()`

### Payment UI
- Single shift: `openPaySingle()` — fixed amount
- Multi-shift: `openPayMulti()` — checkbox selection of shifts, auto-split amount
- Method selection: `selectPayMethod('cash'|'invoice'|'transfer')` — visual buttons
- Receipt upload: `pay-receipt` file input

### Subscription Display
- `tab-subscriptions` — shows active recurring subscriptions with details

### Dynamic Content Areas
- `client-stats` — hours/debt summary
- `tab-shifts` — shift cards with photos, ratings, calendar buttons
- `tab-payments` — payment history
- `tab-analytics` — analytics display
- `tab-subscriptions` — subscription list
- **27 innerHTML usages, 1 with esc(), ~26 without esc()**

### Key Buttons
- **Auth:** `login()`, `register()`, `showLogin()`, `showReg()`, `forgotPassword()`, `submitForgot()`, `hideForgot()`
- **Shift actions:** `confirmShift()`, `openReview()`, `exportIcal()`, `loadShiftPhotos()`
- **Payment:** `openPaySingle()`, `openPayMulti()`, `submitPayment()`, `selectPayMethod()`, `togglePayShift()`, `toggleAllPayShifts()`
- **Order:** `openNewOrderModal()`, `submitNewOrder()`, `addOrderServiceRow()`, `removeOrderServiceRow()`
- **Review:** `renderStars()`, `submitReview()`
- **Chat:** `openChat()`, `closeChat()`, `sendChatMsg()`
- **Notifications:** `linkTelegram()`, `linkMax()`
- **Misc:** `toggleTheme()`, `setLang()`, `togglePw()`

---

## Cross-cutting Checks

### 1. data-panel → Panel ID matching
- ✅ index.html: All 7 data-panel values have matching panel IDs
- ✅ owner.html: All 7 data-panel values have matching panel IDs
- N/A worker.html: No tabs
- N/A client.html: No tabs

### 2. onclick handlers → Function existence
All onclick handlers reference functions defined within the same file's `<script>` block. No broken references detected.

### 3. getElementById targets
| File | IDs referenced | IDs defined | Missing |
|------|---------------|-------------|---------|
| index.html | 154 | 188 | `payments-table` (built dynamically) |
| owner.html | 42 | 54 | `system-log` (may be built dynamically) |
| worker.html | 31 | 33 | ✅ All matched |
| client.html | 50 | 59 | ✅ All matched |

### 4. Dark theme toggle
| File | toggleTheme() | Theme toggle button | Dark CSS vars |
|------|--------------|-------------------|---------------|
| index.html | ✅ | ✅ | ✅ |
| owner.html | ✅ | ✅ | ✅ |
| worker.html | ✅ | ✅ | ✅ |
| client.html | ✅ | ✅ | ✅ |

### 5. i18n loading
| File | loadLang() | data-i18n attributes | setLang() |
|------|-----------|---------------------|-----------|
| index.html | ✅ | 28 | ✅ |
| owner.html | ✅ | 25 | ✅ |
| worker.html | ✅ | 20 | ✅ |
| client.html | ✅ | 24 | ✅ |

### 6. Phone mask
| File | Phone mask refs | Implementation |
|------|----------------|----------------|
| index.html | 27 | intl-tel-input or custom mask |
| owner.html | 6 | intl-tel-input or custom mask |
| worker.html | 18 | intl-tel-input or custom mask |
| client.html | 15 | intl-tel-input or custom mask |

### 7. Esc key handler
| File | Escape key handler |
|------|-------------------|
| index.html | ✅ (keydown → Escape → closeModal) |
| owner.html | ✅ |
| worker.html | ✅ |
| client.html | ✅ |

### 8. esc() usage vs innerHTML

| File | innerHTML count | esc() calls | esc() defined | innerHTML without esc() | Risk |
|------|----------------|-------------|---------------|------------------------|------|
| index.html | 59 | 46 | ✅ | ~13 | LOW — most are option lists or static HTML |
| owner.html | 14 | 11 | ✅ | ~3 | LOW |
| worker.html | 9 | 6 | ✅ | ~3 | MEDIUM — chat messages render without esc() |
| client.html | 27 | 13 | ✅ | ~14 | **HIGH** — chat messages, payment lists, photo gallery, subscription display all use innerHTML without esc(). Photo filenames from API used directly in onclick. |

**⚠️ XSS Risk in client.html:** 
- `container.innerHTML = photos.map(p => '<img ... onclick="window.open(\'/shift-photos/${p.filename}\')">')` — filename from API not escaped
- Chat messages rendered with innerHTML without esc()
- Payment lists, subscription displays unescaped

**⚠️ XSS Risk in worker.html:**
- Chat messages rendered with innerHTML without esc()

---

## Summary Statistics

| File | Size | Tabs | Modals | Form Fields | Buttons (onclick) | innerHTML | esc() used |
|------|------|------|--------|-------------|-------------------|-----------|------------|
| index.html | 165KB | 7 | 17 | 60+ | 70+ | 59 | 46 (78%) |
| owner.html | 52KB | 7 | 3 | 15+ | 20+ | 14 | 11 (79%) |
| worker.html | 59KB | 0 | 3 | 10+ | 25+ | 9 | 6 (67%) |
| client.html | 75KB | 0 | 5 | 25+ | 40+ | 27 | 13 (48%) |
| **Total** | **351KB** | **14** | **28** | **110+** | **155+** | **109** | **76 (70%)** |
