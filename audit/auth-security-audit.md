# Auth & Security Audit Report — Dispatcher.PRO

**Date:** 2026-05-14  
**Auditor:** Peptide Bot (automated)  
**Target:** /home/n8n/dispatcher-deploy/  
**Version:** 1.0.0  

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟠 High | 5 |
| 🟡 Medium | 6 |
| 🟢 Low | 4 |

Overall: The system has basic auth working correctly (JWT, blacklist, rate limiting, role checks all pass functional tests). However, several critical hardcoded secrets and a plaintext password fallback pose significant risk.

---

## 🔴 Critical Issues

### C1. Hardcoded API Secrets in config.js
**File:** `modules/config.js`  
**Lines:** maxBotToken, gasWebhookSecret, geminiKey

```js
maxBotToken: process.env.MAX_BOT_TOKEN || 'f9LHodD0cOLgiq-JgG1JB-vYPJv79mc3jdJNL0xWm9DiMZk4g5gvHjIAzeOwEw_L1K6-BsX92qknFhQVeUTH',
gasWebhookSecret: process.env.GAS_WEBHOOK_SECRET || 'dp_gas_sync_2026',
geminiKey: process.env.GEMINI_API_KEY || 'e3f35d3da0ff430ea723fac65fcfc2bf.weqojee5xK0xpyEx',
```

These are **production API keys/tokens hardcoded as fallbacks**. If env vars aren't set, the app silently uses these. Anyone with repo access gets the keys. The Max bot token allows sending messages as the bot.

**Fix:** Remove hardcoded fallbacks. Fail fast if env vars are missing.

### C2. Plaintext Password Comparison Fallback
**File:** `modules/auth.js`, line ~74

```js
function checkPassword(inputPassword, storedPassword) {
  // ...bcrypt check...
  // ...sha256 check...
  if (storedPassword === inputPassword) return true;  // ← DANGER
  return false;
}
```

If the stored password in Supabase is literally the plaintext password string, `checkPassword` returns `true` by direct comparison. This means:
- Anyone who can read the DB can log in as anyone
- Plaintext passwords in the DB defeat the purpose of hashing
- The `isPlaintext()` helper exists but is never used to reject logins

**Fix:** Remove the plaintext comparison. Migrate any plaintext passwords in DB to bcrypt. Force password reset for affected users.

### C3. SHA-256 Legacy Hash with Known Salt
**File:** `modules/auth.js`, line ~67

```js
const LEGACY_SALT = 'dp_pro_2026_salt';
function legacyHash(password) {
  return crypto.createHash('sha256').update(password + LEGACY_SALT).digest('hex');
}
```

- Salt is hardcoded and single-value (not per-user)
- SHA-256 is fast to brute-force
- Anyone reading this code can precompute rainbow tables for this salt

**Fix:** Force migration of all legacy hashes to bcrypt. Remove legacy code after migration.

### C4. Supabase Service Role Key Exposed in Container Environment
**Docker env:** `SB_KEY=sb_secret_7oItz51qISepnzMSsd8wEA_6vsbQbkK`

This is the **service_role** key (bypasses all RLS policies). It's used for all API calls from the backend. If this leaks, anyone has full DB access bypassing Supabase Row Level Security.

**Fix:** Use the `anon` key for read operations and only use `service_role` where absolutely necessary. Consider adding RLS policies as a defense-in-depth measure.

---

## 🟠 High Issues

### H1. No Content-Security-Policy Header
**File:** `modules/cors.js`

SEC_HEADERS includes HSTS, X-Frame-Options, etc., but **no CSP**. Without CSP, XSS attacks can load external scripts, styles, and make arbitrary requests.

