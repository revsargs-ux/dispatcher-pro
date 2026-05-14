# UI Audit Report — Dispatcher.PRO
**Date:** 2026-05-14  
**Files:** index.html, owner.html, worker.html, client.html

---

## 1. Buttons & Interactive Elements

### index.html (Dispatcher/Owner)

| Button/Element | Function | Exists | Issue |
|---|---|---|---|
| Auth: "Войти" | `doLogin()` | ✅ | — |
| Auth: "Зарегистрироваться" link | `showRegForm()` | ✅ | — |
| Auth: "Зарегистрироваться" btn | `doRegister()` | ✅ | — |
| Auth: "Войти" link | `showLoginForm()` | ✅ | — |
| Header: "Выйти" | `doLogout()` | ✅ | — |
| Header: 📡 Трекинг | `openTrackingPanel()` | ✅ | — |
| Header: notif-count badge | `showNotifications()` | ✅ | — |
| Tab: Дашборд | tab click handler | ✅ | — |
| Tab: Смены | tab click handler | ✅ | — |
| Tab: Рабочие | tab click handler | ✅ | — |
| Tab: Клиенты | tab click handler | ✅ | — |
| Tab: Диспетчеры | tab click handler | ✅ | Hidden for non-owner |
| Tab: Настройки | tab click handler | ✅ | — |
| "+ Новая смена" | `openNewShift()` | ✅ | — |
| 🔍 (shifts filter) | `loadShifts()` | ✅ | — |
| "+ Добавить" worker | `openAddWorker()` | ✅ | — |
| "💰 Оплата" worker | `showWorkerPayments()` | ✅ | — |
| "📋 Список" worker | `showWorkerList()` | ✅ | Initially hidden |
| "📋 Ссылка-приглашение" | `copyInviteLink()` | ✅ | — |
| worker-search input | `loadWorkers()` via oninput | ✅ | — |
| Worker table rows | `openWorkerDetail()` | ✅ | — |
| Worker 📋 button | `.cpb` delegation → modal-credentials | ✅ | — |
| Worker ✏️ button | `editWorker()` | ✅ | — |
| "+ Добавить" client | `openAddClient()` | ✅ | — |
| "💰 Оплата" client | `showClientPayments()` | ✅ | — |
| "📋 Список" client | `showClientList()` | ✅ | Initially hidden |
| client-search input | `loadClients()` via oninput | ✅ | — |
| Client table rows | `openClientDetail()` | ✅ | — |
| Client 📋 button | `.cpb` delegation | ✅ | — |
| Client ✏️ button | `editClient()` | ✅ | — |
| "+ Добавить диспетчера" | `openAddDispatcher()` | ✅ | — |
| Dispatcher ✏️ button | `editDispatcher()` | ✅ | — |
| "Сохранить" settings | `saveSettings()` | ✅ | Hidden for non-owner |
| Telegram bot link | `<a>` external | ✅ | — |
| МАКС bot link | `<a>` external | ✅ | — |
| Modal close buttons (×) | `closeModal()` | ✅ | — |
| Shift "Далее →" | `createShiftStep1()` | ✅ | — |
| Shift "📨 Отправить" | `doSendInvites()` | ✅ | — |
| Hours modal "Сохранить" | `saveHours()` | ✅ | — |
| Payment modal "💾 Сохранить" | `savePayment()` | ✅ | — |
| Worker detail "💰 Оплатить" | `saveWorkerDetailPayment()` | ✅ | — |
| Worker/Client "🔄" password gen | inline JS | ✅ | — |
| Card headers | `toggleCard()` | ✅ | — |
| Shift "🔄 Поиск" | `restartSearch()` | ✅ | — |
| Shift "✖ Закрыть" | `closeShift()` | ✅ | — |
| ⏱ hours button | `openHours()` | ✅ | — |
| 🏢 client confirm | `clientConfirm()` | ✅ | — |
| 💰 payment button | `openPayment()` | ✅ | — |
| ⏱ mass hours | `openMassHours()` | ✅ | — |
| 🗺️ Карта shift | `openShiftMap()` | ✅ | — |
| Verify ✅/❌ | `verifyPayment()` | ✅ | — |
| Mass hours "Сохранить все" | `saveMassHours()` | ✅ | — |
| Mass hours calc | `calcAllMassHours()` | ✅ | — |
| Pay modal "Оплатить" | `confirmPay()` | ✅ | — |
| Pay table 💰 button | `openPay()` | ✅ | — |
| Verify btn (worker pay) | `openVerify()` | ✅ | — |
| Sort headers (data-sort) | `handleSort()` | ✅ | — |
| Tracking: ▶ Начать | `startTracking()` | ✅ | — |
| Tracking: ⏹ Стоп | `stopTracking()` | ✅ | — |
| Tracking: 🔄 refresh | `refreshMap()` | ✅ | — |
| Tracking: 🗺️ Все | `fitAllMarkers()` | ✅ | — |
| Tracking: Все/Снять | `trackingSelectAll()`/`trackingDeselectAll()` | ✅ | — |
| Tracking: ✕ Закрыть | `closeTrackingPanel()` | ✅ | — |
| Cred modal: 📋/📤 | `copyCred()`/`shareCred()` | ✅ | — |
| Map toggle btn | inline toggle | ✅ | — |
| Add service row | `addServiceRow()` | ✅ | — |
| Select all/none workers | `selectAllWorkers()` | ✅ | — |
| Select prev workers | `selectPrevWorkers()` | ✅ | — |
| wpay/cpay filters | inline onchange/oninput | ✅ | — |

