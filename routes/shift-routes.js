/**
 * Shift routes: shifts, assignments, post-process hooks, pending orders, claim order
 */
const { readBody, json } = require('./shared');
const { config, loadJson, saveJson } = require('../modules/config');
const { sbFetch } = require('../modules/db');
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
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }
  const { shift_id, dispatcher_id } = parsed;
  if (!shift_id || !dispatcher_id) return json(res, { error: 'Missing shift_id or dispatcher_id' }, 400, cors);
  if (!/^[0-9a-f-]{36}$/.test(shift_id) || !/^[0-9a-f-]{36}$/.test(dispatcher_id)) {
    return json(res, { error: 'Invalid ID format' }, 400, cors);
  }

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
      // MAX notification to client
      const clientContact = (await (await sbFetch('clients', `id=eq.${clientId}&select=contact&limit=1`)).json())[0];
      if (clientContact) {
        maxNotify('clients', clientContact.contact, `✅ Ваш заказ принят в работу!\n\n📋 Диспетчер: ${dispName}\n\nСкоро мы подберём для вас рабочих.`);
      }
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
        maxNotify('users', d.phone, orderText);
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

        // Auto-salary: when shift becomes completed, calculate earnings for all assignments
        if (sh.status === 'completed') {
          try {
            const asgns = await (await sbFetch('shift_assignments', `shift_id=eq.${shiftId}&invite_status=eq.confirmed&select=id,worker_id,hours_worked,rate_per_hour,extra_amount`)).json();
            if (Array.isArray(asgns)) {
              for (const a of asgns) {
                const h = parseFloat(a.hours_worked) || 0;
                const rate = parseFloat(a.rate_per_hour) || 400;
                const extra = parseFloat(a.extra_amount) || 0;
                const calculated = h * rate + extra;
                if (h > 0) {
                  await sbFetch('shift_assignments', `id=eq.${a.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ calculated_salary: calculated })
                  });
                  // Notify worker about salary
                  const w = ((await (await sbFetch('workers', `id=eq.${a.worker_id}&select=phone,full_name&limit=1`)).json())[0]);
                  if (w) {
                    maxNotify('workers', w.phone, `💰 Расчёт зарплаты\n\n👤 ${w.full_name}\n⏱ ${h}ч × ${rate}₽ = ${(h*rate).toLocaleString('ru')}₽${extra > 0 ? '\n➕ Доп: ' + extra.toLocaleString('ru') + '₽' : ''}\n💰 Итого: ${calculated.toLocaleString('ru')}₽`);
                    tgNotify('workers', w.phone, `💰 Расчёт зарплаты\n\n👤 ${w.full_name}\n⏱ ${h}ч × ${rate}₽ = ${(h*rate).toLocaleString('ru')}₽${extra > 0 ? '\n➕ Доп: ' + extra.toLocaleString('ru') + '₽' : ''}\n💰 Итого: ${calculated.toLocaleString('ru')}₽`);
                    sendPushNotification({ userId: a.worker_id, userRole: 'worker', eventType: 'salary_calculated', priority: 'high', title: '💰 Зарплата рассчитана', body: `${h}ч × ${rate}₽ = ${calculated.toLocaleString('ru')}₽`, deepLink: '/worker.html' });
                  }
                }
              }
            }
          } catch (e) { console.error('[AutoSalary] Error:', e.message); }

          // Notify client and dispatcher about shift completion
          try {
            const shiftDate = sh.date ? sh.date.split('-').reverse().join('.') : '—';
            const clName = sh.clients?.name || '—';
            const svcName = sh.service_types?.name || '';
            // Notify client
            if (sh.client_id) {
              const clientData = (await (await sbFetch('clients', `id=eq.${sh.client_id}&select=contact,telegram_chat_id&limit=1`)).json())[0];
              if (clientData) {
                tgNotify('clients', clientData.contact, `✅ Смена завершена\n\n📅 ${shiftDate}\n📋 ${svcName}\n\nСмена выполнена. Спасибо!`);
                maxNotify('clients', clientData.contact, `✅ Смена завершена\n\n📅 ${shiftDate}\n📋 ${svcName}\n\nСмена выполнена. Спасибо!`);
              }
            }
            // Notify dispatcher who created the shift
            if (sh.created_by) {
              const dispatcher = (await (await sbFetch('users', `id=eq.${sh.created_by}&select=phone,full_name,telegram_chat_id&limit=1`)).json())[0];
              if (dispatcher) {
                maxNotify('users', dispatcher.phone, `✅ Смена завершена\n\n🏢 ${clName}\n📅 ${shiftDate}\n📋 ${svcName}`);
                tgNotify('users', dispatcher.phone, `✅ Смена завершена\n\n🏢 ${clName}\n📅 ${shiftDate}\n📋 ${svcName}`);
              }
            }
          } catch (e) { console.error('[ShiftComplete] Notification error:', e.message); }
        }
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
        maxNotify('workers', workerPhone,
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

// ===== Recurring orders / subscriptions =====

async function handleRecurringList(req, res, cors) {
  try {
    const sbRes = await sbFetch('recurring_orders', 'is_active=eq.true&select=*,clients(id,name),workers(id,full_name),service_types(id,name)&order=created_at.desc&limit=100');
    const data = await sbRes.json();
    json(res, data, 200, cors);
  } catch (e) { json(res, { error: e.message }, 500, cors); }
}

async function handleRecurringCreate(req, res, cors) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }
  const { client_id, worker_id, service_type_id, day_of_week, time_start, hours, object_address, notes, created_by } = parsed;
  if (!client_id || day_of_week === undefined || !time_start) {
    return json(res, { error: 'Missing required fields' }, 400, cors);
  }
  if (day_of_week < 0 || day_of_week > 6) return json(res, { error: 'Invalid day_of_week' }, 400, cors);
  try {
    const sbRes = await sbFetch('recurring_orders', '', {
      method: 'POST',
      body: JSON.stringify({
        client_id, worker_id, service_type_id,
        day_of_week, time_start, hours: hours || 4,
        object_address: object_address || null,
        notes: notes || null,
        is_active: true,
        created_by: created_by || null
      })
    });
    const data = await sbRes.json();
    json(res, data, sbRes.status, cors);
  } catch (e) { json(res, { error: e.message }, 500, cors); }
}

async function handleRecurringUpdate(req, res, cors, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, { error: 'Invalid ID' }, 400, cors);
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }
  try {
    const sbRes = await sbFetch('recurring_orders', `id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(parsed)
    });
    const data = await sbRes.json();
    json(res, data, sbRes.status, cors);
  } catch (e) { json(res, { error: e.message }, 500, cors); }
}

async function handleRecurringDelete(req, res, cors, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, { error: 'Invalid ID' }, 400, cors);
  try {
    const sbRes = await sbFetch('recurring_orders', `id=eq.${id}`, {
      method: 'DELETE'
    });
    json(res, { ok: true }, 200, cors);
  } catch (e) { json(res, { error: e.message }, 500, cors); }
}

// ===== Reviews =====

async function handleGetWorkerReviews(req, res, cors, workerId) {
  try {
    const reviews = await (await sbFetch('reviews', `worker_id=eq.${workerId}&select=*,clients(name)&order=created_at.desc&limit=50`)).json();
    const stats = await (await sbFetch('reviews', `worker_id=eq.${workerId}&select=rating`)).json();
    const avg = Array.isArray(stats) && stats.length > 0
      ? (stats.reduce((s, r) => s + (r.rating || 0), 0) / stats.length).toFixed(1)
      : null;
    json(res, { average: avg, count: Array.isArray(stats) ? stats.length : 0, reviews: Array.isArray(reviews) ? reviews : [] }, 200, cors);
  } catch (e) { json(res, { error: e.message }, 500, cors); }
}

async function handleSubmitReview(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (session.role !== 'client') return json(res, { error: 'Только заказчик может оставить отзыв' }, 403, cors);

  const body = await readBody(req);
  const { shift_id, worker_id, rating, comment } = JSON.parse(body);
  if (!shift_id || !worker_id || !rating) return json(res, { error: 'Missing required fields' }, 400, cors);
  if (rating < 1 || rating > 5) return json(res, { error: 'Rating must be 1-5' }, 400, cors);

  // Validate UUID format
  if (!/^[0-9a-f-]{36}$/.test(shift_id) || !/^[0-9a-f-]{36}$/.test(worker_id)) {
    return json(res, { error: 'Invalid ID format' }, 400, cors);
  }

  try {
    // Check shift is completed
    const shifts = await (await sbFetch('shifts', `id=eq.${shift_id}&select=status,client_id&limit=1`)).json();
    if (!Array.isArray(shifts) || !shifts.length) return json(res, { error: 'Смена не найдена' }, 404, cors);
    if (shifts[0].status !== 'completed') return json(res, { error: 'Отзыв только после завершения смены' }, 400, cors);
    if (shifts[0].client_id !== session.userId) return json(res, { error: 'Нет доступа' }, 403, cors);

    // Check worker was assigned
    const asgns = await (await sbFetch('shift_assignments', `shift_id=eq.${shift_id}&worker_id=eq.${worker_id}&select=id&limit=1`)).json();
    if (!Array.isArray(asgns) || !asgns.length) return json(res, { error: 'Рабочий не был назначен' }, 400, cors);

    // Check no existing review
    const existing = await (await sbFetch('reviews', `shift_id=eq.${shift_id}&client_id=eq.${session.userId}&select=id&limit=1`)).json();
    if (Array.isArray(existing) && existing.length) return json(res, { error: 'Отзыв уже оставлен' }, 409, cors);

    const sbRes = await sbFetch('reviews', '', {
      method: 'POST',
      body: JSON.stringify({ shift_id, worker_id, client_id: session.userId, rating, comment: comment || null })
    });
    const data = await sbRes.json();
    json(res, data, sbRes.status, cors);
  } catch (e) { json(res, { error: e.message }, 500, cors); }
}

module.exports = {
  handlePendingOrders,
  handleClaimOrder,
  handlePostProcess,
  checkNotifsTable,
  handleRecurringList,
  handleRecurringCreate,
  handleRecurringUpdate,
  handleRecurringDelete,
  handleGetWorkerReviews,
  handleSubmitReview
};
