# E2E Test Report

**Date:** 2026-07-21T17:16:48.262Z
**Status:** ✅ PASSED
**Duration:** 168.3s

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
| Worker регистрация + автовход | ✅ pass | 1612ms |  |
| Client регистрация + автовход | ✅ pass | 1424ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 529ms |  |
| Owner вход (существующий) | ✅ pass | 562ms |  |
| Wrong password → ошибка видна | ✅ pass | 1227ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 549ms |  |
| Logout → возвращается на форму входа | ✅ pass | 2035ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 478ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 3291ms |  |
| [Dispatcher] Пригласить рабочего | ✅ pass | 3305ms |  |
| [Worker] Смена видна в списке | ✅ pass | 3339ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 3314ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 3308ms |  |
| [Worker] Нажать Завершить | ✅ pass | 3339ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 3302ms |  |
| [Client] Подтвердить часы | ✅ pass | 3312ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 3358ms |  |
| [Dispatcher] Закрыть смену | ✅ pass | 3303ms |  |

## UX Audit

| Test | Status | Duration | Details |
|---|---|---|---|
| Все кнопки имеют читаемый текст (не пустые) | ✅ pass | 2484ms |  |
| Placeholder'ы в input информативны | ✅ pass | 2665ms |  |
| Toast-сообщения появляются при действии | ✅ pass | 3912ms |  |
| Пустые состояния (📭) на страницах без данных | ✅ pass | 6943ms |  |
| При ошибке сети показывается toast | ✅ pass | 3892ms |  |
| Пароль скрывается за точками (type=password) | ✅ pass | 2484ms |  |
| Телефон форматируется при вводе | ✅ pass | 1256ms |  |
| Спиннер появляется при загрузке данных | ✅ pass | 2877ms |  |
| Кнопки имеют min-height:44px | ✅ pass | 2485ms |  |
| Заголовки страниц корректны | ✅ pass | 2452ms |  |
| Ссылки кабинетов на index.html видны | ✅ pass | 630ms |  |
| confirm() появляется при удалении | ✅ pass | 119ms |  |

## Accessibility Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Кнопки с emoji имеют aria-label | ✅ pass | 3003ms |  |
| Tab order логичный (вход → пароль → кнопка) | ✅ pass | 898ms |  |
| Focus сохраняется после закрытия модалки | ✅ pass | 986ms |  |
| Alt text на изображениях | ✅ pass | 3070ms |  |
| Color contrast — текст читаем на фоне | ✅ pass | 753ms |  |
| Focus visible indicator при tab navigation | ✅ pass | 469ms |  |

## Security Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Нет API ключей Supabase в HTML | ✅ pass | 3132ms |  |
| Нет Dadata токенов в HTML | ✅ pass | 3057ms |  |
| Нет паролей в API ответах | ✅ pass | 632ms |  |
| JWT token хранится в localStorage, не в куках | ✅ pass | 1054ms |  |
| Нет eval() или innerHTML с user data | ✅ pass | 3022ms |  |

## Performance Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Время загрузки каждой страницы < 3s | ✅ pass | 4903ms |  |
| Console не содержит ошибок JS | ✅ pass | 12925ms |  |
| Количество сетевых запросов при загрузке < 20 | ✅ pass | 8497ms |  |
| Размер DOM не превышает 5000 узлов | ✅ pass | 6915ms |  |

## Visual Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Скриншот каждой страницы в мобильном viewport | ✅ pass | 9198ms |  |
| Скриншот каждой страницы в desktop viewport | ✅ pass | 9711ms |  |
| Скриншот owner.html в dark mode | ✅ pass | 2859ms |  |

