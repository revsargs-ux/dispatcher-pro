# Frontend Audit v2 — Dispatcher.PRO

**Date:** 2026-05-14 21:17 UTC  
**Files audited:** index.html, owner.html, worker.html, client.html  
**Lessons compliance checked:** #19, #23, #30, #41, #42

---

## 1. index.html (Dispatcher) — 165,370 bytes

### Tabs → Panels
| Tab data-panel | Panel id | Match |
|---|---|---|
| panel-dashboard | panel-dashboard | ✅ |
| panel-shifts | panel-shifts | ✅ |
| panel-workers | panel-workers | ✅ |
| panel-clients | panel-clients | ✅ |
| panel-dispatchers | panel-dispatchers | ✅ |
| panel-settings | panel-settings | ✅ |
| panel-recurring | panel-recurring | ✅ |

**Extra panel:** `panel-payments` (id="panel-payments", style="display:none") — has no tab, used dynamically by JS. OK.

**Result: ✅ All tabs have matching panels.**

### Modals (13)
| Modal id | open/close functions | Status |
|---|---|---|
| modal-shift | openNewShift / closeModal | ✅ |
| modal-hours | openHours / closeModal | ✅ |
| modal-payment | openPayment / closeModal | ✅ |
| modal-worker-detail | openWorkerDetail / closeModal | ✅ |
| modal-client-detail | openClientDetail / closeModal | ✅ |
| modal-worker | openAddWorker/editWorker / closeModal | ✅ |
| modal-client | openAddClient/editClient / closeModal | ✅ |
| modal-dispatcher | openAddDispatcher/editDispatcher / closeModal | ✅ |
| modal-pay | openPay / closeModal | ✅ |
| modal-mass-hours | openMassHours / closeModal | ✅ |
| modal-verify | openVerify / closeModal | ✅ |
| modal-notif | showNotifications / closeModal | ✅ |
| modal-credentials | (dynamic) / closeModal | ✅ |
| modal-recurring | openNewRecurring / closeModal | ✅ |

### Inline onclick/oninput/onchange — all verified
All 60+ unique onclick function names found in HTML are defined in `<script>`. **No missing functions. ✅**

### Lesson compliance
| Check | Result |
|---|---|
| **#42: doRegister uses /auth/register** | ✅ Uses `fetch('/auth/register', ...)` for dispatcher role |
| **#23: api() sends Authorization** | ✅ `opts.headers['Authorization']='Bearer '+tk` |
| **#41: api() handles 401** | ✅ Tries refresh, then clears token + shows auth screen (NOT location.reload) |
| **#19: getElementById targets exist** | ⚠️ **payments-table** — getElementById('payments-table') called but no element with that id in HTML |
| **#30: No hardcoded ports** | ✅ No `:808x` patterns found |
| Phone mask | ✅ `setupPhoneMask` and `initPhoneMasks` defined and called |
| Debounce on search | ✅ `debounce()` defined; applied to worker-search and client-search (300ms). Other search inputs (wpay-search, cpay-search, wd-search, cd-search) use direct oninput without debounce — acceptable for local filtering |
| Dark theme toggle | ✅ `toggleTheme()` defined, button present |
| i18n data-i18n | ✅ Extensive data-i18n attributes on key elements |
| Esc key closes modals | ✅ `document.addEventListener('keydown', ...)` checks for Escape |

### Issues found
1. ⚠️ **Missing HTML element:** `getElementById('payments-table')` — no `id="payments-table"` in HTML. Likely dynamically created, but verify.
2. The `oninput=""` on worker-search and client-search inputs is empty — debounce is applied via addEventListener in `init()`. Works, but empty oninput is misleading.

---

## 2. owner.html (Owner) — 51,741 bytes

### Tabs → Panels
| Tab data-panel | Panel id | Match |
|---|---|---|
| panel-overview | panel-overview | ✅ |
| panel-analytics | panel-analytics | ✅ |
| panel-dispatchers | panel-dispatchers | ✅ |
| panel-finances | panel-finances | ✅ |
| panel-clients | panel-clients | ✅ |
| panel-shifts | panel-shifts | ✅ |
| panel-system | panel-system | ✅ |

**Result: ✅ All tabs have matching panels.**

