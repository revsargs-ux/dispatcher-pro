/**
 * Shift routes: shifts, assignments, post-process hooks, pending orders, claim order
 */
const { readBody, json } = require('./shared');
const { config, loadJson, saveJson } = require('../modules/config');
const { sbFetch, sbHeaders } = require('../modules/db');
const { sendPushNotification, sendPushToRole } = require('../notifications-module/push-trigger');
const { requireAuth } = require('../modules/auth');
const { audit } = require('../modules/audit');
const { syncToGoogleSheets } = require('../modules/gas-sync');
const { tgNotify, tgNotifyRole } = require('../modules/telegram');
const { maxNotify, maxNotifyRole } = require('../modules/max-bot');

// --- Pending orders ---
async function handlePendingOrders(req, res, cors) {
  try {
    const sbRes = await sbFetch('shifts', 'status=eq.pending&select=*,clients(id,name,city,contact),service_types(id,name)&order=created_at.desc&limit=50');
    const data = await sbRes.json();
    json(res, data, 200, cors);
  } catch (e) { json(res, { error: e.message }, 500, cors); }
}

// --- Claim order ---
async function handleClaimOrder(req, res, cors) {
  const body = await readBody(req);
  const { shift_id, dispatcher_id } = JSON.parse(body);
  if (!shift_id || !dispatcher_id) return json(res, { error: 'Missing shift_id or dispatcher_id' }, 400, cors);

  const checkRes = await sbFetch('shifts', `id=eq.${shift_id}&select=status,client_id&limit=1`);
  const shifts = await checkRes.json();
  if (!shifts.length || shifts[0].status !== 'pending') return json(res, { error: 'Заказ уже занят' }, 409, cors);

  await sbFetch('shifts', `id=eq.${shift_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'planned', created_by: dispatcher_id }) });

  // Notify client
  const clientId = shifts[0].client_id;
  if (clientId) {
    const cls = (await (await sbFetch('clients', `id=eq.${clientId}&select=telegram_chat_id,name&limit=1`)).json());
    if (cls.length && cls[0].telegram_chat_id) {
      const disps = (await (await sbFetch('users', `id=eq.${dispatcher_id}&select=full_name&limit=1`)).json());
      const dispName = disps[0]?.full_name || 'Диспетчер';
      await fetch(`${config.tgApi}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cls[0].telegram_chat_id, text: `✅ Ваш заказ принят в работу!\n\n📋 Диспетчер: ${dispName}\n\nСкоро мы подберём для вас рабочих.`, parse_mode: 'HTML' })
      });
      sendPushNotification({ userId: clientId, userRole: 'client', eventType: 'order_accepted', priority: 'high', title: '✅ Заказ принят', body: `Диспетчер: ${dispName}. Подбираем рабочих.`, deepLink: '/client.html' });
    }
  }

  // Sync to GAS
  try {
    const cl3 = ((await (await sbFetch('clients', `id=eq.${clientId}&select=name&limit=1`)).json())[0] || {});
    const sh3 = ((await (await sbFetch('shifts', `id=eq.${shift_id}&select=date,start_time,address,comment&limit=1`)).json())[0] || {});
    let svcName = '';
    const svc3 = ((await (await sbFetch('shifts', `id=eq.${shift_id}&select=service_type_id&limit=1`)).json())[0] || {});
    if (svc3.service_type_id) {
      const st = ((await (await sbFetch('service_types', `id=eq.${svc3.service_type_id}&select=name&limit=1`)).json())[0]);
      svcName = st?.name || '';
    }
    syncToGoogleSheets('syncShift', {
      shift_id, shift_date: sh3.date || '', shift_client: cl3.name || '', shift_service: svcName,
      shift_start: sh3.start_time || '', shift_address: sh3.address || '', shift_comment: sh3.comment || '',
      shift_dispatcher: dispName || '', shift_status: 'planned'
    });
  } catch (e) { console.error('[GAS] Claim sync error:', e.message); }

  json(res, { ok: true }, 200, cors);
}

// --- Post-process: sync to GAS + TG notifications ---
let _notifsTableExists = null;

async function checkNotifsTable() {
  if (_notifsTableExists !== null) return _notifsTableExists;
  try {
    const r = await sbFetch('app_notifications', 'select=id&limit=1');
    _notifsTableExists = r.ok;
    if (!_notifsTableExists) console.log('[Notifs] Supabase table not found, using JSON fallback');
    else console.log('[Notifs] Using Supabase app_notifications');
  } catch (e) { _notifsTableExists = false; }
  return _notifsTableExists;
}

