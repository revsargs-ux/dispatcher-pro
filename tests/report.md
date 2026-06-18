# E2E Test Report

**Date:** 2026-06-18T03:04:26.161Z
**Status:** ❌ FAILED
**Duration:** 200.1s

| Metric | Value |
|---|---|
| Total | 38 |
| Passed | 35 |
| Failed | 3 |
| Warnings | 0 |
| Success Rate | 92% |

## Auth Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Worker регистрация + автовход | ✅ pass | 3345ms |  |
| Client регистрация + автовход | ✅ pass | 3422ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 2447ms |  |
| Owner вход (существующий) | ✅ pass | 5336ms |  |
| Wrong password → ошибка видна | ✅ pass | 3092ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 2524ms |  |
| Logout → возвращается на форму входа | ✅ pass | 5321ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 8334ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 5356ms |  |
| [Dispatcher] Пригласить рабочего | ✅ pass | 5298ms |  |
| [Worker] Смена видна в списке | ✅ pass | 5201ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 5242ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 5261ms |  |
| [Worker] Нажать Завершить | ✅ pass | 5240ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 5342ms |  |
| [Client] Подтвердить часы | ✅ pass | 5290ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 5297ms |  |
| [Dispatcher] Закрыть смену | ✅ pass | 5312ms |  |

## UX Audit

| Test | Status | Duration | Details |
|---|---|---|---|
| Все кнопки имеют читаемый текст (не пустые) | ✅ pass | 7011ms |  |
| Placeholder'ы в input информативны | ✅ pass | 7012ms |  |
| Toast-сообщения появляются при действии | ✅ pass | 5701ms |  |
| Пустые состояния (📭) на страницах без данных | ❌ fail | 8786ms | listHtml is not defined |
| При ошибке сети показывается toast | ✅ pass | 4741ms |  |
| Пароль скрывается за точками (type=password) | ✅ pass | 8020ms |  |
| Телефон форматируется при вводе | ✅ pass | 2128ms |  |
| Спиннер появляется при загрузке данных | ✅ pass | 4797ms |  |
| Кнопки имеют min-height:44px | ✅ pass | 7550ms |  |
| Заголовки страниц корректны | ✅ pass | 8020ms |  |
| Ссылки кабинетов на index.html видны | ✅ pass | 1535ms |  |
| confirm() появляется при удалении | ✅ pass | 1025ms |  |

## Accessibility Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Кнопки с emoji имеют aria-label | ❌ fail | 1535ms | dispatcher: 6 emoji buttons without aria-label: <button class="btn btn-sm btn-outline" onclick="document.getElementById('worker-password').value=Str, <button class="btn btn-sm btn-outline" onclick="document.getElementById('client-password').value=Str, <button class="btn btn-sm btn-outline" onclick="document.getElementById('dispatcher-password').value |
| Tab order логичный (вход → пароль → кнопка) | ✅ pass | 1658ms |  |
| Focus сохраняется после закрытия модалки | ✅ pass | 2081ms |  |
| Alt text на изображениях | ✅ pass | 6646ms |  |
| Color contrast — текст читаем на фоне | ✅ pass | 1531ms |  |
| Focus visible indicator при tab navigation | ✅ pass | 1251ms |  |

## Security Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Нет API ключей Supabase в HTML | ✅ pass | 7617ms |  |
| Нет Dadata токенов в HTML | ❌ fail | 6179ms | Navigating frame was detached |

