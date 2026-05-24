# HTML Audit Report — Dispatcher.PRO

**Дата:** 2026-05-20  
**Аудитор:** Тано (AI)

---

## 🔴 Критические проблемы (ИСПРАВЛЕНО)

### worker.html

| # | Проблема | Статус |
|---|---------|--------|
| 1 | **Syntax error**: `esc(clientName)` — отсутствовала закрывающая скобка `)` в template literal (строка ~441). Рендер карточки смены был сломан — имя клиента и услуги не отображались. | ✅ Исправлено |
| 2 | **Unclosed `<style>` tag**: второй `<style>` блок (pw-wrap стили) не был закрыт — `</style>` отсутствовал перед `<style>` (строка ~82). CSS мог «течь» в HTML. | ✅ Исправлено |
| 3 | **Missing `</details>`**: тег `<details>` (инструкция «Как пользоваться») не закрывался. | ✅ Исправлено |
| 4 | **Missing closing `</div>`**: отсутствовали закрывающие теги для контейнера и main-screen. | ✅ Исправлено |

---

## 🟡 Средние проблемы (ИСПРАВЛЕНО)

### Все HTML файлы (index, client, owner, worker)

| # | Проблема | Статус |
|---|---------|--------|
| 5 | **PWA manifest отключён**: `<!-- manifest disabled -->` вместо `<link rel="manifest">` во всех 4 основных файлах. PWA не могла установиться. | ✅ Исправлено — manifest подключён |

---

## 🟠 Проблемы найдены, но НЕ исправлены (требуют отдельного решения)

### Безопасность

| # | Файл | Проблема | Риск |
|---|------|---------|------|
| 6 | client.html, worker.html | **XSS через forgotPassword()**: `err.innerHTML` с динамическим контентом из `d.error` через `esc()` — безопасно, но `phoneEl.value` подставляется в innerHTML без санитизации в showErr (косвенно) | Низкий |
| 7 | index.html, owner.html | **Пароли в plaintext**: `disp-password.value`, `worker-password.value` — генерируемые пароли показываются в UI и передаются через API. Если backend хранит в bcrypt — ОК, но владелец видит чужие пароли | Средний |
| 8 | tg-client.html, tg-worker.html | **Параметры TG в URL**: `tg_user_id` передаётся в iframe URL как query param. Если HTTPS — ОК, но стоит добавить HMAC проверку на сервере | Низкий |
| 9 | worker.html | **IP-адрес в owner.html**: `93.189.230.107` захардкожен в UI (панель «Система»). Информация о сервере доступна всем кто откроет owner.html | Низкий |

### Производительность

| # | Файл | Проблема | Рекомендация |
|---|------|---------|-------------|
| 10 | index.html | **N+1 в loadDispatchers()**: для каждого диспетчера отдельный API запрос (цикл for-of с await). При 10+ диспетчерах = 10+ запросов | Заменить на batch запрос |
| 11 | worker.html | **N+1 для фото**: для каждой смены отдельный fetch `/api/shift-photos` (цикл for-of). При 20 сменах = 20 запросов | Batch endpoint для всех фото |
| 12 | worker.html | **Отсутствует debounce на render()**: `setInterval(render, 30000)` + `render()` при каждом действии — нет проверки `visibilityState` (в отличие от owner.html) | Добавить проверку |
| 13 | index.html | **Shift sorting в loadShifts**: auto-deactivate over-confirmed в цикле — PATCH запрос на каждого «лишнего» приглашённого | Batch PATCH |
| 14 | Все файлы | **Service types не кешируются**: кроме index.html (sessionStorage), остальные при каждом обращении идут к API | Добавить кеширование |

### UX

| # | Файл | Проблема |
|---|------|---------|
| 15 | worker.html | **Нет кнопки «Выйти»**: logout функция есть, но кнопки в UI нет (только у клиента и диспетчера) |
| 16 | client.html, worker.html | **TG auto-login молча fails**: если tg-login не удался, пользователь видит пустой экран без сообщения об ошибке |
| 17 | client.html | **Password toggle (👁) не работает в тёмной теме**: `.pw-eye` имеет `background:#fff` — хардкод вместо CSS-переменной |
| 18 | index.html | **Worker/Client search без debounce**: `oninput=""` с пустым обработчиком — поиск не работает на уровне фронтенда, идёт API запрос при каждом фокусе |
| 19 | owner.html | **Дублирующийся `<thead>`**: в таблице клиентов два `<thead>` блока (строка ~200) — второй с лишней колонкой |

### PWA

| # | Проблема |
|---|---------|
| 20 | **icon-192.png и badge-72.png не существуют**: SW пытается кешировать несуществующие файлы. Нужно создать PNG иконки |
| 21 | **manifest.json иконка — SVG data URI**: `type: "image/svg+xml"` не поддерживается всеми браузерами для PWA иконок. Нужны PNG 192x192 и 512x512 |
| 22 | **SW STATIC_ASSETS кеширует все HTML**: при обновлении HTML пользователи видят старую версию (cache-first). Нужно bump `CACHE_NAME` при каждом деплое или использовать versioned assets |

### Доступность (a11y)

| # | Проблема |
|---|---------|
| 23 | Нет `aria-label` на кнопках действий (⏱, 🏢, 💰) |
| 24 | Модалки не ловят фокус (нет `role="dialog"`, `aria-modal="true"`) |
| 25 | Нет `aria-live` для toast уведомлений |

### Код-качество

| # | Проблема |
|---|---------|
| 26 | **CSS дублируется** между index/client/owner/worker — одинаковые стили для auth, cards, badges, tables, responsive. Вынести в `common.css` |
| 27 | **JS дублируется**: `esc()`, `norm()`, `toast()`, `toggleTheme()`, `loadLang()`, `api()`, `initPhoneMasks()` — копипаст в каждом файле. Вынести в `common.js` |
| 28 | **Хардкод домена**: `xn----gtbdan3bddhceo9d.xn--p1ai` встречается 15+ раз. Использовать `window.location.origin` |
| 29 | **Chat код дублируется** во всех 4 файлах — идентичная реализация `openChat()`, `loadChatMessages()`, `sendChatMsg()` |

---

## ✅ Что работает хорошо

- Тёмная тема с CSS переменными + `prefers-color-scheme`
- i18n система с data-атрибутами
- Token refresh с retry при 401
- Service Worker с offline fallback
- IndexedDB очередь для GPS трекинга в SW
- Мобильная адаптация (responsive)
- Phone mask для телефонных номеров
- Escape закрывает модалки (везде)
- 2FA поддержка (index, owner)

---

## 📋 Приоритетные рекомендации

1. **Создать PNG иконки** для PWA (192x192, 512x512) — без этого установка невозможна
2. **Вынести общий CSS/JS** в `common.css` и `common.js` — снизить дублирование на ~60%
3. **Заменить хардкод домена** на `window.location.origin`
4. **Batch запросы** вместо N+1 (п.10, 11, 13)
5. **Добавить кнопку «Выйти»** в worker.html
6. **Bump CACHE_NAME** в sw.js при каждом деплое

---

*Отчёт создан автоматически агентом Тано.*
