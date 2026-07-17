/**
 * Telegram bot — notifications, user linking, platform adapter
 * All shared logic is in bot-common.js
 */
const { config } = require('./config');
const fs = require('fs');
const path = require('path');
const { cmdHelp, cmdShifts, cmdEarnings, cmdOrders, cmdSelfEmployed, askAI } = require('./bot-common');

// AI rate limiting: 1 request per 5 seconds per user
const _aiRateLimit = new Map();
const AI_COOLDOWN_MS = 5000;
function canAskAI(chatId) {
  const now = Date.now();
  const last = _aiRateLimit.get(chatId) || 0;
  if (now - last < AI_COOLDOWN_MS) return false;
  _aiRateLimit.set(chatId, now);
  return true;
}
// Cleanup old entries every hour
setInterval(() => { const cutoff = Date.now() - 3600000; for (const [k,v] of _aiRateLimit) if (v < cutoff) _aiRateLimit.delete(k); }, 3600000);

let knowledgeBase = '';
try {
  knowledgeBase = fs.readFileSync(path.join(__dirname, '..', 'bot-knowledge.md'), 'utf8');
} catch (e) { console.error('[TG] Knowledge base not found'); }

// ============================================================
// Отправка сообщений (TG-specific)
// ============================================================
async function tgSendMessage(chatId, text, extra = {}) {
  try {
    await fetch(`${config.tgApi}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
  } catch (e) { console.error('[TG] Send error:', e.message); }
}

// ============================================================
// Уведомления
// ============================================================
async function tgNotify(table, phone, text) {
  try {
    const cleanPhone = (phone || '').replace(/[-+()\s]/g, '').replace(/^8/, '7');
    const safePhone = cleanPhone.slice(-10).replace(/[%_]/g, '');
    const res = await fetch(`${config.sbUrl}/rest/v1/${table}?phone=ilike.%25${safePhone}%25&select=telegram_chat_id,full_name&limit=1`, {
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
    });
    const rows = await res.json();
    if (!rows.length || !rows[0].telegram_chat_id) return;
    await tgSendMessage(rows[0].telegram_chat_id, text);
    console.log('[TG] Sent to', rows[0].full_name);
  } catch (e) { console.error('[TG] Notify error:', e.message); }
}

async function tgNotifyRole(role, text) {
  try {
    const res = await fetch(`${config.sbUrl}/rest/v1/users?role=eq.${role}&select=telegram_chat_id,full_name`, {
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
    });
    const users = await res.json();
    for (const u of users) {
      if (u.telegram_chat_id) await tgSendMessage(u.telegram_chat_id, text);
    }
  } catch (e) { console.error('[TG] NotifyRole error:', e.message); }
}

// ============================================================
// Определение пользователя по chatId
// ============================================================
async function identifyUser(chatId) {
  const headers = { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey };

  const wRes = await fetch(`${config.sbUrl}/rest/v1/workers?telegram_chat_id=eq.${chatId}&select=id,full_name,phone&limit=1`, { headers });
  const workers = await wRes.json();
  if (Array.isArray(workers) && workers.length) return { role: 'worker', ...workers[0] };

  const cRes = await fetch(`${config.sbUrl}/rest/v1/clients?telegram_chat_id=eq.${chatId}&select=id,name,contact&limit=1`, { headers });
  const clients = await cRes.json();
  if (Array.isArray(clients) && clients.length) return { role: 'client', full_name: clients[0].name, ...clients[0] };

  const uRes = await fetch(`${config.sbUrl}/rest/v1/users?telegram_chat_id=eq.${chatId}&select=id,full_name,role,phone&limit=1`, { headers });
  const users = await uRes.json();
  if (Array.isArray(users) && users.length) return { ...users[0] };

  return null;
}

// ============================================================
// WebApp (TG-specific)
// ============================================================
async function cmdWebApp(chatId, user) {
  const role = user.role;
  let url, text, btnText;
  if (role === 'client') {
    url = 'https://диспетчер-про.рф/tg-client.html';
    text = '📱 Откройте портал клиента:';
    btnText = '📱 Мои заказы';
  } else {
    url = 'https://диспетчер-про.рф/tg-worker.html';
    text = '📱 Откройте портал исполнителя:';
    btnText = '📱 Мои смены';
  }
  await tgSendMessage(chatId, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [[{ text: btnText, web_app: { url } }]]
    })
  });
}

// ============================================================
// Привязка пользователя (TG-specific)
// ============================================================
async function linkTgUser(chatId, phone, username) {
  try {
    const searchConfigs = [
      { table: 'users', phoneCol: 'phone', select: 'id,full_name,role,telegram_chat_id' },
      { table: 'workers', phoneCol: 'phone', select: 'id,full_name,telegram_chat_id' },
      { table: 'clients', phoneCol: 'contact', select: 'id,name,telegram_chat_id' }
    ];
    let found = null;
    for (const cfg of searchConfigs) {
      const safePhone = phone.slice(-10).replace(/[%_]/g, '');
      const res = await fetch(`${config.sbUrl}/rest/v1/${cfg.table}?${cfg.phoneCol}=ilike.%25${safePhone}%25&select=${cfg.select}&limit=1`, {
        headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
      });
      const rows = await res.json();
      if (rows.length && !rows.code) {
        const row = rows[0];
        found = { table: cfg.table, id: row.id, full_name: row.full_name || row.name, role: row.role || (cfg.table === 'workers' ? 'worker' : cfg.table === 'clients' ? 'client' : 'unknown') };
        break;
      }
    }
    if (!found) {
      await tgSendMessage(chatId, `❌ Номер +${phone} не найден в системе.\nПроверь номер или зарегистрируйся на сайте:\n👉 https://xn----gtbdan3bddhceo9d.xn--p1ai`);
      return;
    }
    await fetch(`${config.sbUrl}/rest/v1/${found.table}?id=eq.${found.id}`, {
      method: 'PATCH',
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_chat_id: chatId })
    });
    const roleNames = { owner: '👑 Владелец', dispatcher: '📋 Диспетчер', worker: '👷 Исполнитель', client: '🏢 Клиент' };
    await tgSendMessage(chatId, `✅ Привет, ${found.full_name}!\n\n${roleNames[found.role] || found.role}\n\nТеперь буду присылать уведомления о сменах.\nПиши /help — покажу что умею.`);
    console.log('[TG] Linked', found.full_name, '->', chatId);
  } catch (e) { console.error('[TG] Link error:', e.message); }
}

