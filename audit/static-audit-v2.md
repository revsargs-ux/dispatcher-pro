# Static Code Audit v2 — Dispatcher.PRO
**Date:** 2026-05-14  
**Scope:** All JS/HTML files in `/home/n8n/dispatcher-deploy/` (excluding node_modules, backups)  
**Method:** Automated analysis — NO files were modified

---

## 1. Syntax Check — ✅ ALL PASS

Every `.js` file passes `node -c` syntax validation. Zero syntax errors found.

---

## 2. .bak Files — 🔴 50 FILES (2.2 MB)

**50 `.bak` files** found in the project root and subdirectories, totaling 2.2 MB. These are leftovers from previous edits.

Sample:
- `index.html.bak5` through `index.html.bak10` (6 files)
- `owner.html.bak5` through `owner.html.bak10` (5 files)
- `client.html.bak5` through `client.html.bak10` (5 files)
- `worker.html.bak5` through `worker.html.bak10` (5 files)
- `server.js.bak7`, `server.js.bak8`, `server.js.bak10` (3 files)
- `modules/routes.js.bak5` through `bak10` (5 files)
- `modules/auth.js.bak`, `modules/auth.js.bak7` (2 files)
- `modules/telegram.js.bak`, `modules/telegram.js.bak6`, `modules/telegram.js.bak10` (3 files)
- `modules/max-bot.js.bak6`, `modules/max-bot.js.bak10` (2 files)
- `modules/cors.js.bak5`, `modules/gas-sync.js.bak5` (2 files)
- `routes/*.bak` files (5 files)
- `docker-compose.yml.bak7`, `docker-compose.yml.bak10` (2 files)
- Various others

**+ backups/ directory:** 1.3 MB across 3 backup snapshots (pre-fix, pre-audit, pre-completion)

**Recommendation:** Delete all `.bak` files. Git is the version control system. Also remove `backups/` directory.

---

## 3. Dead/Unused Modules — 🟡 2 FILES

| File | Status | Notes |
|------|--------|-------|
| `notifications-module/sw-notifications.js` | **DEAD** | Not imported or referenced by any file. Service worker notification helper, never loaded. |
| `code-gs-update.js` (1758 lines!) | **LIKELY DEAD** | Not imported anywhere. Not in docker-compose mounts. Appears to be a standalone Google Sheets sync script. Should be documented or removed. |

All other modules (audit, monitoring, cors, bot-common, gas-sync, push-client, push-trigger, push-route) are properly imported by their consumers.

---

## 4. Duplicate Code — 🟡 PARTIAL IMPROVEMENT

### telegram.js vs max-bot.js
- **telegram.js:** 521 lines
- **max-bot.js:** 482 lines  
- **bot-common.js:** 151 lines (shared code)

Both bots import `cmdShifts`, `cmdEarnings`, and `forwardChatNotification` from `bot-common.js` — this is good. However, both files are still 500+ lines, meaning significant duplicate logic remains:
- User identification flows
- Phone handling
- Command routing
- Notification sending patterns

**Similarity estimate:** ~60-70% of the code structure is parallel between the two bots.

### sbFetch/sbHeaders
Properly defined **only in `modules/db.js`** (line 7 and 11). No duplicates found. All consumers import from `db.js`. ✅

---

## 5. Security Issues — 🔴 CRITICAL + 🟡 WARNINGS

### 🔴 CRITICAL: Hardcoded Secrets in config.js

```js
// Line 17 — MAX Bot Token (production API key in source code)
maxBotToken: process.env.MAX_BOT_TOKEN || 'f9LHodD0cOLgiq-JgG1JB-vYPJv79mc3jdJNL0xWm9DiMZk4g5gvHjIAzeOwEw_L1K6-BsX92qknFhQVeUTH',

// Line 22 — GAS Webhook Secret
gasWebhookSecret: process.env.GAS_WEBHOOK_SECRET || 'dp_gas_sync_2026',

// Line 25 — Gemini API Key
geminiKey: process.env.GEMINI_API_KEY || 'e3f35d3da0ff430ea723fac65fcfc2bf.weqojee5xK0xpyEx',

// Line 11 — Supabase URL
sbUrl: process.env.SB_URL || 'https://YOUR-PROJECT.supabase.co',
```

**4 secrets with hardcoded fallback values.** If env vars are not set, production keys are exposed in source code.

### 🔴 CRITICAL: Hardcoded Secrets in docker-compose.yml

```yaml
- SB_KEY=sb_secret_7oItz51qISepnzMSsd8wEA_6vsbQbkK
- TG_BOT_TOKEN=8340184731:AAFlKiRAWVzKVvw3ND4aUsHzw0LL62-p8jE
- GAS_WEBHOOK_SECRET=dp_gas_sync_2026
```

Secrets are in plain text in docker-compose.yml. Should use `.env` file or Docker secrets.

### 🟡 WARNING: No esc() in owner.html

`owner.html` has **14 innerHTML assignments** with template literals but **no `esc()` function defined**. XSS risk for:
- Dispatcher names/phones (line 420, 457, 464, 588, 621)
- Client data (line 671)
- Shift data (line 696)
- System errors (line 742)

### 🟡 WARNING: innerHTML without esc() in index.html

