# Supabase Audit Report — Dispatcher.PRO

**Date:** 2026-05-14  
**Project:** bzozrjgfnpdhlymfuobd.supabase.co  
**Auditor:** OpenClaw (automated)

---

## Executive Summary

| Area | Status | Severity |
|------|--------|----------|
| **RLS (Row Level Security)** | ❌ FAIL | 🔴 CRITICAL |
| **Password exposure** | ❌ FAIL | 🔴 CRITICAL |
| **Data integrity** | ⚠️ WARN | 🟡 MEDIUM |
| **Schema consistency** | ⚠️ WARN | 🟡 MEDIUM |
| **Indexes** | ✅ OK | 🟢 |
| **Migrations** | ⚠️ Partial | 🟡 MEDIUM |

---

## 1. Tables Overview & Row Counts

| Table | Rows | Created_at | Updated_at |
|-------|------|------------|------------|
| users | 2 | ✅ | ❌ |
| workers | 3 | ✅ | ❌ |
| clients | 3 | ✅ | ❌ |
| shifts | 2 | ✅ | ❌ |
| shift_assignments | 1 | ✅ | ❌ |
| shift_requirements | 3 | ✅ | ❌ |
| service_types | 10 | ❌ | ❌ |
| payments | 1 | ✅ | ❌ |
| worker_rates | 0 | ❌ | ❌ |
| client_service_rates | 0 | ❌ | ❌ |
| user_device_tokens | 0 | ✅ | ❌ |
| notification_logs | 2 | ✅ | ❌ |
| blacklist | 0 | ✅ | ❌ |
| user_notification_prefs | 0 | ✅ | ✅ |
| tracking_sessions | 0 | ✅ | ❌ |
| tracking_locations | 0 | ✅ | ❌ |

**Total:** 16 tables, 29 rows of data (early stage project).

### Schema Details

#### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| phone | text | REQUIRED |
| full_name | text | REQUIRED |
| role | text | REQUIRED |
| password | text | |
| rate_per_hour | numeric | |
| monthly_target_hours | numeric | |
| is_active | boolean | |
| telegram_chat_id | text | |
| city | text | |
| max_chat_id | bigint | |
| created_at | timestamptz | |

**FKs:** None (referenced by shifts.created_by)

#### workers
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| full_name | text | REQUIRED |
| phone | text | |
| rating | numeric | |
| is_active | boolean | |
| archived | boolean | |
| password | text | |
| login_token | text | |
| telegram_chat_id | text | |
| telegram_link_code | text | |
| city | text | |
| max_chat_id | bigint | |
| created_at | timestamptz | |

**FKs:** None

#### clients
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| name | text | REQUIRED |
| contact | text | |
| default_client_rate | numeric | REQUIRED |
| default_worker_rate | numeric | REQUIRED |
| archived | boolean | |
| password | text | |
| login_token | text | |
| telegram_chat_id | text | |
| city | text | |
| max_chat_id | bigint | |
| created_at | timestamptz | |

**FKs:** None

#### shifts
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| date | date | REQUIRED |
| client_id | uuid | FK → clients.id |
| service_type_id | uuid | FK → service_types.id |
| status | text | |
| created_by | uuid | FK → users.id |
| created_at | timestamptz | |
| start_time | time | |
| planned_end_time | time | |
| comment | text | |
| address | text | |
| latitude | numeric | |
| longitude | numeric | |

#### shift_assignments
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| shift_id | uuid | FK → shifts.id |
| worker_id | uuid | FK → workers.id |
| invite_status | text | |
| hours_worked | numeric | |
| rate_per_hour | numeric | |
| client_rate_per_hour | numeric | |
| extra_amount | numeric | |
| payment_status | text | |
| created_at | timestamptz | |
| actual_start_time | timestamptz | |
| actual_end_time | timestamptz | |
| client_confirmed | boolean | |
| paid_amount | numeric | |
| payment_method | text | |

#### payments
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| assignment_id | uuid | FK → shift_assignments.id |
| amount | numeric | REQUIRED |
| method | text | |
| note | text | |
| created_at | timestamptz | |
| status | text | DEFAULT 'paid' |