async function handlePostProcess(table, method, data, body, query, req) {
  if (!data || !data.trim()) return;
  let parsed;
  try { parsed = JSON.parse(data); } catch(e) { console.error('[PostProcess] JSON parse error:', e.message, 'data:', data.slice(0,100)); return; }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first) return;

  try {
    // Shifts
    if (table === 'shifts' && method === 'POST' && (first.status === 'pending' || first.status === 'planned') && first.client_id) {
      const [clRes, svcRes, reqsRes, dispatchers] = await Promise.all([
        sbFetch('clients', `id=eq.${first.client_id}&select=name,city,contact&limit=1`).then(r => r.json()),
        sbFetch('service_types', `id=eq.${first.service_type_id}&select=name&limit=1`).then(r => r.json()),
        sbFetch('shift_requirements', `shift_id=eq.${first.id}&select=required_count`).then(r => r.json()),
        sbFetch('users', 'role=eq.dispatcher&is_active=eq.true&select=id,telegram_chat_id,full_name,city').then(r => r.json())
      ]);
      const cl = clRes[0] || {};
      const svc = svcRes[0] || {};
      const reqs = reqsRes || [];
      const workersCount = reqs.reduce((s, r) => s + (parseInt(r.required_count) || 0), 0);
      const orderDate = first.date ? first.date.split('-').reverse().join('.') : '—';
      const orderText = `🆕 Новый заказ!\n\n🏢 Заказчик: ${cl.name || '—'}\n📅 Дата: ${orderDate}\n⏰ Время: ${first.start_time || '—'}\n📋 Услуга: ${svc.name || 'Не указан'}\n📍 Адрес: ${first.address || '—'}\n👥 Кол-во рабочих: ${workersCount || '—'}\n${first.comment ? '💬 ' + first.comment + '\n' : ''}\n⚡️ Перейдите в систему чтобы взять заказ`;
      for (const d of dispatchers) {
        if (!d.telegram_chat_id) continue;
        if (cl.city && d.city && d.city !== cl.city) continue;
        await fetch(`${config.tgApi}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: d.telegram_chat_id, text: orderText, parse_mode: 'HTML' })
        });
        sendPushNotification({ userId: d.id, userRole: 'dispatcher', eventType: 'new_shift', priority: 'high', title: '🆕 Новый заказ', body: `${cl.name || '—'} | ${orderDate} | ${svc.name || ''}`, deepLink: '/' });
      }
      syncToGoogleSheets('syncShift', {
        shift_id: first.id, shift_date: first.date, shift_client: cl.name || '',
        shift_service: svc.name || '', shift_start: first.start_time || '',
        shift_address: first.address || '', shift_comment: first.comment || '', shift_status: first.status
      });
    }
    if (table === 'shifts' && method === 'PATCH') {
      const shiftId = new URLSearchParams(query).get('id')?.replace('eq.', '');
      if (shiftId) {
        const sh = ((await (await sbFetch('shifts', `id=eq.${shiftId}&select=*,clients(name),service_types(name)&limit=1`)).json())[0]);
        if (sh) syncToGoogleSheets('syncShift', {
          shift_id: sh.id, shift_date: sh.date, shift_client: sh.clients?.name || '',
          shift_service: sh.service_types?.name || '', shift_start: sh.start_time || '',
          shift_address: sh.address || '', shift_comment: sh.comment || '', shift_status: sh.status || ''
        });
      }
    }

    // Workers
    if (table === 'workers' && method === 'POST') {
      syncToGoogleSheets('syncWorker', { id: first.id, full_name: first.full_name, phone: first.phone, is_active: true });
      const notifs = loadJson('notifications.json');
      notifs.push({ id: first.id, name: first.full_name, phone: first.phone, date: new Date().toISOString() });
      saveJson('notifications.json', notifs);
      try {
        if (await checkNotifsTable()) {
          await sbFetch('app_notifications', '', {
            method: 'POST',
            body: JSON.stringify({ role: 'owner', message: `👷 Новый рабочий: ${first.full_name} (+${first.phone})`, data: { worker_id: first.id, name: first.full_name, phone: first.phone } })
          });
        }
      } catch (e) { console.error('[Notifs] Failed to save to Supabase:', e.message); }
      tgNotifyRole('owner', `👷 Новый рабочий зарегистрирован\n\n👤 ${first.full_name}\n📱 +${first.phone}\n📅 ${new Date().toLocaleDateString('ru-RU')}`);
      maxNotifyRole('owner', `👷 Новый рабочий зарегистрирован\n\n👤 ${first.full_name}\n📱 +${first.phone}\n📅 ${new Date().toLocaleDateString('ru-RU')}`);
    }
    if (table === 'workers' && method === 'PATCH') {
      const wId = new URLSearchParams(query).get('id')?.replace('eq.', '');
      if (wId) {
        const ws = ((await (await sbFetch('workers', `id=eq.${wId}&select=id,full_name,phone,is_active&limit=1`)).json())[0]);
        if (ws) syncToGoogleSheets('syncWorker', { id: ws.id, full_name: ws.full_name, phone: ws.phone, is_active: ws.is_active });
      }
    }

    // Assignments
    if (table === 'shift_assignments' && (method === 'POST' || method === 'PATCH')) {
      const a = first;
      let workerName = '';
      let workerPhone = '';
      if (a.worker_id) {
        const ws = ((await (await sbFetch('workers', `id=eq.${a.worker_id}&select=full_name,phone&limit=1`)).json())[0]);
        workerName = ws?.full_name || '';
        workerPhone = ws?.phone || '';
      }
      syncToGoogleSheets('syncAssignment', {
        id: a.id, shift_id: a.shift_id || '', worker_name: workerName,
        hours_worked: a.hours_worked, actual_start_time: a.actual_start_time || '',
        actual_end_time: a.actual_end_time || '', rate_per_hour: a.rate_per_hour,
        paid_amount: a.paid_amount, payment_status: a.payment_status, extra_amount: a.extra_amount
      });
      if (method === 'POST' && a.worker_id) {
        tgNotify('workers', workerPhone,
          `📋 Новый заказ\n\n📅 Проверьте расписание в системе\n\n👉 https://xn----gtbdan3bddhceo9d.xn--p1ai/worker.html`);
        sendPushNotification({ userId: a.worker_id, userRole: 'worker', eventType: 'shift_assigned', priority: 'high', title: '📋 Вас назначили на смену', body: 'Проверьте расписание в системе', deepLink: '/worker.html' });
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(body);
        if (patch.payment_status) {
          const id = new URL('http://localhost' + req.url).searchParams.get('id') || (req.url.match(/id=eq\.([\w-]+)/) || [])[1];
          if (id) {
            const asgn = ((await (await sbFetch('shift_assignments', `id=eq.${id}&select=worker_id,payment_status&limit=1`)).json())[0]);
            if (asgn) {
              const statusNames = { pending: '⏳ Ожидает', paid: '✅ Оплачен', partial: '🔹 Частично', unpaid: '❌ Не оплачен' };
              const w = ((await (await sbFetch('workers', `id=eq.${asgn.worker_id}&select=phone,full_name&limit=1`)).json())[0]);
              if (w) {
                maxNotify('workers', w.phone, `💰 Статус оплаты изменён\n\n👤 ${w.full_name}\n📊 ${statusNames[asgn.payment_status] || asgn.payment_status}`);
                tgNotify('workers', w.phone, `💰 Статус оплаты изменён\n\n👤 ${w.full_name}\n📊 ${statusNames[asgn.payment_status] || asgn.payment_status}`);
                sendPushNotification({ userId: asgn.worker_id, userRole: 'worker', eventType: 'payment_status', priority: 'high', title: '💰 Статус оплаты', body: `${w.full_name}: ${statusNames[asgn.payment_status] || asgn.payment_status}`, deepLink: '/worker.html' });
              }
            }
          }
        }
      }
    }

    // Payments
    if (table === 'payments' && (method === 'POST' || method === 'PATCH')) {
      let counterpartyName = '';
      let paymentWorkerId = null;
      if (first.assignment_id) {
        const as = ((await (await sbFetch('shift_assignments', `id=eq.${first.assignment_id}&select=worker_id&limit=1`)).json())[0]);
        if (as?.worker_id) {
          const ws = ((await (await sbFetch('workers', `id=eq.${as.worker_id}&select=full_name&limit=1`)).json())[0]);
          counterpartyName = ws?.full_name || '';
          paymentWorkerId = as.worker_id;
        }
      }
      syncToGoogleSheets('syncPayment', {
        id: first.id, date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        type: 'Приход', counterpartyName, amount: first.amount,
        method: { transfer: 'Перевод', cash: 'Наличные', invoice: 'Безнал' }[first.method] || first.method || '',
        status: first.status === 'pending_confirmation' ? 'Ожидает подтверждения' : 'Проведен', note: first.note || ''
      });
      if (method === 'POST' && paymentWorkerId) {
        try {
          const amountStr = first.amount ? `${first.amount}₽` : 'Оплата';
          const methodStr = { transfer: 'Перевод', cash: 'Наличные', invoice: 'Безнал' }[first.method] || first.method || '';
          sendPushNotification({ userId: paymentWorkerId, userRole: 'worker', eventType: 'payment_recorded', priority: 'high', title: '💰 Оплата проведена', body: `${amountStr} (${methodStr})`, deepLink: '/worker.html' });
        } catch (pe) { console.error('[Push] Payment notification error:', pe.message); }
      }
    }

    // Clients
    if (table === 'clients' && (method === 'POST' || method === 'PATCH')) {
      syncToGoogleSheets('syncClient', {
        id: first.id, name: first.name, contact: first.contact,
        default_client_rate: first.default_client_rate, default_worker_rate: first.default_worker_rate, archived: first.archived
      });
    }

    // Users
    if (table === 'users' && method === 'PATCH') {
      const uId = new URLSearchParams(query).get('id')?.replace('eq.', '');
      if (uId) {
        const us = ((await (await sbFetch('users', `id=eq.${uId}&select=id,full_name,phone,is_active&limit=1`)).json())[0]);
        if (us) syncToGoogleSheets('syncUser', { id: us.id, full_name: us.full_name, phone: us.phone, is_active: us.is_active });
      }
    }
  } catch (e) {
    console.error('[PostProcess] Error:', e.message);
  }
}

module.exports = {
  handlePendingOrders,
  handleClaimOrder,
  handlePostProcess,
  checkNotifsTable
};
