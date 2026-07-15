/**
 * Dispatcher.PRO — Push Notification Trigger
 * Вызывает Edge Function для отправки push-уведомлений
 * Подключается к routes.js, НЕ ломает существующие уведомления
 */
const { config } = require('../modules/config');

const EDGE_FUNCTION_URL = `${config.sbUrl}/functions/v1/send-notification`;
const WEBHOOK_SECRET = process.env.PUSH_SECRET || '';
if (!WEBHOOK_SECRET) {
  console.error('[Push] FATAL: PUSH_SECRET not set — push disabled for security');
}

const fs = require('fs');
const path = require('path');

const PUSH_LOG = path.join(__dirname, '..', 'data', 'push-errors.log');

function logPushError(context, error) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${context}: ${error.message || error}\n`;
  console.error(line.trim());
  try {
    fs.appendFileSync(PUSH_LOG, line);
  } catch (_) {}
}

/**
 * Отправляет push-уведомление через Edge Function
 * Вызывается АСИНХРОННО — не блокирует основную логику
 * @param {Object} params
 * @param {string} params.userId - ID пользователя (worker/client/user)
 * @param {string} params.userRole - worker / client / dispatcher / owner
 * @param {string} params.eventType - new_shift / shift_assigned / payment_status / etc
 * @param {string} params.title - заголовок уведомления
 * @param {string} params.body - текст уведомления
 * @param {string} params.priority - high / normal / low
 * @param {string} [params.deepLink] - ссылка для перехода при клике
 */
function sendPushNotification({ userId, userRole, eventType, title, body, priority = 'normal', deepLink }) {
  // Асинхронный вызов — не ждём результат, не блокируем
  fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.sbKey}`,
      'X-Webhook-Secret': WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      userId,
      userRole,
      eventType,
      priority,
      title,
      body,
      deepLink: deepLink || '/',
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.status !== 'skipped') {
        console.log('[Push]', eventType, '→', userId, ':', data.status);
      }
    })
    .catch((e) => {
      // Ошибка push НЕ ломает основную логику, но логируем с деталями
      logPushError(`[Push] userId=${userId}, eventType=${eventType}, title=${title}`, e);
    });
}

/**
 * Отправляет push всем пользователям определённой роли
 */
async function sendPushToRole(role, { eventType, title, body, priority = 'normal', deepLink }) {
  try {
    const res = await fetch(
      `${config.sbUrl}/rest/v1/users?role=eq.${role}&is_active=eq.true&select=id`,
      { headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey } }
    );
    const users = await res.json();
    for (const u of users) {
      sendPushNotification({ userId: u.id, userRole: role, eventType, title, body, priority, deepLink });
    }
  } catch (e) {
    logPushError(`[Push] Role broadcast role=${role}, eventType=${eventType}`, e);
  }
}

module.exports = { sendPushNotification, sendPushToRole };
