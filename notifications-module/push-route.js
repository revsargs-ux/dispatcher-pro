/**
 * Dispatcher.PRO — Push Subscription Route
 * ОТДЕЛЬНЫЙ модуль для обработки push-подписок
 * Подключается в server.js через require, НЕ ломает routes.js
 * 
 * Маршрут: POST /api/push-subscription
 * Body: { endpoint, keys: { p256dh, auth }, platform }
 */
const { config } = require('../modules/config');
const { requireAuth } = require('../modules/auth');

function handlePushSubscription(req, res, cors) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', ...cors });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const { endpoint, keys, platform, user_role } = JSON.parse(body);
      if (!endpoint) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
        return res.end(JSON.stringify({ error: 'Missing endpoint' }));
      }

      // Verify session via JWT
      const session = requireAuth(req);
      const userId = session?.userId;
      if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json', ...cors });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      // Сохраняем/обновляем подписку в Supabase (upsert)
      const sbBody = {
        user_id: userId,
        user_role: user_role || 'worker', // Из тела запроса или по умолчанию
        platform: platform || 'web',
        push_endpoint: endpoint,
        push_keys: keys ? JSON.stringify(keys) : null,
        last_seen_at: new Date().toISOString(),
      };

      // Проверяем, есть ли уже запись с таким endpoint
      const checkRes = await fetch(
        `${config.sbUrl}/rest/v1/user_device_tokens?push_endpoint=eq.${encodeURIComponent(endpoint)}&select=id&limit=1`,
        {
          headers: {
            'apikey': config.sbKey,
            'Authorization': `Bearer ${config.sbKey}`,
          },
        }
      );
      const existing = await checkRes.json();

      if (existing && existing.length > 0) {
        // Обновляем
        await fetch(
          `${config.sbUrl}/rest/v1/user_device_tokens?id=eq.${existing[0].id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': config.sbKey,
              'Authorization': `Bearer ${config.sbKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sbBody),
          }
        );
      } else {
        // Создаём
        await fetch(`${config.sbUrl}/rest/v1/user_device_tokens`, {
          method: 'POST',
          headers: {
            'apikey': config.sbKey,
            'Authorization': `Bearer ${config.sbKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(sbBody),
        });
      }

      console.log('[PushSubscription] Saved for user:', userId);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error('[PushSubscription] Error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
  });
}

module.exports = { handlePushSubscription };
