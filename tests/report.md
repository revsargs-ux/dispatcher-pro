# E2E Test Report

**Date:** 2026-07-21T14:16:42.647Z
**Status:** ✅ PASSED
**Duration:** 168.0s

| Metric | Value |
|---|---|
| Total | 48 |
| Passed | 48 |
| Failed | 0 |
| Warnings | 0 |
| Success Rate | 100% |

## Auth Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Worker регистрация + автовход | ✅ pass | 1484ms |  |
| Client регистрация + автовход | ✅ pass | 1476ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 582ms |  |
| Owner вход (существующий) | ✅ pass | 577ms |  |
| Wrong password → ошибка видна | ✅ pass | 1282ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 549ms |  |
| Logout → возвращается на форму входа | ✅ pass | 2081ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 513ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 3384ms |  |
| [Dispatcher] Пригласить рабочего | ✅ pass | 3331ms |  |
| [Worker] Смена видна в списке | ✅ pass | 3416ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 3354ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 3338ms |  |
| [Worker] Нажать Завершить | ✅ pass | 3367ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 3355ms |  |
| [Client] Подтвердить часы | ✅ pass | 3318ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 3304ms |  |
| [Dispatcher] Закрыть смену | ✅ pass | 3322ms |  |

## UX Audit

| Test | Status | Duration | Details |
|---|---|---|---|
| Все кнопки имеют читаемый текст (не пустые) | ✅ pass | 2504ms |  |
| Placeholder'ы в input информативны | ✅ pass | 2509ms |  |
| Toast-сообщения появляются при действии | ✅ pass | 3815ms |  |
| Пустые состояния (📭) на страницах без данных | ✅ pass | 6992ms |  |
| При ошибке сети показывается toast | ✅ pass | 3900ms |  |
| Пароль скрывается за точками (type=password) | ✅ pass | 2497ms |  |
| Телефон форматируется при вводе | ✅ pass | 1270ms |  |
| Спиннер появляется при загрузке данных | ✅ pass | 2933ms |  |
| Кнопки имеют min-height:44px | ✅ pass | 2460ms |  |
| Заголовки страниц корректны | ✅ pass | 2480ms |  |
| Ссылки кабинетов на index.html видны | ✅ pass | 664ms |  |
| confirm() появляется при удалении | ✅ pass | 131ms |  |

## Accessibility Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Кнопки с emoji имеют aria-label | ✅ pass | 3025ms |  |
| Tab order логичный (вход → пароль → кнопка) | ✅ pass | 905ms |  |
| Focus сохраняется после закрытия модалки | ✅ pass | 892ms |  |
| Alt text на изображениях | ✅ pass | 3068ms |  |
| Color contrast — текст читаем на фоне | ✅ pass | 761ms |  |
| Focus visible indicator при tab navigation | ✅ pass | 501ms |  |

## Security Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Нет API ключей Supabase в HTML | ✅ pass | 3066ms |  |
| Нет Dadata токенов в HTML | ✅ pass | 3063ms |  |
| Нет паролей в API ответах | ✅ pass | 427ms |  |
| JWT token хранится в localStorage, не в куках | ✅ pass | 1050ms |  |
| Нет eval() или innerHTML с user data | ✅ pass | 3064ms |  |

## Performance Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Время загрузки каждой страницы < 3s | ✅ pass | 4919ms |  |
| Console не содержит ошибок JS | ✅ pass | 12935ms |  |
| Количество сетевых запросов при загрузке < 20 | ✅ pass | 8549ms |  |
| Размер DOM не превышает 5000 узлов | ✅ pass | 6924ms |  |

## Visual Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Скриншот каждой страницы в мобильном viewport | ✅ pass | 9220ms |  |
| Скриншот каждой страницы в desktop viewport | ✅ pass | 9701ms |  |
| Скриншот owner.html в dark mode | ✅ pass | 2894ms |  |

