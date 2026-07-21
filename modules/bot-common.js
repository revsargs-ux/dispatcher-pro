/**
 * bot-common.js — Shared logic between TG and MAX bots
 * Platform-specific send functions are injected to avoid coupling
 */
const { config } = require('./config');

// Shared Supabase headers
const sbHeaders = () => ({ 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey });

// ============================================================
// calcEarnings — shared between TG and MAX cmdEarnings
// ============================================================
function calcEarnings(data) {
  if (!Array.isArray(data)) return { total: 0, hours: 0, paid: 0 };
  let total = 0, hours = 0, paid = 0;
  for (const a of data) {
    const h = parseFloat(a.hours_worked) || 0;
    const r = parseFloat(a.rate_per_hour) || 0;
    const ex = parseFloat(a.extra_amount) || 0;
    total += h * r + ex;
    hours += h;
    if (a.payment_status === 'paid') paid += h * r + ex;
  }
  return { total: Math.round(total), hours: Math.round(hours * 10) / 10, paid: Math.round(paid) };
}

// ============================================================
// cmdShifts — shared implementation
// ============================================================
async function cmdShifts(chatId, user, sendFn) {
  if (user.role !== 'worker') {
    return sendFn(chatId, 'Эта команда доступна только исполнителям.');
  }
  const now = new Date().toISOString().split('T')[0];
  const res = await fetch(
    `${config.sbUrl}/rest/v1/shift_assignments?worker_id=eq.${user.id}&select=id,shift_id,rate_per_hour,hours_worked,payment_status,shifts!inner(id,date,start_time,end_time,address,status,comment,clients(name),service_types(name))&shifts.date=gte.${now}&shifts.status=neq.completed&order=shifts.date.asc&limit=10`,
    { headers: sbHeaders() }
  );
  const assignments = await res.json();

  if (!Array.isArray(assignments) || !assignments.length) {
    return sendFn(chatId, '📋 У вас нет предстоящих смен.');
  }

  let text = '📋 <b>Ваши предстоящие смены:</b>\n\n';
  for (const a of assignments) {
    const s = a.shifts;
    const date = s.date ? s.date.split('-').reverse().join('.') : '—';
    const statusEmoji = { pending: '⏳', planned: '📋', in_progress: '🔧', completed: '✅' };
    text += `${statusEmoji[s.status] || '📋'} <b>${date}</b> | ${s.start_time || '—'}\n`;
    text += `📍 ${s.address || '—'}\n`;
    text += `🏢 ${s.clients?.name || '—'} | 📋 ${s.service_types?.name || '—'}\n`;
    text += `💰 ${a.rate_per_hour || '—'} ₽/час`;
    if (s.comment) text += `\n💬 ${s.comment}`;
    text += '\n\n';
  }
  await sendFn(chatId, text);
}