### Modals (2)
| Modal id | Functions | Status |
|---|---|---|
| modal-dispatcher | openAddDispatcher/editDispatcher / closeModal | ✅ |
| modal-credentials | (dynamic) / closeModal | ✅ |

### Dashboard chart
- ✅ Canvas element: `<canvas id="chart-daily" class="chart" height="200">`
- ✅ `drawRevenueChart()` function exists and draws on canvas

### Lesson compliance
| Check | Result |
|---|---|
| **#23: api() sends Authorization** | ✅ |
| **#41: 401 handling** | ⚠️ Uses `location.reload()` on 401 after failed refresh. This violates Lesson #41 — should not reload if user isn't logged in |
| **#19: getElementById targets** | ⚠️ **system-log** — getElementById('system-log') called but no element with that id in HTML |
| **#30: No hardcoded ports** | ✅ |
| Phone mask | ✅ |
| Dark theme toggle | ✅ |
| i18n data-i18n | ✅ |
| Esc key closes modals | ✅ |
| Debounce | ✅ `debounce()` defined |

### Issues found
1. ⚠️ **401 handling uses `location.reload()`** — violates Lesson #41. Should clear token + show auth screen without reload.
2. ⚠️ **Missing HTML element:** `system-log` — referenced in JS but not in HTML.

---

## 3. worker.html (Worker) — 58,862 bytes

### Tabs/Panels
Worker uses a single-page layout (no tab system). No tabs to verify.

### Modals
- GPS permission modal (dynamically created)
- No static modals with open/close patterns

### Worker-specific features
| Feature | Status |
|---|---|
| **Photo upload (uploadShiftPhoto)** | ✅ Defined + `pickShiftPhoto` creates file input |
| **Chat (openChat)** | ✅ Defined |
| **TG auto-login (from_tg)** | ✅ Checks `p.get('from_tg')==='1'`, calls `autoLogin()` |
| **Salary display** | ✅ Uses `a.calculated_salary` in rendering |
| **GPS tracking** | ✅ `initGpsTracking()`, `toggleGpsTracking()` defined |
| **Service Worker registration** | ✅ `navigator.serviceWorker.register('/sw.js')` present |

### Lesson compliance
| Check | Result |
|---|---|
| **#23: api() sends Authorization** | ✅ |
| **#41: 401 handling** | ✅ Clears token, returns `[]`. No location.reload() |
| **#19: getElementById targets** | ✅ All targets present |
| **#30: No hardcoded ports** | ✅ |
| Phone mask | ✅ |
| Dark theme toggle | ✅ |
| i18n data-i18n | ✅ |
| Esc key closes modals | ✅ |
| Debounce | ❌ Not defined, no search inputs to debounce (OK — no search feature) |
| esc() function | ✅ Defined |

### Issues found
1. ✅ No significant issues. Worker.html looks clean.

---

## 4. client.html (Client) — 75,195 bytes

### Tabs → Panels
| Tab data-tab | Panel id | Match |
|---|---|---|
| tab-shifts | tab-shifts | ✅ |
| tab-payments | tab-payments | ✅ |
| tab-analytics | tab-analytics | ✅ |
| tab-help | tab-help | ✅ |
| tab-subscriptions | tab-subscriptions | ✅ |

**Note:** Uses `data-tab` (not `data-panel`). Tab switching handled by JS matching data-tab to panel id.

**Result: ✅ All tabs have matching panels.**

### Modals (2 + review)
| Modal id | Functions | Status |
|---|---|---|
| modal-new-order | openNewOrderModal / closeModal | ✅ |
| modal-pay | openPaySingle/openPayMulti / closeModal | ✅ |
| review-modal | openReview / inline close | ✅ |

### Client-specific features
| Feature | Status |
|---|---|
| **Photo gallery (loadShiftPhotos)** | ✅ Defined |
| **iCal export (exportIcal)** | ✅ Defined (note: function is `exportIcal`, not `downloadICS`) |
| **Rating/review (submitReview)** | ✅ Defined with 5-star UI |
| **5-star UI** | ✅ `renderStars()` creates clickable ★★★★★ with highlight |
| **Chat (openChat)** | ✅ Defined |
| **TG auto-login (from_tg)** | ✅ Checks `p.get('from_tg')==='1'`, calls `autoLogin()` |

