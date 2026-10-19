/**
 * YooKassa Webhook — приём уведомлений о платежах
 * POST /payment/webhook
 * Активация тарифа напрямую через node:sqlite (без Python)
 */
const { json, readBody } = require('./shared');

let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  console.error('[YooKassa-Webhook] node:sqlite not available:', e.message);
}

const DB_PATH = process.env.MINDAI_DB_PATH || '/app/data/billing.db';

function activateSubscription(tid, plan, paymentId) {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  
  // Регистрируем пользователя если нет
  db.prepare('INSERT OR IGNORE INTO users(telegram_id, plan, status, auto_renew) VALUES(?, ?, ?, ?)')
    .run(tid, 'free', 'active', 0);
  
  // Обновляем подписку
  const updated = db.prepare("UPDATE subscriptions SET status='active' WHERE payment_id=? AND status='pending'")
    .run(paymentId);
  
  if (updated.changes === 0) {
    db.prepare(`INSERT INTO subscriptions(telegram_id, plan, status, started_at, expires_at, payment_id) 
                VALUES(?, ?, 'active', datetime('now'), datetime('now','+30 days'), ?)`)
      .run(tid, plan, paymentId);
  }
  
  // Активируем тариф
  db.prepare("UPDATE users SET plan=?, status='active', auto_renew=1 WHERE telegram_id=?")
    .run(plan, tid);
  
  db.close();
  console.log(`[YooKassa-Webhook] ✅ Activated tid=${tid} plan=${plan} payment=${paymentId}`);
}

function savePaymentMethod(tid, methodId) {
  const db = new DatabaseSync(DB_PATH);
  db.prepare(`INSERT OR REPLACE INTO payment_methods(telegram_id, payment_method_id, saved_at) 
              VALUES(?, ?, datetime('now'))`)
    .run(tid, methodId);
  db.prepare("UPDATE subscriptions SET payment_method_id=? WHERE telegram_id=? AND status='active'")
    .run(methodId, tid);
  db.close();
  console.log(`[YooKassa-Webhook] Payment method saved: tid=${tid} method=${methodId}`);
}

async function handleYookassaWebhook(req, res, cors) {
  try {
    const rawBody = await readBody(req);
    console.log('[YooKassa-Webhook] Raw body:', rawBody.substring(0, 300));
    const body = JSON.parse(rawBody || '{}');
    
    const event = body.event;
    const payment = body.object || {};
    
    console.log('[YooKassa-Webhook] event:', event, 'payment_id:', payment.id, 'status:', payment.status);
    
    if (event === 'payment.succeeded' && payment.status === 'succeeded') {
      const metadata = payment.metadata || {};
      const telegramId = metadata.telegram_id;
      const plan = metadata.plan;
      
      if (!telegramId || !plan) {
        console.error('[YooKassa-Webhook] Missing metadata:', JSON.stringify(metadata));
        return json(res, { error: 'Missing metadata' }, 400, cors);
      }
      
      if (!DatabaseSync) {
        console.error('[YooKassa-Webhook] node:sqlite not available');
        return json(res, { error: 'DB driver not available' }, 503, cors);
      }
      
      try {
        activateSubscription(parseInt(telegramId), plan, payment.id);
      } catch (e) {
        console.error('[YooKassa-Webhook] Activation failed:', e.message);
        return json(res, { error: 'Activation failed: ' + e.message }, 500, cors);
      }
      
      if (payment.payment_method && payment.payment_method.id) {
        try {
          savePaymentMethod(parseInt(telegramId), payment.payment_method.id);
        } catch (e) {
          console.warn('[YooKassa-Webhook] Save method failed:', e.message);
        }
      }
      
      return json(res, { ok: true, activated: true }, 200, cors);
    }
    
    if (event === 'payment.canceled' || event === 'refund.succeeded') {
      console.log('[YooKassa-Webhook] Payment event:', event, 'id:', payment.id);
      return json(res, { ok: true }, 200, cors);
    }
    
    console.log('[YooKassa-Webhook] Unhandled event:', event);
    return json(res, { ok: true }, 200, cors);
    
  } catch (e) {
    console.error('[YooKassa-Webhook] Error:', e.message);
    return json(res, { error: 'Internal error' }, 500, cors);
  }
}

module.exports = { handleYookassaWebhook };