// ============================================================
// Чат пересылка
// ============================================================
const _tgChatFwdLimit = new Map();
async function tryForwardChat(chatId, user, text) {
  if (user.role !== 'worker' && user.role !== 'client') return false;

  const now = Date.now();
  const last = _tgChatFwdLimit.get(chatId) || 0;
  if (now - last < 2000) return false;
  _tgChatFwdLimit.set(chatId, now);

  try {
    let shiftIds = [];
    if (user.role === 'worker') {
      const aRes = await fetch(`${config.sbUrl}/rest/v1/shift_assignments?worker_id=eq.${user.id}&select=shift_id`, {
        headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
      });
      const assignments = await aRes.json();
      if (!Array.isArray(assignments)) return false;
      shiftIds = assignments.map(a => a.shift_id);
    } else {
      const sRes = await fetch(`${config.sbUrl}/rest/v1/shifts?client_id=eq.${user.id}&select=id`, {
        headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
      });
      const shifts = await sRes.json();
      if (!Array.isArray(shifts)) return false;
      shiftIds = shifts.map(s => s.id);
    }
    if (!shiftIds.length) return false;

    const validIds = shiftIds.filter(id => /^[0-9a-f-]{36}$/.test(id));
    if (!validIds.length) return false;
    const activeRes = await fetch(`${config.sbUrl}/rest/v1/shifts?id=in.(${validIds.join(',')})&status=in.(confirmed,in_progress,planned)&select=id&limit=5`, {
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
    });
    const activeShifts = await activeRes.json();
    if (!Array.isArray(activeShifts) || !activeShifts.length) return false;

    const targetShiftId = activeShifts[0].id;
    const senderName = user.full_name || 'Неизвестный';
    const msg = {
      shift_id: targetShiftId,
      sender_id: user.id,
      sender_role: user.role,
      sender_name: senderName,
      message: text.slice(0, 2000)
    };
    await fetch(`${config.sbUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(msg)
    });
    console.log(`[TG] Chat forwarded from ${senderName} (${user.role}) to shift ${targetShiftId}`);

    const { forwardChatNotification } = require('./bot-common');
    await forwardChatNotification(targetShiftId, user.role, user.id, senderName, text, tgSendMessage, async (chatId, text) => {
      await fetch(`${config.maxApi}/messages?user_id=${chatId}`, {
        method: 'POST',
        headers: { 'Authorization': config.maxBotToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4000) })
      }).catch(e => console.log('[TG] MAX notify error:', e.message));
    });

    await tgSendMessage(chatId, '✉️ Сообщение отправлено в чат смены');
    return true;
  } catch (e) {
    console.error('[TG] tryForwardChat error:', e.message);
    return false;
  }
}

// ============================================================
// Обработка входящих сообщений
// ============================================================
async function handleTgMessage(body) {
  const msg = body.message;
  if (!msg) return;

  if (msg.contact && msg.contact.phone_number) {
    const chatId = String(msg.chat.id);
    const phone = msg.contact.phone_number.replace(/[-+()\s]/g, '').replace(/^8/, '7');
    await linkTgUser(chatId, phone, msg.from?.username || '');
    return;
  }

  if (!msg.text) return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  // /start
  if (text === '/start' || text.startsWith('/start@')) {
    const existingUser = await identifyUser(chatId);
    if (existingUser) {
      const roleNames = { owner: '👑 Владелец', dispatcher: '📋 Диспетчер', worker: '👷 Исполнитель', client: '🏢 Клиент' };
      await tgSendMessage(chatId, `Привет, ${existingUser.full_name}! 👋\n\n${roleNames[existingUser.role] || existingUser.role}\n\nНужна помощь — пиши /help`);
      return;
    }
    const startPhone = text.split(' ')[1];
    if (startPhone) {
      const digits = startPhone.replace(/[-+()\s]/g, '').replace(/^8/, '7');
      if (/^7?\d{10}$/.test(digits) || /^\d{10}$/.test(digits)) {
        await linkTgUser(chatId, '7' + digits.replace(/^7/, ''), msg.from?.username || '');
        return;
      }
    }
    await tgSendMessage(chatId, 'Привет! 👋\nЧтобы я мог тебе помогать, привяжи номер телефона:\n\n<code>+7XXXXXXXXXX</code>\n\nИли нажми кнопку ниже.', {
      reply_markup: JSON.stringify({ keyboard: [[{ text: '📱 Отправить номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true })
    });
    return;
  }

  // Номер телефона — привязка
  const digits = text.replace(/[-+()\s]/g, '');
  if (/^7\d{10}$/.test(digits) || /^8\d{10}$/.test(digits)) {
    await linkTgUser(chatId, digits.replace(/^8/, '7'), msg.from?.username || '');
    return;
  }

  // Определяем пользователя
  const user = await identifyUser(chatId);
  if (!user) {
    return tgSendMessage(chatId, 'Ты не привязан к системе. Отправь номер телефона или нажми /start');
  }

  // === Команды ===
  const cmd = text.toLowerCase().split('@')[0];
  if (cmd === '/webapp' || cmd === '/app') return await cmdWebApp(chatId, user);
  // /help, /shifts и прочие — через AI, не шаблоны

  // === Чат пересылка ===
  const chatForwarded = await tryForwardChat(chatId, user, text);
  if (chatForwarded) return;

  // === AI (из bot-common) ===
  if (!canAskAI(chatId)) {
    await tgSendMessage(chatId, '⏳ Подождите несколько секунд перед следующим вопросом');
    return;
  }
  await askAI(chatId, user, text, tgSendMessage, knowledgeBase, { isFirst: !_aiRateLimit.has(chatId) });
}

// ============================================================
// Long Polling
// ============================================================
let tgLastUpdateId = 0;
let pollingActive = false;
let pollRetryCount = 0;

async function startPolling() {
  if (pollingActive) return;
  try {
    const whRes = await fetch(`${config.tgApi}/deleteWebhook?drop_pending_updates=true`);
    const whData = await whRes.json();
    console.log('[TG] deleteWebhook:', JSON.stringify(whData));
  } catch (e) {
    console.error('[TG] deleteWebhook error:', e.message);
  }
  pollingActive = true;
  console.log('[TG] Polling started');
  while (pollingActive) {
    try {
      const res = await fetch(`${config.tgApi}/getUpdates?offset=${tgLastUpdateId + 1}&timeout=30&allowed_updates=["message","callback_query"]`, {
        signal: AbortSignal.timeout(config.pollTimeout)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok && data.result && data.result.length) {
        for (const update of data.result) {
          tgLastUpdateId = Math.max(tgLastUpdateId, update.update_id);
          try { await handleTgMessage(update); } catch(e) { console.error('[TG] Handler error:', e.message); }
        }
      }
      pollRetryCount = 0;
    } catch (e) {
      pollRetryCount++;
      const backoff = Math.min(5000 * pollRetryCount, 60000);
      console.error(`[TG] Poll error (${pollRetryCount}/${config.pollMaxRetries}, retry in ${backoff/1000}s):`, e.message);
      if (pollRetryCount >= config.pollMaxRetries) {
        console.error('[TG] Max retries, cooling down for 5 minutes...');
        await new Promise(r => setTimeout(r, 300000));
        pollRetryCount = 0;
      } else {
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
}

module.exports = { tgNotify, tgNotifyRole, tgSendMessage, handleTgMessage, startPolling };
