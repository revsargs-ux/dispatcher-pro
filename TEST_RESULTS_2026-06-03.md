# Dispatcher.PRO — Результаты функционального тестирования
**Дата:** 2026-06-03 21:03 UTC  
**Сервер:** http://localhost:8080 (backend), http://localhost:3000 (Vite frontend)  
**Тестировщик:** Тано (subagent)

---

## 1. Статические файлы

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| GET /index.html | ✅ PASS | 200 | HTML отдан |
| GET /owner.html | ✅ PASS | 200 | HTML отдан |
| GET /worker.html | ✅ PASS | 200 | HTML отдан |
| GET /client.html | ✅ PASS | 200 | HTML отдан |
| GET /lang/ru.json | ✅ PASS | 200 | Валидный JSON |

## 2. Авторизация

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| POST /auth/login {phone,pass,table} — неверный пароль | ✅ PASS | 200 | `{"ok":false,"error":"Неверный пароль"}` — пароль bcrypt, проверка работает |
| POST /auth/login — пустые поля | ✅ PASS | 200 | `{"ok":false,"error":"Заполните все поля"}` |
| Supabase users — найден 1 пользователь | ✅ PASS | — | id=849d3de8, phone=+79841629888, role=dispatcher, bcrypt password |
| POST /auth/refresh с валидным JWT | ✅ PASS | 200 | `{"ok":true,"token":"..."}` — новый токен выдан |
| POST /auth/logout с JWT | ✅ PASS | 200 | `{"ok":true}` |
| Rate limit /auth/tg-login (6+ запросов) | ✅ PASS | 429 | С 6-го запроса возвращается 400, затем 429 |

## 3. API Proxy — роли

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| GET /api/shifts с owner JWT | ✅ PASS | 200 | Массив смен (2 записи) возвращён |
| GET /api/workers без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| GET /api/users без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| GET /api/payments без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |

## 4. Оплаты

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| GET /api/payments/export с owner JWT | ⚠️ PARTIAL | 200 | Возвращает JSON вместо CSV (Content-Type не text/csv) |
| POST /api/gas-webhook без сигнатуры | ✅ PASS | 403 | `{"error":"Invalid signature"}` |

## 5. Shift photos

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| GET /shift-photos/test без JWT | ✅ PASS | 401 | `{"error":"Auth required"}` |
| GET /shift-photos/../server.js с JWT | ❌ FAIL | 200 | **CRITICAL: Path traversal работает!** Исходный код server.js отдан |
| POST /api/upload-shift-photo без JWT | ✅ PASS | 401 | `{"error":"Auth required"}` |
| POST /api/upload-shift-photo с JWT, без данных | ✅ PASS | 400 | `{"error":"Missing fields"}` |

## 6. Tracking

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| POST /api/tracking/start без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| POST /api/tracking/stop без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| GET /api/tracking/workers-location без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| POST /api/tracking/start с JWT | ✅ PASS | 400 | `{"error":"session_id and worker_id required"}` — валидация работает |
| GET /api/tracking/workers-location с JWT | ✅ PASS | 200 | Пустой массив `[]` |

## 7. Reviews

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| GET /api/reviews/worker/:id без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| GET /api/reviews/worker/:id с JWT | ✅ PASS | 200 | `{"average":null,"count":0,"reviews":[]}` |
| POST /api/shifts/review без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| POST /api/shifts/review с невалидным JSON | ✅ PASS | 400 | Supabase ошибка парсинга JSON |

## 8. Notifications

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| GET /api/notifications без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| GET /api/notifications с JWT | ❌ FAIL | 404 | Таблица `notifications` не существует в Supabase. Подсказка: `app_notifications` |
| GET /api/notifications/new-workers без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |
| GET /api/notifications/new-workers с JWT | ✅ PASS | 200 | Пустой массив `[]` |
| DELETE /api/notifications без JWT | ✅ PASS | 401 | `AUTH_REQUIRED` |

## 9. CORS

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| OPTIONS с Origin: https://evil.com | ⚠️ PARTIAL | — | `Access-Control-Allow-Origin: ` (пустое значение — не equal *, но заголовок присутствует) |
| OPTIONS с Origin: http://localhost:3000 | ⚠️ PARTIAL | — | `Access-Control-Allow-Origin: ` (пустое значение — должен быть localhost:3000) |

**Примечание:** CORS заголовок возвращается, но значение origin пустое. Нужно проверить логику `getCorsHeaders`.

## 10. Health

| Тест | Статус | HTTP | Деталь |
|------|--------|------|--------|
| GET /api/health | ❌ FAIL | 401 | Эндпоинт требует авторизацию — должен быть публичным |

---

## Итоговая сводка

| Категория | Всего | PASS | FAIL | PARTIAL |
|-----------|-------|------|------|---------|
| 1. Статические файлы | 5 | 5 | 0 | 0 |
| 2. Авторизация | 6 | 6 | 0 | 0 |
| 3. API Proxy | 4 | 4 | 0 | 0 |
| 4. Оплаты | 2 | 1 | 0 | 1 |
| 5. Shift photos | 4 | 3 | 1 | 0 |
| 6. Tracking | 5 | 5 | 0 | 0 |
| 7. Reviews | 4 | 4 | 0 | 0 |
| 8. Notifications | 5 | 4 | 1 | 0 |
| 9. CORS | 2 | 0 | 0 | 2 |
| 10. Health | 1 | 0 | 1 | 0 |
| **ИТОГО** | **38** | **32** | **3** | **3** |

---

## 🔴 Критические проблемы (FIX ASAP)

### 1. Path Traversal — server.js доступен
`GET /shift-photos/../server.js` с JWT возвращает полный исходный код сервера (HTTP 200).  
**Причина:** Express/Vite нормализует путь ДО проверки `..`. Встроенный HTTP-сервер не нормализует `..` в URL до попадания в проверку.  
**Решение:** Добавить `path.normalize()` на `urlPath` или проверять реальный путь после `path.resolve`.

### 2. Таблица notifications не существует
`GET /api/notifications` с JWT → 404, Supabase подсказывает таблицу `app_notifications`.  
**Решение:** Обновить запрос в routes.js на `app_notifications` или создать `notifications`.

### 3. /api/health требует авторизацию
Эндпоинт должен быть публичным для мониторинга.

## 🟡 Средние проблемы

1. **CORS:** `Access-Control-Allow-Origin` возвращается с пустым значением вместо конкретного origin.
2. **Payments export:** Возвращает JSON вместо CSV (нет заголовка `Content-Type: text/csv`).