### owner.html (РОП)

| Button/Element | Function | Exists | Issue |
|---|---|---|---|
| Auth: "Войти" | `doLogin()` | ✅ | — |
| Header: "Выйти" | `doLogout()` | ✅ | — |
| ◀/▶ month nav | `changeMonth()` | ✅ | — |
| 📥 CSV | `exportCSV()` | ✅ | — |
| 📄 PDF | `exportPDF()` | ✅ | Uses window.print() |
| Tab clicks | tab handler | ✅ | — |
| "+ Добавить диспетчера" | `openAddDispatcher()` | ✅ | — |
| Dispatcher ✏️ | `editDispatcher()` | ✅ | — |
| Dispatcher ⏸/▶️ toggle | `toggleDispatcher()` | ✅ | — |
| Dispatcher 📋 | `.cpb` delegation | ✅ | — |
| 🔍 shifts filter | `loadAllShifts()` | ✅ | — |
| Modal close × | `closeModal()` | ✅ | — |
| Save dispatcher | `saveDispatcher()` | ✅ | — |
| Cred modal: 📋/📤 | `copyCred()`/`shareCred()` | ✅ | — |
| System: 🔄 Проверить здоровье | inline fetch | ✅ | — |
| Analytics: canvas chart | `drawDailyChart()` | ✅ | — |

### worker.html (Исполнитель)

| Button/Element | Function | Exists | Issue |
|---|---|---|---|
| Auth: "Войти" | `login()` | ✅ | — |
| Auth: "Зарегистрироваться" link | `showReg()` | ✅ | — |
| Auth: "Зарегистрироваться" btn | `register()` | ✅ | — |
| Auth: "Уже есть аккаунт" | `showLogin()` | ✅ | — |
| Auth: "Забыли пароль?" | `forgotPassword()` | ✅ | — |
| 👁 password toggle | `togglePw()` | ✅ | — |
| pw-match check | `checkPwMatch()` | ✅ | — |
| "✅ Подтвердить" invite | `respond()` | ✅ | — |
| "❌ Отказаться" invite | `respond()` | ✅ | — |
| "▶️ Начать работу" | `startWork()` | ✅ | — |
| "⏹ Завершить работу" | `endWork()` | ✅ | — |
| "❌ Отказаться" (confirmed) | `cancelConfirmed()` | ✅ | — |
| TG banner | `linkTelegram()` | ✅ | — |
| MAX banner | `linkMax()` | ✅ | — |
| "Выйти" | `logout()` | ✅ | — |
| GPS toggle | `toggleGpsTracking()` | ✅ | — |

