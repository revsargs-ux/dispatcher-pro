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

module.exports = { calcEarnings, cmdShifts, cmdEarnings };