#### shift_requirements
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| shift_id | uuid | FK → shifts.id |
| service_type_id | uuid | FK → service_types.id |
| required_count | integer | REQUIRED |
| created_at | timestamptz | |
| worker_rate | numeric | |
| client_rate | numeric | |

#### service_types
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, REQUIRED |
| name | text | REQUIRED |
| default_client_rate | numeric | |
| default_worker_rate | numeric | |

#### Other tables (0 rows each)
- **blacklist:** client_id (FK→clients), worker_id (FK→workers), created_at
- **worker_rates:** worker_id (FK→workers), client_id (FK→clients), worker_rate, client_rate
- **client_service_rates:** client_id (FK→clients), service_type_id (FK→service_types), worker_rate, client_rate
- **user_device_tokens:** user_id, user_role, platform, push_endpoint, push_keys (jsonb), email, last_seen_at, created_at
- **user_notification_prefs:** user_id, user_role, push/email/telegram_enabled, quiet_hours, created_at, updated_at
- **notification_logs:** user_id, user_role, channel, event_type, status, payload (jsonb), error, retry_count, created_at
- **tracking_sessions:** worker_id (FK→workers), status, created_by (FK→users), ended_at
- **tracking_locations:** session_id (FK→tracking_sessions), worker_id (FK→workers), lat, lng, accuracy, speed, heading, battery_level, created_at

---

## 2. 🔴 RLS (Row Level Security) — CRITICAL FAIL

### Findings

**The anon API key has FULL read/write/delete access to ALL tables.** This was confirmed by:

1. **Reading passwords** — the API key can read all user/worker/client passwords without any authentication
2. **Inserting data** — successfully inserted a test record into service_types
3. **Deleting data** — successfully deleted the test record

### Per-table RLS Status

| Table | RLS Enabled | Policies | Status |
|-------|-------------|----------|--------|
| users | ❌ No | None | 🔴 OPEN |
| workers | ❌ No | None | 🔴 OPEN |
| clients | ❌ No | None | 🔴 OPEN |
| shifts | ❌ No | None | 🔴 OPEN |
| shift_assignments | ❌ No | None | 🔴 OPEN |
| shift_requirements | ❌ No | None | 🔴 OPEN |
| service_types | ❌ No | None | 🔴 OPEN |
| payments | ❌ No | None | 🔴 OPEN |
| worker_rates | ❌ No | None | 🔴 OPEN |
| client_service_rates | ❌ No | None | 🔴 OPEN |
| user_device_tokens | ✅ Yes* | Policies exist | 🟡 See note |
| notification_logs | ✅ Yes* | Policies exist | 🟡 See note |
| user_notification_prefs | ✅ Yes* | Policies exist | 🟡 See note |
| tracking_sessions | ✅ Yes* | Policies exist | 🟡 See note |
| tracking_locations | ✅ Yes* | Policies exist | 🟡 See note |
| blacklist | ❌ No | None | 🔴 OPEN |

### RLS Policy Issue

Even tables that have RLS enabled (notifications/tracking) use a **"service role full access" policy with `USING (true) WITH CHECK (true)`**. Since the app uses the anon key (not service_role key), but the policy grants access to everyone, **RLS is effectively disabled on these tables too**.

### ⚠️ Recommendation

```sql
-- URGENT: Enable RLS on ALL tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_service_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;

-- Create service_role policies (for backend with service_role key only)
-- Remove the "USING (true) WITH CHECK (true)" policies that let anon in

-- For the anon key, only allow authenticated users to access their own data
-- Example:
-- CREATE POLICY "Users read own profile" ON users
--   FOR SELECT USING (id = auth.uid());
```

**The app currently uses the anon key for everything.** To properly secure, you need either:
- Switch to service_role key on the backend (kept secret, never exposed to client)
- Or implement proper JWT-based auth and use anon key only from client-side

---

## 3. Data Integrity Issues

### 🔴 Duplicate Password Hashes