### client.html (Заказчик)

| Button/Element | Function | Exists | Issue |
|---|---|---|---|
| Auth: "Войти" | `login()` | ✅ | — |
| Auth: "Зарегистрироваться" | `showReg()`/`register()` | ✅ | — |
| Auth: "Забыли пароль?" | `forgotPassword()` | ✅ | — |
| 👁 password toggle | `togglePw()` | ✅ | — |
| pw-match check | `checkPwMatch()` | ✅ | — |
| "Выйти" | `logout()` | ✅ | — |
| TG/MAX banners | `linkTelegram()`/`linkMax()` | ✅ | — |
| "➕ Новый заказ" | `openNewOrderModal()` | ✅ | — |
| Tab buttons | tab handler | ✅ | — |
| "✅ Подтвердить данные" | `confirmShift()` | ✅ | — |
| "💳 Оплатить" single | `openPaySingle()` | ✅ | — |
| "💳 Оплатить всё" | `openPayMulti()` | ✅ | — |
| Pay method selection | `selectPayMethod()` | ✅ | — |
| Toggle pay shifts | `togglePayShift()`/`toggleAllPayShifts()` | ✅ | — |
| "💳 Отправить" payment | `submitPayment()` | ✅ | ⚠️ References undefined `assignments` variable |
| "✅ Отправить заказ" | `submitNewOrder()` | ✅ | — |
| Add service row | `addOrderServiceRow()` | ✅ | — |
| Remove service row | `removeOrderServiceRow()` | ✅ | — |
| Hide forgot | `hideForgot()` | ✅ | — |
| Submit forgot | `submitForgot()` | ✅ | — |

---

## 2. Modals

### index.html

| Modal ID | Purpose | Opens | Closes | Issues |
|---|---|---|---|---|
| modal-shift | New shift creation | `openNewShift()` / `restartSearch()` | × button → `closeModal()` | — |
| modal-hours | Enter hours | `openHours()` | × → `closeModal()` | — |
| modal-payment | Record payment | `openPayment()` | × → `closeModal()` | — |
| modal-worker-detail | Worker card | `openWorkerDetail()` | × → `closeModal()` | — |
| modal-client-detail | Client card | `openClientDetail()` | × → `closeModal()` | — |
| modal-worker | Add/Edit worker | `openAddWorker()` / `editWorker()` | × → `closeModal()` | — |
| modal-client | Add/Edit client | `openAddClient()` / `editClient()` | × → `closeModal()` | — |
| modal-dispatcher | Add/Edit dispatcher | `openAddDispatcher()` / `editDispatcher()` | × → `closeModal()` | — |
| modal-pay | Quick payment | `openPay()` | × → `closeModal()` | — |
| modal-mass-hours | Batch hours entry | `openMassHours()` | × → `closeModal()` | — |
| modal-verify | Verify payment receipt | `openVerify()` | × → `closeModal()` | — |
| modal-notif | New registrations | `showNotifications()` | × → `closeModal()` | — |
| modal-credentials | Copy credentials | `.cpb` delegation | × → `closeModal()` | — |
| shift-map-modal | Shift map | `openShiftMap()` | `closeShiftMapModal()` | — |
| tracking-panel | GPS tracking | `openTrackingPanel()` | `closeTrackingPanel()` | — |

### owner.html

| Modal ID | Purpose | Opens | Closes | Issues |
|---|---|---|---|---|
| modal-dispatcher | Add/Edit dispatcher | `openAddDispatcher()` / `editDispatcher()` | × → `closeModal()` | — |
| modal-credentials | Copy credentials | `.cpb` delegation | × → `closeModal()` | — |

### worker.html

No modals (uses status-based inline UI).

### client.html

| Modal ID | Purpose | Opens | Closes | Issues |
|---|---|---|---|---|
| modal-new-order | New order form | `openNewOrderModal()` | × → `closeModal()` | Bottom-sheet style |
| modal-pay | Payment form | `openPaySingle()` / `openPayMulti()` | × → `closeModal()` | Bottom-sheet style |

