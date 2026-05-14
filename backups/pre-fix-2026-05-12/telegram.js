/**
 * Telegram bot — notifications, user linking, long polling
 */
const { config } = require('./config');

async function tgSendMessage(chatId, text, extra = {}) {
  try {
    await fetch(`${config.tgApi}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
  } catch (e) { console.error('[TG] Send error:', e.message); }
}

// Send notification to a user by phone number
async function tgNotify(table, phone, text) {
  try {
    const cleanPhone = (phone || '').replace(/[-+()\s]/g, '').replace(/^8/, '7');
    const res = await fetch(`${config.sbUrl}/rest/v1/${table}?phone=ilike.%25${cleanPhone.slice(-10)}%25&select=telegram_chat_id,full_name&limit=1`, {
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }
    });
    const rows = await res.json();
    if (!rows.length || !rows[0].telegram_chat_id) return;
    await tgSendMessage(rows[0].telegram_chat_id, text);
    console.log('[TG] Sent to', rows[0].full_name);
  } catch (e) { console.error('[TG] Notify error:', e.message); }
}

// Notify all users by role
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

// Link Telegram user to system account
async function linkTgUser(chatId, phone, username) {
  try {
    const searchConfigs = [
      { table: 'users', phoneCol: 'phone', select: 'id,full_name,role,telegram_chat_id' },
      { table: 'workers', phoneCol: 'phone', select: 'id,full_name,telegram_chat_id' },
      { table: 'clients', phoneCol: 'contact', select: 'id,name,telegram_chat_id' }
    ];
    let found = null;
    for (const cfg of searchConfigs) {
      const res = await fetch(`${config.sbUrl}/rest/v1/${cfg.table}?${cfg.phoneCol}=ilike.%25${phone.slice(-10)}%25&select=${cfg.select}&limit=1`, {
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
      await tgSendMessage(chatId, '❌ Пользователь с номером +' + phone + ' не найден в Dispatcher.PRO.\nПроверьте номер или зарегистрируйтесь в системе.');
      return;
    }
    await fetch(`${config.sbUrl}/rest/v1/${found.table}?id=eq.${found.id}`, {
      method: 'PATCH',
      headers: { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_chat_id: chatId })
    });
    const roleNames = { owner: '👑 Владелец', dispatcher: '📋 Диспетчер', worker: '👷 Исполнитель', client: '🏢 Клиент' };
    await tgSendMessage(chatId, `✅ Привязка успешна!\n\n👤 ${found.full_name}\n🏷 ${roleNames[found.role] || found.role}\n\nТеперь вы будете получать уведомления от Dispatcher.PRO.`);
    console.log('[TG] Linked', found.full_name, '->', chatId);
  } catch (e) { console.error('[TG] Link error:', e.message); }
}

// Handle incoming Telegram messages
async function handleTgMessage(body) {
  const msg = body.message;
  if (!msg || !msg.text) {
    if (msg && msg.contact && msg.contact.phone_number) {
      const chatId = String(msg.chat.id);
      const phone = msg.contact.phone_number.replace(/[-+()\s]/g, '').replace(/^8/, '7');
      await linkTgUser(chatId, phone, msg.from?.username || '');
    }
    return;
  }
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  if (text === '/start' || text.startsWith('/start@')) {
    const startPhone = text.split(' ')[1];
    if (startPhone) {
      const digits = startPhone.replace(/[-+()\s]/g, '').replace(/^8/, '7');
      if (/^7?\d{10}$/.test(digits) || /^\d{10}$/.test(digits)) {
        const phone = digits.replace(/^7/, '');
        await linkTgUser(chatId, '7' + phone, msg.from?.username || '');
        return;
      }
    }
    await tgSendMessage(chatId, '👋 Привет! Чтобы привязать Telegram к Dispatcher.PRO, отправь свой номер телефона:\n\n<code>+7XXXXXXXXXX</code>\n\nИли нажми кнопку ниже, чтобы отправить контакт.', {
      reply_markup: JSON.stringify({ keyboard: [[{ text: '📱 Отправить номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true })
    });
    return;
  }

  const digits = text.replace(/[-+()\s]/g, '');
  if (/^7\d{10}$/.test(digits) || /^8\d{10}$/.test(digits)) {
    const phone = digits.replace(/^8/, '7');
    await linkTgUser(chatId, phone, msg.from?.username || '');
    return;
  }

  await tgSendMessage(chatId, 'Отправьте номер телефона для привязки к Dispatcher.PRO, или /start для начала.');
}

// === Long Polling ===
let tgLastUpdateId = 0;
let pollingActive = false;
let pollRetryCount = 0;

async function startPolling() {
  if (pollingActive) return;
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
          try { handleTgMessage(update); } catch(e) { console.error('[TG] Poll handler error:', e.message); }
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
