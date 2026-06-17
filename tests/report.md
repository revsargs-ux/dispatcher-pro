# E2E Test Report

**Date:** 2026-06-17T23:40:34.480Z
**Status:** ❌ FAILED
**Duration:** 111.5s

| Metric | Value |
|---|---|
| Total | 23 |
| Passed | 17 |
| Failed | 6 |
| Warnings | 0 |
| Success Rate | 74% |

## Auth Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Worker регистрация + автовход | ✅ pass | 3322ms |  |
| Client регистрация + автовход | ✅ pass | 3403ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 2525ms |  |
| Owner вход (существующий) | ✅ pass | 5314ms |  |
| Wrong password → ошибка видна | ✅ pass | 3106ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 2440ms |  |
| Logout → возвращается на форму входа | ✅ pass | 5246ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 8364ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 5420ms |  |
| [Dispatcher] Пригласить рабочего | ❌ fail | 1007ms | No tabs found |
| [Worker] Смена видна в списке | ✅ pass | 5223ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 1ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 4ms |  |
| [Worker] Нажать Завершить | ✅ pass | 2ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 5024ms |  |
| [Client] Подтвердить часы | ✅ pass | 5307ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 5233ms |  |
| [Dispatcher] Закрыть смену | ❌ fail | 1005ms | Header not visible |

## Security Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Нет API ключей Supabase в HTML | ❌ fail | 8551ms | Waiting failed: 5000ms exceeded |
| Нет Dadata токенов в HTML | ❌ fail | 8577ms | Waiting failed: 5000ms exceeded |
| Нет паролей в API ответах | ✅ pass | 436ms |  |
| JWT token хранится в localStorage, не в куках | ❌ fail | 5809ms | Waiting failed: 5000ms exceeded |
| Нет eval() или innerHTML с user data | ❌ fail | 8554ms | Waiting failed: 5000ms exceeded |