---

## 3. Navigation Audit

### index.html
- **panel-dashboard** ← tab `data-panel="panel-dashboard"` ✅
- **panel-shifts** ← tab `data-panel="panel-shifts"` ✅
- **panel-workers** ← tab `data-panel="panel-workers"` ✅
- **panel-clients** ← tab `data-panel="panel-clients"` ✅
- **panel-dispatchers** ← tab `data-panel="panel-dispatchers"` ✅ (owner only)
- **panel-settings** ← tab `data-panel="panel-settings"` ✅
- **panel-payments** ← NO tab points to this panel. It exists in HTML but no tab has `data-panel="panel-payments"`. The loader for it exists in tab handler. **⚠️ Orphan panel — never shown via tabs.**

### owner.html
- **panel-overview** ← tab `data-panel="panel-overview"` ✅
- **panel-analytics** ← tab `data-panel="panel-analytics"` ✅
- **panel-dispatchers** ← tab `data-panel="panel-dispatchers"` ✅
- **panel-finances** ← tab `data-panel="panel-finances"` ✅
- **panel-clients** ← tab `data-panel="panel-clients"` ✅
- **panel-shifts** ← tab `data-panel="panel-shifts"` ✅
- **panel-system** ← tab `data-panel="panel-system"` ✅

### worker.html
No tabs, single-page flow. ✅

### client.html
- **tab-shifts** ← `data-tab="tab-shifts"` ✅
- **tab-payments** ← `data-tab="tab-payments"` ✅
- **tab-analytics** ← `data-tab="tab-analytics"` ✅
- **tab-help** ← `data-tab="tab-help"` ✅
- **⚠️** Tab handler hides elements with `[id^="tab-"]` selector. IDs `tab-bar` and `tab-help` both match. The `tab-bar` check (`x.id!=='tab-bar'`) handles this. ✅

---

## 4. Form Validation

### index.html

| Form | Validation | Issues |
|---|---|---|
| Login | Phone + pass required | ⚠️ No phone format validation |
| Register | All fields required, pass ≥ 4 chars | ⚠️ No phone format validation |
| New Shift (step 1) | Date + client + services > 0 | ✅ Basic check with alert() |
| Worker add/edit | `full_name` required | ⚠️ No phone validation, no password min-length on add |
| Client add/edit | `name` required | ⚠️ No phone validation |
| Dispatcher add/edit | `full_name` + `phone` required | ⚠️ No phone validation |
| Hours | Auto-calculated from datetime | ✅ |
| Payment | Amount > 0 | ✅ |

### owner.html

| Form | Validation | Issues |
|---|---|---|
| Login | Phone + pass required | ⚠️ No phone format validation |
| Dispatcher add/edit | `name` + `phone` required | ⚠️ No phone validation |

### worker.html

| Form | Validation | Issues |
|---|---|---|
| Login | Phone + pass required | ✅ Basic |
| Register | Name ≥ 2 chars, phone 11 digits, pass ≥ 4, pass match | ✅ Best validation across all files |
| Forgot password | Phone required via prompt | ✅ Minimal |
| Start work | GPS proximity check (200m) | ✅ Has fallback confirm if GPS fails |

### client.html

| Form | Validation | Issues |
|---|---|---|
| Login | Phone + pass required | ✅ |
| Register | All fields, pass match | ⚠️ No phone format validation (digits check missing) |
| Forgot password | Phone required | ✅ |
| New order | Date + at least 1 service | ✅ |
| Payment | Amount > 0 | ✅ |

---

## 5. Cross-File Consistency

### JS Libraries
| Library | index.html | owner.html | worker.html | client.html |
|---|---|---|---|---|
| Leaflet | ✅ (map) | ❌ Not loaded | ❌ Not loaded | ❌ Not loaded |
| push-client.js | ✅ | ✅ | ✅ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |

### Duplicate Function Names Across Files
| Function | Files | Issue |
|---|---|---|
| `doLogin()` | index.html, owner.html | Different implementations per role ✅ OK — separate pages |
| `doLogout()` | index.html, owner.html, worker.html, client.html | Different per role ✅ OK |
| `api()` | All 4 files | Slightly different implementations — worker/client return `[]` on error differently |
| `openModal()`/`closeModal()` | index.html, owner.html, client.html | Different mechanisms: index/owner use `.classList.add('show')`, client uses `.style.display='flex'` |
| `toast()` | index.html, owner.html, worker.html, client.html | Different implementations (class-based vs display-based) |
| `norm()` | All 4 files | ✅ Same logic |
| `togglePw()`/`checkPwMatch()` | worker.html, client.html | ✅ Same logic |
| `linkTelegram()`/`linkMax()` | worker.html, client.html | ✅ Same logic |
| `copyCred()`/`shareCred()` | index.html, owner.html | ✅ Same logic |
| `loadOverview()` in owner.html | — | Called via `setInterval` every 5s — **⚠️ Performance concern** |
| `loadDashboard()` in index.html | — | Called via `setInterval` every 5s — **⚠️ Performance concern** |

### API Endpoints Consistency
All files use `/api/` prefix with `/auth/` for auth endpoints. ✅ Consistent.

---

## 6. Mobile Responsiveness

### Viewport Meta Tag
| File | Present |
|---|---|
| index.html | ✅ `<meta name="viewport" content="width=device-width, initial-scale=1.0">` |
| owner.html | ✅ |
| worker.html | ✅ |
| client.html | ✅ |

### Responsive CSS Patterns
| Pattern | index.html | owner.html | worker.html | client.html |
|---|---|---|---|---|
| `@media(max-width:600px)` | ✅ | ✅ | — | — |
| `@media(max-width:768px)` | ✅ | ✅ | ✅ | ✅ |
| stat-grid responsive | ✅ auto-fit | ✅ auto-fit | — | ✅ 1fr 1fr |
| form-row → column | ✅ | ✅ | — | — |
| table scroll-x | ✅ | ✅ | ✅ | ✅ |

### Potential Mobile Issues
- **index.html:** Tracking panel sidebar hidden on mobile (`.tracking-sidebar{display:none}` at 768px) — OK, map still visible
- **owner.html:** Dispatcher card stats grid goes 2x2 on mobile ✅
- **worker.html:** No responsive grid issues, single column layout ✅
- **client.html:** Bottom-sheet modals work well on mobile ✅
- **All files:** Tables use `display:block;overflow-x:auto` at 768px — horizontal scroll on mobile ✅

---

## 7. Accessibility Issues

### Missing Alt Text
- **worker.html:** `<div style="font-size:48px">📭</div>` — decorative, OK
- **owner.html:** `<canvas id="chart-daily">` — ❌ No fallback text, no aria-label

### Missing Labels on Inputs
- **index.html auth:** `#auth-phone`, `#auth-pass` — ❌ No `<label>` elements
- **owner.html auth:** Same issue ❌
- **worker.html auth:** `#phone-input`, `#pass-input` — ❌ No `<label>` elements
- **client.html auth:** Same ❌
- **All files:** Many form inputs in modals have `<label>` ✅

### Low Contrast Colors
- `--text-light: #718096` on `--bg: #f7fafc` — Contrast ratio ~3.7:1 (fails WCAG AA for small text) ⚠️
- `--text-muted: #a0aec0` on `--bg: #f7fafc` — Very low contrast ⚠️
- Header tabs inactive: `color:var(--text-light)` on white — Low contrast ⚠️

### Missing ARIA Attributes
- **All modals:** No `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby` ❌
- **All tabs:** No `role="tablist"`, `role="tab"`, `role="tabpanel"` ❌
- **All tables with sorting:** Sortable headers have no `aria-sort` ❌
- **Tracking panel:** No ARIA for panel open/close ❌
- **Cards with toggle:** No `aria-expanded` ❌
- **Worker/client detail modals:** No focus trap ❌

### Keyboard Navigation
- **All files:** Tab navigation works but no `:focus-visible` styles ⚠️
- **All modals:** No focus trap — tab can escape to background ❌
- **All modals:** No Escape key handler to close ❌ (except native browser behavior)
- **Card toggles:** Use `onclick` on divs — not keyboard accessible ❌