Several innerHTML assignments use unescaped data:
- **Line 1029:** Address suggestions (`s.name`, `s.display_name`) — user-controlled from API
- **Line 1475/1539:** Generated passwords and phone numbers in credential display
- **Line 1778/1780:** Receipt URLs from API

### 🟡 WARNING: UUID parameters not validated

`routes/tracking-routes.js` uses parameters directly from URL query string in sbFetch without UUID format validation. Potential for filter injection.

### 🟡 WARNING: SELECT * with potential password exposure

Several `select=*` queries on tables with joins (shift-routes.js lines 17, 124, 279). While no direct password leak, joined tables may expose sensitive fields.

### ✅ No eval() or document.write() found.

---

## 6. File Sizes — 🟡 6 FILES OVER 500 LINES

| File | Lines | Recommendation |
|------|-------|----------------|
| `index.html` | **2563** | 🔴 Split into components/templates |
| `code-gs-update.js` | **1758** | Dead code — remove or document |
| `client.html` | **1133** | 🟡 Consider splitting |
| `worker.html` | **991** | 🟡 Consider splitting |
| `owner.html` | **761** | 🟡 Consider splitting |
| `modules/telegram.js` | **521** | 🟡 Extract more to bot-common.js |

---

## 7. Hardcoded Ports — ✅ MOSTLY CLEAN

- `modules/config.js:8` — `PORT || '8080'` — correct default for internal container port
- `modules/config.js:31` — `localhost:8080` in allowedOrigins — **should be removed for production** (lesson #54)
- `owner.html:202` — display text "Порт: 8080" — informational only, harmless
- `tests/test-api.js:7` — `localhost:8080` — test file, acceptable

---

## 8. Docker-Compose Mounts — ✅ ALL EXIST, 🟡 1 DUPLICATE

All 18 mounted paths/files exist on disk:
✅ server.js, modules/, index.html, worker.html, owner.html, client.html, tg-worker.html, tg-client.html, manifest.json, sw.js, push-client.js, notifications-module/, bot-knowledge.md, sql-setup.html, lang/, receipts/, data/

**Issue:** Duplicate mount line:
```yaml
- ./routes:/app/routes:ro   # line 1
- ./routes:/app/routes:ro   # line 2 — DUPLICATE
```

---

## 9. require() Path Resolution — ✅ ALL VALID

All require() paths in routes/*.js resolve correctly to their targets:
- `routes/auth-routes.js` → `./shared`, `../modules/config`, `../modules/db`, `../modules/auth`, `../modules/audit`, `../modules/telegram`, `../modules/gas-sync` ✅
- `routes/shift-routes.js` → `./shared`, `../modules/config`, `../modules/db`, `../notifications-module/push-trigger`, `../modules/auth`, `../modules/audit`, `../modules/gas-sync`, `../modules/telegram`, `../modules/max-bot` ✅
- `routes/payment-routes.js` → `./shared`, `../modules/config`, `../modules/db`, `../modules/auth`, `../modules/audit`, `../modules/gas-sync` ✅
- `routes/tracking-routes.js` → `./shared`, `../modules/db` ✅
- `routes/chat-routes.js` → `../modules/db`, `../modules/auth`, `./shared`, `../modules/config` ✅
- `routes/user-routes.js` → `./shared`, `../modules/config`, `../modules/db`, `../modules/auth`, `./shift-routes` ✅

---

## 10. TODO/FIXME/HACK Comments — ✅ CLEAN

No TODO, FIXME, HACK, or XXX comments found in active source files. Only legitimate phone format placeholders (`+7XXXXXXXXXX`) in bot greeting messages.

---

## Summary Scorecard

| Category | Status | Severity |
|----------|--------|----------|
| Syntax errors | ✅ None | — |
| .bak files (50 files, 2.2MB) | 🔴 Cleanup needed | Low (clutter) |
| Dead modules (2 files) | 🟡 sw-notifications.js, code-gs-update.js | Low |
| Duplicate code (bots) | 🟡 60-70% overlap remains | Medium |
| **Hardcoded secrets** | **🔴 4+ in config.js, 3 in docker-compose** | **CRITICAL** |
| XSS (no esc in owner.html) | 🟡 14 innerHTML without escaping | Medium |
| Large files (6 over 500 lines) | 🟡 index.html = 2563 lines | Medium |
| Hardcoded ports | ✅ Clean (except dev origins) | Low |
| Docker mounts | ✅ Valid (1 duplicate line) | Low |
| require() paths | ✅ All resolve correctly | — |
| TODO/FIXME | ✅ Clean | — |

## Priority Actions

1. **🔴 Remove hardcoded secret fallbacks from config.js** — maxBotToken, geminiKey, gasWebhookSecret, sbUrl
2. **🔴 Move secrets from docker-compose.yml to .env file**
3. **🟡 Add esc() function to owner.html** — 14 innerHTML with unescaped user data
4. **🟡 Delete 50 .bak files** — `find . -name "*.bak*" -delete`
5. **🟡 Remove dead files** — sw-notifications.js, possibly code-gs-update.js
6. **🟡 Remove duplicate docker-compose mount line**
7. **🟡 Remove localhost:8080 from allowedOrigins** in production config