Two clients share the **same bcrypt hash**:
- `1kurs.online` (contact: +70333038131) — `$2a$10$N3GOLFvkRbpDP6DeE/bW0ODOCRLWv.v7wXV9UN22JE2RX697oVu/i`
- `1111111 ТЕСТ` (contact: +79085171555) — `$2a$10$N3GOLFvkRbpDP6DeE/bW0ODOCRLWv.v7wXV9UN22JE2RX697oVu/i`

This means they have the **same password**. The test account was likely created by copying the real client's credentials.

**Action:** Delete or change the test client password.

### ⚠️ NULL created_by in Shifts

Shift `0cec3a2d-6992` has `created_by = NULL`. This should reference a user.

### ⚠️ Orphan Data

| Check | Result |
|-------|--------|
| Workers without user record | All 3 workers (expected — they're separate entities) |
| Clients without user record | All 3 clients (expected — they're separate entities) |
| Shifts without assignments | 1 shift (0cec3a2d, pending status — OK) |
| Assignments without worker | None ✅ |
| Payments without assignment | None ✅ |
| Duplicate phones within same table | None ✅ |
| Cross-table phone overlap | None ✅ |

### ✅ Foreign Key Integrity

All FK references are valid:
- shift_assignments → shifts, workers: ✅
- shift_requirements → shifts, service_types: ✅
- payments → shift_assignments: ✅

---

## 4. Performance & Indexes

### Existing Indexes (from migrations)

These indexes have been defined in `db-indexes.sql`:

| Index | Table | Column(s) | Status |
|-------|-------|-----------|--------|
| idx_users_phone | users | phone | ✅ Created |
| idx_users_role | users | role (partial) | ✅ Created |
| idx_users_telegram | users | telegram_chat_id (partial) | ✅ Created |
| idx_workers_phone | workers | phone | ✅ Created |
| idx_workers_active | workers | is_active (partial) | ✅ Created |
| idx_workers_telegram | workers | telegram_chat_id (partial) | ✅ Created |
| idx_clients_contact | clients | contact | ✅ Created |
| idx_clients_telegram | clients | telegram_chat_id (partial) | ✅ Created |
| idx_shifts_status | shifts | status | ✅ Created |
| idx_shifts_date | shifts | date | ✅ Created |
| idx_shifts_client | shifts | client_id | ✅ Created |
| idx_shifts_created_by | shifts | created_by | ✅ Created |
| idx_assignments_worker | shift_assignments | worker_id | ✅ Created |
| idx_assignments_shift | shift_assignments | shift_id | ✅ Created |
| idx_assignments_payment | shift_assignments | payment_status | ✅ Created |
| idx_payments_assignment | payments | assignment_id | ✅ Created |
| idx_service_types_active | service_types | is_active (partial) | ⚠️ Column doesn't exist |
| idx_tracking_sessions_worker | tracking_sessions | worker_id | ✅ Created |
| idx_tracking_sessions_status | tracking_sessions | status | ✅ Created |
| idx_tracking_locations_session | tracking_locations | session_id | ✅ Created |
| idx_tracking_locations_worker | tracking_locations | worker_id | ✅ Created |
| idx_tracking_locations_created | tracking_locations | created_at | ✅ Created |
| idx_device_tokens_user | user_device_tokens | user_id, user_role | ✅ Created |
| idx_notification_logs_user | notification_logs | user_id, created_at | ✅ Created |
| idx_notification_logs_status | notification_logs | status, created_at | ✅ Created |

### Missing Indexes

| Suggested Index | Reason |
|-----------------|--------|
| `blacklist(client_id)` | FK lookup |
| `blacklist(worker_id)` | FK lookup |
| `worker_rates(worker_id)` | FK lookup |
| `client_service_rates(client_id)` | FK lookup |

> At current scale (< 30 rows), missing indexes have zero impact. Revisit when tables exceed ~10K rows.

### ⚠️ Phantom Index

`idx_service_types_active` references `is_active` column which **does not exist** on service_types. This index was either not created or failed silently.

---

## 5. Schema Issues

### Missing updated_at (14 tables)

Only `user_notification_prefs` has `updated_at`. All other tables with `created_at` lack `updated_at`, making it impossible to track when records were last modified.

**Recommendation:** Add `updated_at timestamptz` and a trigger to auto-update it.

### Missing created_at (3 tables)

- `service_types` — no timestamps at all
- `worker_rates` — no timestamps at all  
- `client_service_rates` — no timestamps at all

### Inconsistent Naming

| Issue | Detail |
|-------|--------|
| users.phone vs clients.contact | Both store phone numbers but use different column names |
| No `updated_at` convention | Only 1/16 tables has it |

### Potential Unused Columns

| Column | Table | Always NULL in sample |
|--------|-------|-----------------------|
| login_token | workers | ✅ All NULL |
| telegram_link_code | workers | ✅ All NULL |
| latitude/longitude | shifts | ✅ All NULL |
| max_chat_id | users, workers, clients | ✅ All NULL |

### Missing Constraints

| Table | Issue |
|-------|-------|
| users | No UNIQUE on phone (could create duplicate accounts) |
| workers | No UNIQUE on phone |
| clients | No UNIQUE on contact |
| payments | No CHECK on amount > 0 |
| shift_assignments | No CHECK on hours_worked >= 0 |
| shift_requirements | No FK uniqueness per shift (can duplicate service_type in same shift) |
| service_types | No UNIQUE on name |

### Security: Password Storage

Passwords are stored as bcrypt hashes (✅ good). However:
- **Password hashes are readable via REST API** (🔴 critical with no RLS)
- No password complexity requirements at DB level
- Test accounts share production passwords

---

## 6. Migration Status

### Files Found

| File | Location | Applied? |
|------|----------|----------|
| `db-indexes.sql` | `/home/n8n/dispatcher-deploy/` | ✅ Yes (indexes exist) |
| `add-payment-status.sql` | `migrations/` | ✅ Yes (status column exists, has DEFAULT) |
| `add-worker-locations.sql` | `migrations/` | ❌ No (`worker_locations` table not found in API) |
| `006_tracking_tables.sql` | `migrations/` | ✅ Yes (tracking_sessions/locations exist) |
| `01-create-tables.sql` | `notifications-module/` | ✅ Yes (tables exist) |
| `03-database-webhook.sql` | `notifications-module/` | ⚠️ Partial (function created, triggers commented out) |

### Not Applied

- **`add-worker-locations.sql`** — Creates `worker_locations` table. The table does NOT exist in the API schema. However, the app code (`tracking.js`) references `worker_locations` and will fail when GPS cleanup runs. The app uses `tracking_locations` instead (from `006_tracking_tables.sql`).

### No Migration Tracking

There is no `schema_migrations` table or migration versioning system. Migrations are tracked only by file existence. This risks:
- Running migrations twice
- Missing migrations on new environments
- No rollback capability

---

## 7. Action Items (Priority Order)

### 🔴 Critical (Do Now)

1. **Enable RLS on all tables** — Your API key is effectively public. Anyone with it can read ALL data including passwords and modify anything.
2. **Switch to service_role key on backend** — Keep anon key for frontend only. Never expose service_role to client.
3. **Remove password from API responses** — Even with RLS, passwords should never be in REST responses. Use Supabase Auth or at minimum add a view that excludes the password column.
4. **Delete test data** — Remove `1111111 ТЕСТ` client and `Audit Test Worker` (or mark archived).

### 🟡 Important (Do Soon)

5. Add UNIQUE constraints on phone/contact columns (users, workers, clients).
6. Add UNIQUE constraint on service_types.name.
7. Add `updated_at` column + trigger to frequently-updated tables (shifts, shift_assignments, payments, workers, clients, users).
8. Add CHECK constraints on numeric fields (amount > 0, hours_worked >= 0).
9. Delete or fix `add-worker-locations.sql` migration (orphan — table was replaced by tracking_locations).
10. Fix `idx_service_types_active` — remove or add is_active column to service_types.

### 🟢 Nice to Have

11. Set up a migration tracking table (`schema_migrations`).
12. Standardize phone column naming (phone vs contact).
13. Add NOT NULL constraints where appropriate (workers.phone, clients.contact).
14. Consider adding soft-delete (`archived` column) to all main tables.

---

*Report generated by OpenClaw automated audit.*
