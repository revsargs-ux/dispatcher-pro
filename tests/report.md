# E2E Test Report

**Date:** 2026-07-21T15:37:29.441Z
**Status:** ✅ PASSED
**Duration:** 167.3s

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
| Worker регистрация + автовход | ✅ pass | 1503ms |  |
| Client регистрация + автовход | ✅ pass | 1440ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 552ms |  |
| Owner вход (существующий) | ✅ pass | 601ms |  |
| Wrong password → ошибка видна | ✅ pass | 1207ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 540ms |  |
| Logout → возвращается на форму входа | ✅ pass | 2254ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 513ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 3373ms |  |
| [Dispatcher] Пригласить рабочего | ✅ pass | 3317ms |  |
| [Worker] Смена видна в списке | ✅ pass | 3366ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 3350ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 3302ms |  |
| [Worker] Нажать Завершить | ✅ pass | 3313ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 3333ms |  |
| [Client] Подтвердить часы | ✅ pass | 3297ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 3309ms |  |
| [Dispatcher] Закрыть смену | ✅ pass | 3326ms |  |

## UX Audit

| Test | Status | Duration | Details |
|---|---|---|---|
| Все кнопки имеют читаемый текст (не пустые) | ✅ pass | 2508ms |  |
| Placeholder'ы в input информативны | ✅ pass | 2467ms |  |
| Toast-сообщения появляются при действии | ✅ pass | 3772ms |  |
| Пустые состояния (📭) на страницах без данных | ✅ pass | 6860ms |  |
| При ошибке сети показывается toast | ✅ pass | 3914ms |  |
| Пароль скрывается за точками (type=password) | ✅ pass | 2541ms |  |
| Телефон форматируется при вводе | ✅ pass | 1230ms |  |
| Спиннер появляется при загрузке данных | ✅ pass | 2862ms |  |
| Кнопки имеют min-height:44px | ✅ pass | 2551ms |  |
| Заголовки страниц корректны | ✅ pass | 2500ms |  |
| Ссылки кабинетов на index.html видны | ✅ pass | 671ms |  |
| confirm() появляется при удалении | ✅ pass | 137ms |  |

## Accessibility Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Кнопки с emoji имеют aria-label | ✅ pass | 3018ms |  |
| Tab order логичный (вход → пароль → кнопка) | ✅ pass | 875ms |  |
| Focus сохраняется после закрытия модалки | ✅ pass | 885ms |  |
| Alt text на изображениях | ✅ pass | 3040ms |  |
| Color contrast — текст читаем на фоне | ✅ pass | 758ms |  |
| Focus visible indicator при tab navigation | ✅ pass | 519ms |  |

## Security Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Нет API ключей Supabase в HTML | ✅ pass | 3110ms |  |
| Нет Dadata токенов в HTML | ✅ pass | 3059ms |  |
| Нет паролей в API ответах | ✅ pass | 357ms |  |
| JWT token хранится в localStorage, не в куках | ✅ pass | 1029ms |  |
| Нет eval() или innerHTML с user data | ✅ pass | 3045ms |  |

## Performance Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Время загрузки каждой страницы < 3s | ✅ pass | 4903ms |  |
| Console не содержит ошибок JS | ✅ pass | 12922ms |  |
| Количество сетевых запросов при загрузке < 20 | ✅ pass | 8510ms |  |
| Размер DOM не превышает 5000 узлов | ✅ pass | 6924ms |  |

## Visual Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Скриншот каждой страницы в мобильном viewport | ✅ pass | 9190ms |  |
| Скриншот каждой страницы в desktop viewport | ✅ pass | 9676ms |  |
| Скриншот owner.html в dark mode | ✅ pass | 2902ms |  |