### Other Accessibility
- **owner.html canvas chart:** No text alternative for data visualization ❌
- **All files:** Toast notifications lack `role="alert"` or `aria-live` ❌

---

## Issues Found

### 🔴 Critical

1. **client.html `submitPayment()` references undefined `assignments` variable** — Line references `assignments.filter(a => s.asgnIds.includes(a.id))` but `assignments` is not in scope within `submitPayment()`. This will cause a `ReferenceError` when a client tries to pay for multiple shifts. The function needs access to the assignments data.

2. **index.html `openShiftMap()` uses undefined `token` variable** — Two references to `token` in the fetch calls inside `openShiftMap()` but it's never defined in that scope. Should be `localStorage.getItem('dp_token')`.

3. **owner.html `loadOverview()` auto-polls every 5 seconds** — Makes ~5-7 API calls every 5s (3 parallel + data processing). This is excessive and will cause performance issues and unnecessary API load. Same issue in index.html `loadDashboard()`.

### 🟡 Warnings

4. **index.html `panel-payments` is orphaned** — HTML panel exists but no tab references it. Dead code.

5. **Phone validation inconsistent** — worker.html validates phone as 11 digits (`/^\d{11}$/`), but index.html, owner.html, and client.html have no phone format validation at all.

6. **Modal close inconsistency** — index.html and owner.html use `classList.add/remove('show')`, client.html uses `style.display = 'flex'/'none'`. Same function name, different behavior.

7. **worker.html unclosed `<style>` tag** — Line has `<style>` opening tag but previous style block may not be properly closed. The second `<style>` block appears without closing the first properly (actually looking more carefully, there's `</style>` then `<style>` which is valid, but the second `<style>` is NOT closed before `</head>`). **Missing `</style>` before `</head>`**.

8. **client.html `submitPayment()` button disabled but never re-enabled on error** — If the try/catch hits an error path, the button stays disabled with "⏳ Отправка..." text.

9. **index.html `saveWorker()` creates workers without password validation** — Auto-generated 6-digit password, but no minimum length check if user provides their own.

10. **owner.html canvas chart `drawDailyChart()`** — Canvas uses `getBoundingClientRect()` which may return 0 on first render if tab isn't visible.

11. **All files: No CSRF protection** — Auth tokens are sent via Authorization header but no CSRF tokens for state-changing operations.

12. **owner.html `inviteClient()` function** — Defined but never called from any visible UI element. Dead code.

### 🔵 Info

13. **owner.html clients table** has duplicate `<thead>` sections — First thead has 5 columns, second has 6 columns. The second thead after tbody is invalid HTML and will cause rendering inconsistencies.

14. **index.html `loadDispatchers()`** — Makes N+1 queries (one per dispatcher for hours). Could be batched like owner.html does.

15. **worker.html `checkAlarm()` regex** — Uses regex to parse dates from rendered HTML text instead of data attributes. Fragile approach.

16. **All files: `setInterval` for token refresh** — 6-hour interval is fine, but the interval IDs are never cleared on logout.

17. **All files: Service Worker registered** — References `/sw.js` but file existence not verified in audit.

18. **worker.html GPS tracking** — Complex GPS tracking with Service Worker messaging. Works but the `swMessage()` has a 3-second timeout which could cause tracking issues on slow networks.

19. **client.html address suggestions** — Uses `/api/address-suggest` endpoint but no fallback if API is unavailable.

20. **owner.html auto-refresh** — `setInterval(()=>{if(currentUser){loadOverview();}},5000)` runs even when tab is not visible (no Page Visibility API check).

---

## Summary Statistics

| Metric | Count |
|---|---|
| Total buttons/interactive elements | ~120 |
| Missing functions | 0 |
| Modals total | 19 |
| Orphaned panels | 1 |
| Critical issues | 3 |
| Warnings | 9 |
| Info/low priority | 8 |
| Accessibility issues | ~15 |
