# E2E Test Report

**Date:** 2026-06-17T23:55:43.333Z
**Status:** ❌ FAILED
**Duration:** 270.7s

| Metric | Value |
|---|---|
| Total | 48 |
| Passed | 42 |
| Failed | 6 |
| Warnings | 0 |
| Success Rate | 88% |

## Auth Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Worker регистрация + автовход | ✅ pass | 3320ms |  |
| Client регистрация + автовход | ✅ pass | 3432ms |  |
| Dispatcher регистрация (через index) | ✅ pass | 2528ms |  |
| Owner вход (существующий) | ✅ pass | 5385ms |  |
| Wrong password → ошибка видна | ✅ pass | 3094ms |  |
| Дубликат регистрации → ошибка видна | ✅ pass | 2531ms |  |
| Logout → возвращается на форму входа | ✅ pass | 5313ms |  |
| Авторизация на всех 4 страницах | ✅ pass | 8449ms |  |

## Shift Lifecycle Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| [Dispatcher] Создать смену на завтра | ✅ pass | 5375ms |  |
| [Dispatcher] Пригласить рабочего | ✅ pass | 5298ms |  |
| [Worker] Смена видна в списке | ✅ pass | 4833ms |  |
| [Worker] Нажать Подтвердить | ✅ pass | 5231ms |  |
| [Worker] Нажать Начать работу | ✅ pass | 5235ms |  |
| [Worker] Нажать Завершить | ✅ pass | 5232ms |  |
| [Dispatcher] Ввести часы | ✅ pass | 5348ms |  |
| [Client] Подтвердить часы | ✅ pass | 5322ms |  |
| [Dispatcher] Ввести оплату | ✅ pass | 5316ms |  |
| [Dispatcher] Закрыть смену | ✅ pass | 5302ms |  |

## UX Audit

| Test | Status | Duration | Details |
|---|---|---|---|
| Все кнопки имеют читаемый текст (не пустые) | ✅ pass | 6999ms |  |
| Placeholder'ы в input информативны | ✅ pass | 7008ms |  |
| Toast-сообщения появляются при действии | ❌ fail | 4733ms | No toast or error shown after failed login |
| Пустые состояния (📭) на страницах без данных | ❌ fail | 5776ms | No empty state shown when no data |
| При ошибке сети показывается toast | ✅ pass | 4760ms |  |
| Пароль скрывается за точками (type=password) | ✅ pass | 8003ms |  |
| Телефон форматируется при вводе | ✅ pass | 2144ms |  |
| Спиннер появляется при загрузке данных | ✅ pass | 4866ms |  |
| Кнопки имеют min-height:44px | ❌ fail | 7395ms | owner: 6 buttons below 44px: ◀: 36px, ▶: 36px, 📥 CSV: 36px |
| Заголовки страниц корректны | ✅ pass | 8011ms |  |
| Ссылки кабинетов на index.html видны | ✅ pass | 1534ms |  |
| confirm() появляется при удалении | ✅ pass | 1036ms |  |

## Accessibility Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Кнопки с emoji имеют aria-label | ❌ fail | 1543ms | dispatcher: emoji buttons without aria-label: <button class="btn btn-outline" onclick="loadShifts()">🔍</button>, <button class="btn btn-sm btn-outline" onclick="document.getElementById('worker-password').value=Str, <button class="btn btn-sm btn-outline" onclick="document.getElementById('client-password').value=Str |
| Tab order логичный (вход → пароль → кнопка) | ✅ pass | 1657ms |  |
| Focus сохраняется после закрытия модалки | ✅ pass | 2055ms |  |
| Alt text на изображениях | ✅ pass | 6689ms |  |
| Color contrast — текст читаем на фоне | ❌ fail | 1533ms | Poor contrast on 13 elements: "Dispatcher.PRO" ratio: 1.7, "Зарегистрироваться" ratio: 1.7, "Войти" ratio: 1.7 |
| Focus visible indicator при tab navigation | ✅ pass | 1244ms |  |

## Security Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Нет API ключей Supabase в HTML | ✅ pass | 7382ms |  |
| Нет Dadata токенов в HTML | ✅ pass | 8036ms |  |
| Нет паролей в API ответах | ✅ pass | 900ms |  |
| JWT token хранится в localStorage, не в куках | ✅ pass | 2872ms |  |
| Нет eval() или innerHTML с user data | ✅ pass | 6629ms |  |

## Performance Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Время загрузки каждой страницы < 3s | ✅ pass | 4972ms |  |
| Console не содержит ошибок JS | ❌ fail | 14071ms | Console errors found:
dispatcher: Manifest fetch from http://localhost:3000/manifest.json failed, code 403
worker: Manifest fetch from http://localhost:3000/manifest.json failed, code 403; showMain error: ReferenceError: showMain is not defined
client: Manifest fetch from http://localhost:3000/manifest.json failed, code 403
owner: A bad HTTP response code (403) was received when fetching the script.; Manifest fetch from http://localhost:3000/manifest.json failed, code 403 |
| Количество сетевых запросов при загрузке < 20 | ✅ pass | 10188ms |  |
| Размер DOM не превышает 5000 узлов | ✅ pass | 7740ms |  |

## Visual Tests

| Test | Status | Duration | Details |
|---|---|---|---|
| Скриншот каждой страницы в мобильном viewport | ✅ pass | 10400ms |  |
| Скриншот каждой страницы в desktop viewport | ✅ pass | 10786ms |  |
| Скриншот owner.html в dark mode | ✅ pass | 2688ms |  |

