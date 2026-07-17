/**
 * МАКС бот — notifications, user linking, platform adapter
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
} catch (e) { console.error('[MAX] Knowledge base not found'); }

const MAX_API = config.maxApi;
const MAX_TOKEN = config.maxBotToken;

// ============================================================
// Отправка сообщений (MAX-specific)
// ============================================================
async function maxSendMessage(userId, text, attachments) {
  try {
    const body = { text: text.slice(0, 4000) };
    if (attachments) body.attachments = attachments;
    await fetch(`${MAX_API}/messages?user_id=${userId}`, {
      method: 'POST',
      headers: { 'Authorization': MAX_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) { console.error('[MAX] Send error:', e.message); }
}

// ============================================================
// Уведомления
// ============================================================
async function maxNotify(table, phone, text) {
  try {
    const cleanPhone = (phone || '').replace(/[-+()\s]/g, '').replace(/^8/, '7');
    const safePhone = cleanPhone.slice(-10).replace(/[%_]/g, '');
    const res = await fetch(`${config.sbUrl}/rest/v1/${table}?phone=ilike.%25${safePhone}%25&select=max_chat_id,full_name&limit=1`, {
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
    });
    const rows = await res.json();
    if (!rows.length || !rows[0].max_chat_id) return;
    await maxSendMessage(rows[0].max_chat_id, text);
    console.log('[MAX] Sent to', rows[0].full_name);
  } catch (e) { console.error('[MAX] Notify error:', e.message); }
}

async function maxNotifyRole(role, text) {
  try {
    const res = await fetch(`${config.sbUrl}/rest/v1/users?role=eq.${role}&select=max_chat_id,full_name`, {
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
    });
    const users = await res.json();
    for (const u of users) {
      if (u.max_chat_id) await maxSendMessage(u.max_chat_id, text);
    }
  } catch (e) { console.error('[MAX] NotifyRole error:', e.message); }
}

// ============================================================
// Определение пользователя по max_chat_id
// ============================================================
async function identifyMaxUser(chatId) {
  const headers = { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey };

  const wRes = await fetch(`${config.sbUrl}/rest/v1/workers?max_chat_id=eq.${chatId}&select=id,full_name,phone&limit=1`, { headers });
  const workers = await wRes.json();
  if (Array.isArray(workers) && workers.length) return { role: 'worker', ...workers[0] };

  const cRes = await fetch(`${config.sbUrl}/rest/v1/clients?max_chat_id=eq.${chatId}&select=id,name,contact&limit=1`, { headers });
  const clients = await cRes.json();
  if (Array.isArray(clients) && clients.length) return { role: 'client', full_name: clients[0].name, ...clients[0] };

  const uRes = await fetch(`${config.sbUrl}/rest/v1/users?max_chat_id=eq.${chatId}&select=id,full_name,role,phone&limit=1`, { headers });
  const users = await uRes.json();
  if (Array.isArray(users) && users.length) return { ...users[0] };

  return null;
}

// ============================================================
// Привязка пользователя (MAX-specific)
// ============================================================
async function linkMaxUser(chatId, phone) {
  try {
    const searchConfigs = [
      { table: 'users', phoneCol: 'phone', select: 'id,full_name,role,max_chat_id' },
      { table: 'workers', phoneCol: 'phone', select: 'id,full_name,max_chat_id' },
      { table: 'clients', phoneCol: 'contact', select: 'id,name,max_chat_id' }
    ];
    let found = null;
    for (const cfg of searchConfigs) {
      const safePhone = phone.slice(-10).replace(/[%_]/g, '');
      const res = await fetch(`${config.sbUrl}/rest/v1/${cfg.table}?${cfg.phoneCol}=ilike.%25${safePhone}%25&select=${cfg.select}&limit=1`, {
        headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
      });
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) {
        const row = rows[0];
        found = { table: cfg.table, id: row.id, full_name: row.full_name || row.name, role: row.role || (cfg.table === 'workers' ? 'worker' : cfg.table === 'clients' ? 'client' : 'unknown') };
        break;
      }
    }
    if (!found) {
      await maxSendMessage(chatId, `❌ Пользователь с номером +${phone} не найден в Dispatcher.PRO.\nПроверьте номер или зарегистрируйтесь в системе.`);
      return;
    }
    await fetch(`${config.sbUrl}/rest/v1/${found.table}?id=eq.${found.id}`, {
      method: 'PATCH',
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_chat_id: chatId })
    });
    const roleNames = { owner: '👑 Владелец', dispatcher: '📋 Диспетчер', worker: '👷 Исполнитель', client: '🏢 Клиент' };
    await maxSendMessage(chatId, `✅ Привязка успешна!\n\n👤 ${found.full_name}\n${roleNames[found.role] || found.role}\n\nТеперь буду присылать уведомления о сменах.\n\nПиши /help — покажу что умею.`);
    console.log('[MAX] Linked', found.full_name, '->', chatId);
  } catch (e) { console.error('[MAX] Link error:', e.message); }
}

// ============================================================
// Чат пересылка
// ============================================================
const _maxChatFwdLimit = new Map();
async function tryForwardChat(chatId, user, text) {
  if (user.role !== 'worker' && user.role !== 'client') return false;

  const now = Date.now();
  const last = _maxChatFwdLimit.get(chatId) || 0;
  if (now - last < 2000) return false;
  _maxChatFwdLimit.set(chatId, now);

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
    console.log(`[MAX] Chat forwarded from ${senderName} (${user.role}) to shift ${targetShiftId}`);

    const { forwardChatNotification } = require('./bot-common');
    await forwardChatNotification(targetShiftId, user.role, user.id, senderName, text, async (chatId, text) => {
      await fetch(`${config.tgApi}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
      }).catch(e => console.log('[MAX] TG notify error:', e.message));
    }, maxSendMessage);

    await maxSendMessage(chatId, '✉️ Сообщение отправлено в чат смены');
    return true;
  } catch (e) {
    console.error('[MAX] tryForwardChat error:', e.message);
    return false;
  }
}

// ============================================================
// Обработка входящих сообщений
// ============================================================
async function handleMaxMessage(update) {
  console.log('[MAX] Update:', JSON.stringify(update).slice(0, 300));
  const updateType = update.update_type;

  // bot_started
  if (updateType === 'bot_started') {
    const chatId = update.user?.user_id;
    if (!chatId) return;
    const existingUser = await identifyMaxUser(chatId);
    if (existingUser) {
      const roleNames = { owner: '👑 Владелец', dispatcher: '📋 Диспетчер', worker: '👷 Исполнитель', client: '🏢 Клиент' };
      await maxSendMessage(chatId, `Привет, ${existingUser.full_name}! 👋\n\n${roleNames[existingUser.role] || existingUser.role}\n\nНужна помощь — пиши /help`);
    } else {
      await maxSendMessage(chatId, 'Привет! 👋 Отправь номер телефона, чтобы привязаться:\n\nФормат: +7XXXXXXXXXX');
    }
    return;
  }

  // message_created
  if (updateType !== 'message_created') return;
  const msg = update.message;
  if (!msg) return;
  const text = (msg.body?.text || '').trim();
  if (!text) return;

  const chatId = msg.sender?.user_id;
  if (!chatId) return;

  // /start
  if (text === '/start' || text.startsWith('/start')) {
    const existingUser = await identifyMaxUser(chatId);
    if (existingUser) {
      const roleNames = { owner: '👑 Владелец', dispatcher: '📋 Диспетчер', worker: '👷 Исполнитель', client: '🏢 Клиент' };
      await maxSendMessage(chatId, `Привет, ${existingUser.full_name}! 👋\n\n${roleNames[existingUser.role] || existingUser.role}\n\nНужна помощь — пиши /help`);
      return;
    }
    await maxSendMessage(chatId, 'Привет! 👋 Отправь номер телефона, чтобы привязаться:\n\nФормат: +7XXXXXXXXXX', [
      { type: 'inline_keyboard', payload: { buttons: [[{ type: 'request_contact', text: '📱 Отправить номер' }]] } }
    ]);
    return;
  }

  // Контакт
  if (msg.body?.contact) {
    const phone = (msg.body.contact.phone || '').replace(/[-+()\s]/g, '').replace(/^8/, '7');
    if (phone.length >= 10) {
      await linkMaxUser(chatId, phone);
      return;
    }
  }

  // Номер телефона текстом
  const digits = text.replace(/[-+()\s]/g, '');
  if (/^7\d{10}$/.test(digits) || /^8\d{10}$/.test(digits)) {
    await linkMaxUser(chatId, digits.replace(/^8/, '7'));
    return;
  }

  // Определяем пользователя
  const user = await identifyMaxUser(chatId);
  if (!user) {
    return maxSendMessage(chatId, 'Ты не привязан к системе. Отправь номер или нажми /start');
  }

  // === Команды — всё через AI, только /webapp отдельно ===
  // /help, /shifts, /earnings и прочие — AI ответит живо

  // === Чат пересылка ===
  const chatForwarded = await tryForwardChat(chatId, user, text);
  if (chatForwarded) return;

  // === AI (из bot-common) ===
  if (!canAskAI(chatId)) {
    await maxSendMessage(chatId, '⏳ Подождите несколько секунд перед следующим вопросом');
    return;
  }
  await askAI(chatId, user, text, maxSendMessage, knowledgeBase, { isFirst: !_aiRateLimit.has(chatId) });
}

// ============================================================
// Long Polling МАКС
// ============================================================
let maxMarker = null;
let maxPollingActive = false;
let maxRetryCount = 0;

async function startMaxPolling() {
  if (maxPollingActive) return;
  maxPollingActive = true;
  console.log('[MAX] Polling started');
  while (maxPollingActive) {
    try {
      const url = `${MAX_API}/updates?timeout=25&limit=100` + (maxMarker ? `&marker=${maxMarker}` : '');
      const res = await fetch(url, {
        headers: { 'Authorization': MAX_TOKEN },
        signal: AbortSignal.timeout(35000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.updates && data.updates.length) {
        for (const update of data.updates) {
          maxMarker = update.update_id || maxMarker;
          try { await handleMaxMessage(update); } catch (e) { console.error('[MAX] Handler error:', e.message); }
        }
        if (data.marker) maxMarker = data.marker;
      } else if (data.marker) {
        maxMarker = data.marker;
      }
      maxRetryCount = 0;
    } catch (e) {
      maxRetryCount++;
      const backoff = Math.min(5000 * maxRetryCount, 60000);
      console.error(`[MAX] Poll error (${maxRetryCount}/10, retry in ${backoff / 1000}s):`, e.message);
      if (maxRetryCount >= 10) {
        console.error('[MAX] Max retries, cooling down for 5 minutes...');
        await new Promise(r => setTimeout(r, 300000));
        maxRetryCount = 0;
      } else {
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
}

module.exports = { maxSendMessage, maxNotify, maxNotifyRole, startMaxPolling, handleMaxMessage };
