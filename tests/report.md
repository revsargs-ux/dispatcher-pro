# E2E Test Report

**Date:** 2026-07-06T17:01:00.781Z
**Status:** ❌ FAILED
**Duration:** 190.2s

| Metric | Value |
|---|---|
| Total | 34 |
| Passed | 32 |
| Failed | 2 |
| Warnings | 0 |
| Success Rate | 94% |

## Auth Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Worker регистрация + автовход | ✅ pass | 3384ms |  |
| Client регистрация + автовход | ✅ pass | 3437ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 2544ms |  |
| Owner вход (существующий) | ✅ pass | 5328ms |  |
| Wrong password → ошибка видна | ✅ pass | 3275ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 2591ms |  |
| Logout → возвращается на форму входа | ✅ pass | 5391ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 8409ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 5373ms |  |
| [Dispatcher] Пригласить рабочего | ✅ pass | 5442ms |  |
| [Worker] Смена видна в списке | ✅ pass | 5154ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 5285ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 5315ms |  |
| [Worker] Нажать Завершить | ✅ pass | 5262ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 5420ms |  |
| [Client] Подтвердить часы | ✅ pass | 5314ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 5327ms |  |
| [Dispatcher] Закрыть смену | ✅ pass | 5304ms |  |

## UX Audit

| Test | Status | Duration | Details |
|---|---|---|---|
| Все кнопки имеют читаемый текст (не пустые) | ✅ pass | 7008ms |  |
| Placeholder'ы в input информативны | ✅ pass | 7006ms |  |
| Toast-сообщения появляются при действии | ✅ pass | 5735ms |  |
| Пустые состояния (📭) на страницах без данных | ❌ fail | 8821ms | listHtml is not defined |
| При ошибке сети показывается toast | ✅ pass | 4771ms |  |
| Пароль скрывается за точками (type=password) | ✅ pass | 8017ms |  |
| Телефон форматируется при вводе | ✅ pass | 2141ms |  |
| Спиннер появляется при загрузке данных | ✅ pass | 4813ms |  |
| Кнопки имеют min-height:44px | ✅ pass | 7537ms |  |
| Заголовки страниц корректны | ✅ pass | 8012ms |  |
| Ссылки кабинетов на index.html видны | ✅ pass | 1572ms |  |
| confirm() появляется при удалении | ✅ pass | 1033ms |  |

## Accessibility Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Кнопки с emoji имеют aria-label | ✅ pass | 7717ms |  |
| Tab order логичный (вход → пароль → кнопка) | ✅ pass | 1676ms |  |
| Focus сохраняется после закрытия модалки | ✅ pass | 2080ms |  |
| Alt text на изображениях | ❌ fail | 5469ms | Attempted to use detached Frame 'C103C7413421CD2BD96015000C5B69CD'. |

