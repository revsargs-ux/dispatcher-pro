# E2E Test Report

**Date:** 2026-07-21T16:43:26.057Z
**Status:** ✅ PASSED
**Duration:** 179.3s

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
| Worker регистрация + автовход | ✅ pass | 1524ms |  |
| Client регистрация + автовход | ✅ pass | 1440ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 524ms |  |
| Owner вход (существующий) | ✅ pass | 551ms |  |
| Wrong password → ошибка видна | ✅ pass | 1169ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 543ms |  |
| Logout → возвращается на форму входа | ✅ pass | 2013ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 568ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 3378ms |  |
| [Dispatcher] Пригласить рабочего | ✅ pass | 3310ms |  |
| [Worker] Смена видна в списке | ✅ pass | 3408ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 3353ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 3319ms |  |
| [Worker] Нажать Завершить | ✅ pass | 3563ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 3315ms |  |
| [Client] Подтвердить часы | ✅ pass | 3322ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 3300ms |  |
| [Dispatcher] Закрыть смену | ✅ pass | 3308ms |  |

## UX Audit

| Test | Status | Duration | Details |
|---|---|---|---|
| Все кнопки имеют читаемый текст (не пустые) | ✅ pass | 2495ms |  |
| Placeholder'ы в input информативны | ✅ pass | 2653ms |  |
| Toast-сообщения появляются при действии | ✅ pass | 3767ms |  |
| Пустые состояния (📭) на страницах без данных | ✅ pass | 6848ms |  |
| При ошибке сети показывается toast | ✅ pass | 4436ms |  |
| Пароль скрывается за точками (type=password) | ✅ pass | 4422ms |  |
| Телефон форматируется при вводе | ✅ pass | 2025ms |  |
| Спиннер появляется при загрузке данных | ✅ pass | 4157ms |  |
| Кнопки имеют min-height:44px | ✅ pass | 3053ms |  |
| Заголовки страниц корректны | ✅ pass | 3375ms |  |
| Ссылки кабинетов на index.html видны | ✅ pass | 1131ms |  |
| confirm() появляется при удалении | ✅ pass | 529ms |  |

## Accessibility Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Кнопки с emoji имеют aria-label | ✅ pass | 3711ms |  |
| Tab order логичный (вход → пароль → кнопка) | ✅ pass | 1209ms |  |
| Focus сохраняется после закрытия модалки | ✅ pass | 1059ms |  |
| Alt text на изображениях | ✅ pass | 3506ms |  |
| Color contrast — текст читаем на фоне | ✅ pass | 843ms |  |
| Focus visible indicator при tab navigation | ✅ pass | 570ms |  |

## Security Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Нет API ключей Supabase в HTML | ✅ pass | 3087ms |  |
| Нет Dadata токенов в HTML | ✅ pass | 3172ms |  |
| Нет паролей в API ответах | ✅ pass | 608ms |  |
| JWT token хранится в localStorage, не в куках | ✅ pass | 1365ms |  |
| Нет eval() или innerHTML с user data | ✅ pass | 3829ms |  |

## Performance Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Время загрузки каждой страницы < 3s | ✅ pass | 4715ms |  |
| Console не содержит ошибок JS | ✅ pass | 13154ms |  |
| Количество сетевых запросов при загрузке < 20 | ✅ pass | 8498ms |  |
| Размер DOM не превышает 5000 узлов | ✅ pass | 6918ms |  |

## Visual Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Скриншот каждой страницы в мобильном viewport | ✅ pass | 9219ms |  |
| Скриншот каждой страницы в desktop viewport | ✅ pass | 9627ms |  |
| Скриншот owner.html в dark mode | ✅ pass | 2866ms |  |