// ============================================================
// cmdEarnings — shared implementation
// ============================================================
async function cmdEarnings(chatId, user, sendFn) {
  if (user.role !== 'worker') {
    return sendFn(chatId, 'Эта команда доступна только исполнителям.');
  }

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = now.getMonth() === 0 ? `${now.getFullYear() - 1}-12` : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
  const nextMonth = now.getMonth() === 11 ? `${now.getFullYear() + 1}-01` : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`;

  // Fetch this month and last month in parallel
  const [tmRes, lmRes] = await Promise.all([
    fetch(
      `${config.sbUrl}/rest/v1/shift_assignments?worker_id=eq.${user.id}&select=hours_worked,rate_per_hour,extra_amount,payment_status,shifts!inner(date)&shifts.date=gte.${thisMonth}-01&shifts.date=lt.${nextMonth}-01`,
      { headers: sbHeaders() }
    ),
    fetch(
      `${config.sbUrl}/rest/v1/shift_assignments?worker_id=eq.${user.id}&select=hours_worked,rate_per_hour,extra_amount,payment_status,shifts!inner(date)&shifts.date=gte.${lastMonth}-01&shifts.date=lt.${thisMonth}-01`,
      { headers: sbHeaders() }
    )
  ]);
  const tmData = await tmRes.json();
  const lmData = await lmRes.json();

  const tm = calcEarnings(tmData);
  const lm = calcEarnings(lmData);

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const thisMonthName = monthNames[now.getMonth()];
  const lastMonthName = monthNames[now.getMonth() === 0 ? 11 : now.getMonth() - 1];

  await sendFn(chatId,
    `💰 <b>Ваш заработок:</b>\n\n` +
    `📅 ${thisMonthName}: ${tm.total} ₽ (${tm.hours} ч.)\n` +
    `   ✅ Оплачено: ${tm.paid} ₽\n\n` +
    `📅 ${lastMonthName}: ${lm.total} ₽ (${lm.hours} ч.)\n` +
    `   ✅ Оплачено: ${lm.paid} ₽\n\n` +
    `💳 Выплата — переводом на имя самозанятого`
  );
}

// ============================================================
// forwardChatNotification — notify the other party in a shift chat
// ============================================================
async function forwardChatNotification(shiftId, senderRole, senderId, senderName, message, sendTg, sendMax) {
  try {
    // Get shift details
    const sRes = await fetch(`${config.sbUrl}/rest/v1/shifts?id=eq.${shiftId}&select=id,client_id`, { headers: sbHeaders() });
    const shifts = await sRes.json();
    if (!Array.isArray(shifts) || !shifts.length) return;
    const shift = shifts[0];

    const escName = (senderName || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escMsg = (message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tgText = `💬 <b>${escName}</b>: ${escMsg}`;
    const maxText = `💬 ${senderName}: ${message}`;

    if (senderRole === 'worker') {
      // Notify client
      if (shift.client_id) {
        const cRes = await fetch(`${config.sbUrl}/rest/v1/clients?id=eq.${shift.client_id}&select=telegram_chat_id,max_chat_id&limit=1`, { headers: sbHeaders() });
        const clients = await cRes.json();
        if (Array.isArray(clients) && clients[0]) {
          const c = clients[0];
          if (c.telegram_chat_id) sendTg(c.telegram_chat_id, tgText);
          if (c.max_chat_id) sendMax(c.max_chat_id, maxText);
        }
      }
    } else if (senderRole === 'client') {
      // Notify all assigned workers
      const aRes = await fetch(`${config.sbUrl}/rest/v1/shift_assignments?shift_id=eq.${shiftId}&select=worker_id`, { headers: sbHeaders() });
      const assignments = await aRes.json();
      if (!Array.isArray(assignments)) return;
      for (const a of assignments) {
        const wRes = await fetch(`${config.sbUrl}/rest/v1/workers?id=eq.${a.worker_id}&select=telegram_chat_id,max_chat_id&limit=1`, { headers: sbHeaders() });
        const workers = await wRes.json();
        if (Array.isArray(workers) && workers[0]) {
          const w = workers[0];
          if (w.telegram_chat_id) sendTg(w.telegram_chat_id, tgText);
          if (w.max_chat_id) sendMax(w.max_chat_id, maxText);
        }
      }
    }
  } catch (e) {
    console.error('[bot-common] forwardChatNotification error:', e.message);
  }
}

// ============================================================
// cmdHelp — shared (role-aware)
// ============================================================
function cmdHelp(chatId, user, sendFn) {
  const roleNames = { owner: '👑 Владелец', dispatcher: '📋 Диспетчер', worker: '👷 Исполнитель', client: '🏢 Клиент' };
  const name = user.full_name || 'коллега';
  const menus = {
    owner: `${name}, вот что я могу для тебя показать:\n\n/shifts — все смены\n/earnings — финансы\n/orders — заказы\n/help — напомнить команды\n\nИли просто спроси — я отвечу.`,
    dispatcher: `${name}, твои команды:\n\n/shifts — твои смены\n/earnings — отчёт по оплатам\n/help — напомнить команды\n\nСпрашивай что нужно, я подскажу.`,
    worker: `${name}, вот что могу показать:\n\n/shifts — ближайшие смены\n/earnings — сколько заработал\n/selfemployed — как оформить самозанятость\n/help — напомнить команды\n\nИли просто спроси — отвечу.`,
    client: `${name}, ваши команды:\n\n/orders — ваши заказы\n/help — напомнить команды\n\nИли просто спросите — я отвечу.`
  };
  return sendFn(chatId, menus[user.role] || menus.client);
}

// ============================================================
// cmdOrders — shared (client only for now)
// ============================================================
async function cmdOrders(chatId, user, sendFn) {
  if (user.role !== 'client' && user.role !== 'owner') {
    return sendFn(chatId, 'Эта команда для клиентов и владельца. Если нужны данные по сменам — попробуйте /shifts.');
  }
  const filter = user.role === 'owner' ? '' : `client_id=eq.${user.id}&`;
  const res = await fetch(
    `${config.sbUrl}/rest/v1/shifts?${filter}select=id,date,start_time,address,status,comment,service_types(name)&order=date.desc&limit=10`,
    { headers: sbHeaders() }
  );
  const shifts = await res.json();
  if (!Array.isArray(shifts) || !shifts.length) {
    return sendFn(chatId, 'Заказов пока нет.');
  }
  const statusEmoji = { pending: '⏳', planned: '📋', in_progress: '🔧', completed: '✅' };
  let text = (user.role === 'owner' ? 'Все заказы:' : 'Ваши заказы:') + '\n\n';
  for (const s of shifts) {
    const date = s.date ? s.date.split('-').reverse().join('.') : '—';
    text += `${statusEmoji[s.status] || '📋'} <b>${date}</b> | ${s.start_time || '—'}\n`;
    text += `📍 ${s.address || '—'} | 📋 ${s.service_types?.name || '—'}\n\n`;
  }
  await sendFn(chatId, text);
}

// ============================================================
// cmdSelfEmployed — shared
// ============================================================
function cmdSelfEmployed(chatId, sendFn) {
  return sendFn(chatId,
    '🧾 Самозанятость — обязательно для получения оплаты\n\n' +
    '<b>Как оформить за 10 минут:</b>\n' +
    '1. Скачай приложение «Мой налог»\n' +
    '2. Зарегистрируйся через Госуслуги\n' +
    '3. Готово!\n\n' +
    '<b>Условия:</b>\n' +
    '• Налог: 4% с физлиц, 6% с юрлиц\n' +
    '• Лимит: 2,4 млн ₽/год\n' +
    '• Бонус при регистрации: 10 000 ₽\n' +
    '• Платить до 25 числа каждого месяца\n\n' +
    '📱 https://npd.nalog.ru\n\n' +
    'Нужна помощь — пиши диспетчеру.'
  );
}

// ============================================================
// askAI — shared (DeepSeek with role-based access)
// ============================================================
async function askAI(chatId, user, question, sendFn, knowledgeBase, opts = {}) {
  const apiKey = config.deepseekKey;
  if (!apiKey) {
    return sendFn(chatId, 'Сейчас не могу ответить, попробуй чуть позже или напиши диспетчеру.');
  }

  const roleAccess = {
    owner: 'Уровень 1 — Владелец. Вы можете отвечать на ВСЁ: финансы, ставки, маржа, все заказы, все исполнители, все клиенты, аналитика, доходы/расходы.',
    dispatcher: 'Уровень 3 — Диспетчер. Отвечайте ТОЛЬКО про свои заказы и назначенных исполнителей. НЕ раскрывайте чужие заказы, ставки, маржу системы, ЗП других диспетчеров.',
    worker: 'Уровень 4 — Исполнитель. Отвечайте ТОЛЬКО по данным этого исполнителя: свои смены, свой заработок, свои заказы. НЕ раскрывайте чужие ставки, заработок, данные других людей, коммерческую информацию.',
    client: 'Уровень 4 — Клиент. Отвечайте ТОЛЬКО по его заказам и оплатам. НЕ раскрывайте данные рабочих (контакты, ставки), чужие заказы.'
  };
  const roleLabel = { owner: '👑 ВЛАДЕЛЕЦ', dispatcher: '📋 ДИСПЕТЧЕР', worker: '👷 ИСПОЛНИТЕЛЬ', client: '🏢 КЛИЕНТ' };
  const isFirst = opts.isFirst;
    const roleContext = `Ты — персональный ассистент в системе Dispatcher.PRO. Веди себя как живой человек, общайся свободно и по-дружески. Никогда не упоминай что ты ИИ или бот.\n\nЧеловек: ${user.full_name}, роль: ${roleLabel[user.role] || 'пользователь'}.\n\n${roleAccess[user.role] || roleAccess.worker}\n\nВладелец системы — Ревик Саргсян, телеграм @RevikSargsyan.\n\n${isFirst ? 'ВАЖНО: Это ПЕРВОЕ сообщение от этого человека тебе. Начни с тёплого приветствия, представься, кратко расскажи что можешь помочь с заказами/сменами/оплатой, а потом ответь на его вопрос. Будь дружелюбен и приветлив.' : 'Это НЕ первое сообщение — просто ответь по делу. Приветствие не нужно.'}`;

  try {
    const response = await fetch(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{
            role: 'user',
            content: `${roleContext}\n\nПРАВИЛА:\n1. НЕ придумывай данные — не знаешь, скажи \"Уточню, напиши @RevikSargsyan\"\n2. НИКОГДА не называй себя ботом или ИИ — ты обычный помощник\n3. Ревик Саргсян (@RevikSargsyan) — владелец\n4. Вопрос не про работу — мягко переведи на тему\n5. НИКОМУ не сообщай чужие конфиденциальные данные (ставки, контакты, финансы). Только сам человек может спрашивать про себя.\n\nСТИЛЬ: Общайся как живой человек. На \"ты\". Без официоза, шаблонов и формальностей. Отвечай живо и дружелюбно, но по делу. Если это первое сообщение от человека — поприветствуй его тепло. Если уже не первое — просто отвечай на вопрос, без приветствий. Если спрашивают \"что ты умеешь\" — не выдавай список команд, просто расскажи что можешь помочь со сменами, оплатой, заказами и т.д. живым языком.\n\nБаза знаний:\n${knowledgeBase}\n\nВопрос: ${question}\n\nОтветь живо и по делу.`
          }],
          max_tokens: 2000,
          temperature: 0.3,
        })
      }
    );
    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (answer) {
      await sendFn(chatId, answer.slice(0, 4000));
    } else {
      console.error('[AI] No answer:', JSON.stringify(data).slice(0, 200));
      await sendFn(chatId, 'Хм, не нашёл ответ. Попробуй переформулировать или напиши диспетчеру @RevikSargsyan.');
    }
  } catch (e) {
    console.error('[AI] Error:', e.message);
    await sendFn(chatId, 'Что-то пошло не так, попробуй ещё раз.');
  }
}

module.exports = { calcEarnings, cmdShifts, cmdEarnings, cmdHelp, cmdOrders, cmdSelfEmployed, askAI, forwardChatNotification };
