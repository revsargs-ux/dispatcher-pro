
## 2026-07-30 — Архитектурный долг

### Webhook MindAI в контейнере Dispatcher.PRO
**Проблема:** Webhook для оплаты MindAI физически смонтирован внутри контейнера Dispatcher.PRO через `billing.db` (bind mount). Любой рестарт/деплой Dispatcher.PRO рискует задеть платёжный webhook MindAI.

**Причина сегодняшнего сбоя:** Серия рестартов Dispatcher.PRO (из-за проблем с MindAI) вызвала потерю связи с Telegram на ~1 час.

**Решение:** Вынести webhook MindAI в отдельный, независимый контейнер/сервис. Не сегодня, но не забыть.

### dispatcher.db (SQLite) — 0 байт после рестарта
**Проблема:** Перезапуск пересоздал пустой `dispatcher.db`. Логи показали "All up to date" — но таблиц не было.

**Защита:** Не полагаться на чистые логи. После рестарта проверять реальное состояние данных (запрос к Supabase / веб-интерфейс).

## 2026-07-30 — Развязка MindAI и Dispatcher.PRO (ВЫПОЛНЕНО)

### Новая топология серверов
- **93.189.230.107** — Dispatcher.PRO, Тано (@TanoShef_bot), Traefik, n8n
- **2.58.98.136** — всё MindAI: gateway (порт 19001), webhook-сервис, billing.db, @Mind_AI_hub_bot

### Что сделано
- Webhook YooKassa вынесен в отдельный контейнер на 136-м (mindai-webhook)
- Домен: pay.mindaihub.ru → 2.58.98.136 (Nginx + Certbot TLS)
- Webhook URL в YooKassa обновлён → https://pay.mindaihub.ru/payment/webhook
- OpenClaw MindAI gateway перенесён на 136-й (systemd: /etc/systemd/system/openclaw-mindai.service)
- billing.db перенесён на 136-й: /opt/mindai/data/billing.db
- Из Dispatcher.PRO УБРАНО: bind mount billing.db, routes/yookassa-webhook.js, route handler /payment/webhook
- MindAI gateway на 107-м остановлен (systemctl --user stop openclaw-mindai)

### Файлы на 136-м
- /opt/mindai/webhook-service/ — webhook-сервис (server.js, Dockerfile, docker-compose.yml)
- /opt/mindai/data/billing.db — база подписок
- /home/n8n/.openclaw-mindai/ — state dir OpenClaw MindAI gateway
- /etc/nginx/sites-available/mindaihub.ru — Nginx конфиг

### Файлы на 107-м (оставшиеся, можно удалить)
- /home/n8n/.openclaw/agents/mindai/ — старый workspace (сессии, media)
- /home/n8n/.openclaw-mindai/ — старый state dir
- /home/n8n/dispatcher-deploy/routes/yookassa-webhook.js — мёртвый код (route убран, файл остался)
- ~/.config/systemd/user/openclaw-mindai.service — остановлен, disabled