**Fix:** Add a Content-Security-Policy header, at minimum:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
```

### H2. XSS Risk in client.html — No esc() Function
**File:** `client.html`

`index.html` has an `esc()` function for HTML escaping, but `client.html` does **not**. Multiple `innerHTML` assignments inject user-controlled data (shift names, client names, payment amounts, error messages) without escaping:

- Line 249: `err.innerHTML = '...❌ ' + d.error + '...'` — server error reflected as HTML
- Line 393: Shift rendering with client names
- Line 572: Payment data injection
- Line 698: Service row data

**Fix:** Add the `esc()` function to `client.html` and use it for all user data inserted via innerHTML.

### H3. Supabase Query String Injection via Template Literals
**File:** `modules/routes.js`

Multiple `sbFetch` calls construct PostgREST query strings via template literals with user-supplied IDs:

```js
sbFetch('shifts', `id=eq.${shift_id}&select=...`)
sbFetch('clients', `${phoneCol}=ilike.%25${phone.slice(-10)}%25&select=...`)
```

While PostgREST uses URL query parameters (not raw SQL), a crafted `shift_id` containing `&` could inject additional filter parameters. For example, `shift_id = "x&id=eq.ANY_ID"` could bypass filters.

The `handleApiProxy` passes the full query string from the client URL directly to Supabase:
```js
const query = req.url.includes('?') ? req.url.split('?').slice(1).join('?') : '';
```

**Fix:** Validate UUID format for all ID parameters. Use `encodeURIComponent()` for user-supplied values in query strings. Sanitize the proxy query string to only allow expected parameters.

### H4. Tracking Endpoints Lack Resource Ownership Validation
**File:** `modules/routes.js`, lines 647-685

The tracking endpoints (`/api/tracking/start`, `/api/tracking/stop`, `/api/tracking/location`) accept `worker_id` and `session_id` from the request body but **never verify** that the authenticated user owns that worker/session. A logged-in worker could submit tracking data for any other worker.

**Fix:** Verify `worker_id` matches the authenticated user's ID (or allow only owner/dispatcher to submit for others).

### H5. GAS Webhook Authentication is a Shared Static Secret
**File:** `modules/routes.js`, line 793

The GAS webhook authenticates via a static header `x-gas-secret` with value `dp_gas_sync_2026`. This secret is:
- Hardcoded in config.js
- Transmitted in plain text (unless behind HTTPS — which it is via Traefik)
- Not rotated
- Allows writing to any Supabase table (workers, clients, shifts, etc.)

**Fix:** Use HMAC-based signing of request bodies instead of a static secret. Rotate the current secret.

---

## 🟡 Medium Issues

### M1. No Password Complexity Requirements
**File:** `modules/auth.js` + frontend

The backend has **no password validation**. The frontend in `index.html` checks `pass.length < 4` (minimum 4 characters). `client.html` has no visible length check. Workers could register with 1-character passwords.

**Fix:** Enforce minimum 6-8 character passwords server-side. Add complexity requirements.

### M2. JWT Secret Stored in Filesystem with Loose Permissions
**File:** `data/.jwt_secret` (permissions: `-rw-rw-r--`)

The JWT secret is stored in a file readable by all users in the `n8n` group. If any other process runs as `n8n`, it can read the secret and forge tokens.

**Fix:** Set permissions to `0600` (owner-only). Consider using an environment variable instead.

### M3. CORS Allows localhost in Production
**File:** `modules/config.js`

```js
allowedOrigins: [
  'https://xn----gtbdan3bddhceo9d.xn--p1ai',
  'https://bot.plus-rabochie.ru',
  'http://localhost:8080',
  'http://localhost:3000'
]
```

Localhost origins should not be in the production config. An attacker running code on a developer's machine could make cross-origin requests.

**Fix:** Remove localhost entries in production. Use environment-specific config.

### M4. In-Memory Rate Limiting (Not Distributed)
**File:** `modules/auth.js`

Rate limiting is stored in Node.js process memory. If the app runs multiple instances (or restarts), rate limits reset. An attacker can bypass by waiting for restarts.

**Fix:** Use Redis or a persistent store for rate limiting if scaling to multiple instances.

### M5. Token Refresh Doesn't Verify Token Freshness
**File:** `modules/auth.js`, `refreshToken()`

The refresh endpoint accepts any valid (non-blacklisted, non-expired) JWT and issues a new one. There's no mechanism to detect token theft — both the old and new token are valid until the old one expires or is blacklisted.

**Fix:** Implement refresh token rotation with a server-side token family tracking to detect reuse.

### M6. No Account Lockout After Repeated Failed Logins
**File:** `modules/auth.js`

Rate limiting is IP-based (5 attempts / 5 minutes) but there's no account lockout. An attacker using rotating IPs/proxies can brute-force passwords indefinitely.

**Fix:** Add per-account lockout after N failed attempts.

---

## 🟢 Low Issues

### L1. JWT Expiry is 7 Days
**File:** `modules/auth.js`

```js
{ expiresIn: '7d' }
```

7 days is long for a JWT. If a token is stolen, the attacker has a week of access (though blacklist mitigates this).

**Fix:** Reduce to 1-2 hours for access tokens, implement proper refresh tokens.

### L2. Token Passed via Both Header and Cookie
**File:** `modules/auth.js`, `getTokenFromReq()`

The system accepts tokens from both `Authorization: Bearer` header and `dp_token` cookie. Cookie-based auth without CSRF protection could be exploitable.

**Fix:** If using cookie auth, add CSRF tokens. Otherwise, remove cookie support.

### L3. Error Messages Reveal System Information
**File:** Various

Some error responses include internal details (e.g., `e.message` passed directly to client in catch blocks). The health endpoint exposes uptime and memory usage.

**Fix:** Return generic error messages to clients. Log detailed errors server-side only.

### L4. `sbFetch` Helper Doesn't Validate Table Names
**File:** `modules/routes.js`

The generic API proxy extracts the table name from the URL path. While `handleApiProxy` has some role checks, it doesn't validate that the table name is one of the known tables. A request to `/api/nonexistent_table` would be forwarded to Supabase.

**Fix:** Add an allowlist of valid table names.

---

## Functional Test Results

| Test | Expected | Result | Status |
|------|----------|--------|--------|
| GET /api/workers without auth | 401 | 401 | ✅ |
| Login with wrong password | Error | "Пользователь не найден" | ✅ |
| Register worker (self-service) | 200 + user data | 200 | ✅ |
| Duplicate phone registration | 409 | 409 "Пользователь с таким номером уже зарегистрирован" | ✅ |
| Worker accessing /api/users | 403 | 403 | ✅ |
| Worker accessing /api/payments | 403 | 403 | ✅ |
| Worker POST to /api/workers | 403 | 403 "Нет доступа" | ✅ |
| Worker GET /api/workers | 200 | 200 | ✅ |
| Logout + token reuse | 401 | 401 | ✅ |
| Refresh blacklisted token | 401 | 401 "Токен недействителен" | ✅ |
| Rate limiting (5 attempts) | 429 on 6th | 429 on 6th | ✅ |
| Stats without auth | 401 | 401 | ✅ |
| GAS webhook wrong secret | 403 | 403 | ✅ |
| Export CSV without auth | 401 | 401 | ✅ |
| CORS unknown origin | First allowed origin | First allowed origin | ✅ |
| CORS known origin | Same origin | Same origin | ✅ |
| Security headers present | HSTS, X-Frame, etc. | All present except CSP | ⚠️ |

---

## Positive Findings

1. **JWT with blacklist** — Logout properly invalidates tokens
2. **bcrypt hashing** — Modern hashing when bcrypt is available
3. **Password auto-upgrade** — Legacy SHA-256 passwords get upgraded to bcrypt on login
4. **Role-based access** — Owner/dispatcher/worker/client separation works correctly
5. **Rate limiting** — Login rate limiting functional (5 attempts / 5 min)
6. **Security headers** — HSTS, X-Frame-Options: DENY, nosniff, XSS protection
7. **File path traversal protection** — Static file handler checks path prefix
8. **Audit logging** — Login, registration, password reset events are logged
9. **Receipt filename sanitization** — Special characters stripped from uploaded filenames

---

## Priority Remediation Order

1. **Remove hardcoded secrets** from `config.js` (C1)
2. **Remove plaintext password comparison** from `checkPassword()` (C2)
3. **Add CSP header** (H1)
4. **Add esc() to client.html** and use it consistently (H2)
5. **Validate UUIDs in sbFetch queries** (H3)
6. **Add ownership checks to tracking endpoints** (H4)
7. **Enforce password requirements server-side** (M1)
8. **Remove localhost from CORS origins** in production (M3)

---

*End of audit report*