### Lesson compliance
| Check | Result |
|---|---|
| **#23: api() sends Authorization** | ✅ |
| **#41: 401 handling** | ✅ Clears token, returns `[]`. No location.reload() |
| **#19: getElementById targets** | ✅ All targets present |
| **#30: No hardcoded ports** | ✅ |
| **#53: esc() function** | ✅ Defined |
| Phone mask | ✅ |
| Dark theme toggle | ✅ |
| i18n data-i18n | ✅ |
| Esc key closes modals | ✅ |
| Debounce | ❌ Not defined (OK — no search inputs) |

### Issues found
1. ✅ No significant issues. Client.html looks clean.

---

## 5. Cross-cutting Checks

### CSS variable names (dark theme)
All 4 files use the same CSS variable set:
- `--primary`, `--primary-light`, `--accent`, `--danger`, `--warning`
- `--bg`, `--card`, `--border`, `--text`, `--text-light`
- `--bg-gradient-start`, `--bg-gradient-end`, `--auth-card-bg`
- Dark mode via `@media(prefers-color-scheme:dark)` and `body.dark`

**Result: ✅ Consistent.**

### i18n loading mechanism
All 4 files:
- Use `loadLang()` function
- Use `applyTranslations()` function
- Use `data-i18n` attributes
- Use `data-i18n-placeholder` for inputs
- Use `t()` helper for JS strings

**Result: ✅ Consistent.**

### api() function
| File | Authorization | 401 handling |
|---|---|---|
| index.html | ✅ Bearer token | ✅ tryRefresh → clear + show auth |
| owner.html | ✅ Bearer token | ⚠️ tryRefresh → clear + **location.reload()** |
| worker.html | ✅ Bearer token | ✅ tryRefresh → clear + return [] |
| client.html | ✅ Bearer token | ✅ tryRefresh → clear + return [] |

**Issue:** owner.html uses `location.reload()` on 401 (Lesson #41 violation).

### Esc key handler
All 4 files have: `document.addEventListener('keydown', e => { if(e.key==='Escape') { ...close modal... } })`

**Result: ✅ Consistent.**

### Phone mask function
All 4 files define `setupPhoneMask()` and `initPhoneMasks()`.

**Result: ✅ Consistent.**

---

## 6. Function Existence Verification

### index.html
- **Defined:** 120+ functions
- **Called via onclick:** 60+ unique names
- **Missing:** None ✅

### owner.html
- **Defined:** 37 functions
- **Called via onclick:** 17 unique names
- **Missing:** None ✅

### worker.html
- **Defined:** 50 functions
- **Called via onclick:** 20 unique names
- **Missing:** None ✅

### client.html
- **Defined:** 58 functions
- **Called via onclick:** 30+ unique names
- **Missing:** None ✅

---

## Summary of Issues

### 🔴 Must Fix
| # | File | Issue | Lesson |
|---|---|---|---|
| 1 | owner.html | `api()` uses `location.reload()` on 401 — breaks if user not logged in | #41 |

### 🟡 Should Fix
| # | File | Issue | Lesson |
|---|---|---|---|
| 2 | index.html | `getElementById('payments-table')` — element may not exist in HTML | #19 |
| 3 | owner.html | `getElementById('system-log')` — element doesn't exist in HTML | #19 |

### ✅ Passed Checks
- All tabs ↔ panels match (all 4 files)
- All onclick/oninput/onchange handlers reference defined functions
- All modals have open/close functions
- doRegister() uses `/auth/register` (Lesson #42) ✅
- api() sends Authorization header (Lesson #23) ✅ (all 4 files)
- No hardcoded ports (Lesson #30) ✅
- Esc key closes modals ✅ (all 4 files)
- Phone masks present ✅ (all 4 files)
- Dark theme toggle present ✅ (all 4 files)
- i18n data-i18n attributes present ✅ (all 4 files)
- esc() XSS protection present ✅ (index.html, worker.html, client.html; owner.html has no innerHTML with user data)
- Worker: photo upload, chat, TG auto-login, salary display, GPS tracking, Service Worker ✅
- Client: photo gallery, iCal export, 5-star review UI, chat, TG auto-login ✅
- Owner: dashboard chart with canvas ✅
