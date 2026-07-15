/**
 * Feature routes: bulk-hours, force-confirm, reassign-workers,
 * recurring-shifts, confirm-payment, iCal export, PDF export
 */
const { readBody, json, extractPublicIp } = require('./shared');
const { config } = require('../modules/config');
const { sbFetch, sbHeaders } = require('../modules/db');
const { requireAuth } = require('../modules/auth');
const { audit } = require('../modules/audit');

// ============================================================
// F1: P30 — Bulk hours entry
// POST /api/bulk-hours
// Body: { shift_id, entries: [{ worker_id, hours_worked }] }
// ============================================================
async function handleBulkHours(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (!['owner', 'dispatcher', 'client'].includes(session.role)) {
    return json(res, { error: 'Нет доступа' }, 403, cors);
  }

  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }

  const { shift_id, entries } = parsed;
  if (!shift_id || !Array.isArray(entries) || !entries.length) {
    return json(res, { error: 'Missing shift_id or entries' }, 400, cors);
  }
  if (!/^[0-9a-f-]{36}$/.test(shift_id)) {
    return json(res, { error: 'Invalid shift_id' }, 400, cors);
  }

  // For client role: verify they own this shift
  if (session.role === 'client') {
    const shifts = await (await sbFetch('shifts', `id=eq.${shift_id}&select=client_id&limit=1`)).json();
    if (!shifts?.length || shifts[0].client_id !== session.userId) {
      return json(res, { error: 'Нет доступа к этой смене' }, 403, cors);
    }
  }

  const nowIso = new Date().toISOString();
  const results = [];

  for (const entry of entries) {
    const { worker_id, hours_worked } = entry;
    if (!worker_id || hours_worked === undefined) { results.push({ worker_id, ok: false, error: 'missing fields' }); continue; }
    if (!/^[0-9a-f-]{36}$/.test(worker_id)) { results.push({ worker_id, ok: false, error: 'invalid worker_id' }); continue; }
    const hours = parseFloat(hours_worked);
    if (isNaN(hours) || hours < 0 || hours > 24) { results.push({ worker_id, ok: false, error: 'hours_worked: 0–24' }); continue; }

    try {
      const patchRes = await sbFetch('shift_assignments',
        `shift_id=eq.${shift_id}&worker_id=eq.${worker_id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            hours_worked: hours,
            hours_worked: parseFloat(hours_worked),
            hours_submitted_at: nowIso,
            client_hours_status: 'pending'
          })
        }
      );
      const data = await patchRes.json();
      results.push({ worker_id, ok: patchRes.status < 300, updated: data });
    } catch(e) {
      results.push({ worker_id, ok: false, error: e.message });
    }
  }

  audit('bulk_hours', `shift:${shift_id} entries:${entries.length}`, session.userId, session.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
  json(res, { ok: true, results }, 200, cors);
}

// ============================================================
// F2: P33 — Force confirm hours
// POST /api/force-confirm
// Body: { assignment_id }
// ============================================================
async function handleForceConfirm(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (!['owner', 'dispatcher'].includes(session.role)) {
    return json(res, { error: 'Только владелец или диспетчер' }, 403, cors);
  }

  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }

  const { assignment_id } = parsed;
  if (!assignment_id || !/^[0-9a-f-]{36}$/.test(assignment_id)) {
    return json(res, { error: 'Invalid assignment_id' }, 400, cors);
  }

  try {
    // Проверяем что часы введены перед подтверждением (КТ-13 fix)
    const checkRes = await sbFetch('shift_assignments', `id=eq.${assignment_id}&select=hours_worked,hours_submitted_at`, { headers: { Prefer: 'count=exact' } });
    const checkData = await checkRes.json();
    if (!checkData.length) return json(res, { error: 'Назначение не найдено' }, 404, cors);
    if (checkData[0].hours_worked == null || checkData[0].hours_worked <= 0) {
      return json(res, { error: 'Нельзя подтвердить: часы не введены' }, 400, cors);
    }

    const sbRes = await sbFetch('shift_assignments', `id=eq.${assignment_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        client_hours_status: 'confirmed',
        client_confirmed: true,
        client_confirmed_at: new Date().toISOString()
      })
    });
    const data = await sbRes.json();
    audit('force_confirm', `assignment:${assignment_id}`, session.userId, session.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    json(res, { ok: true, data }, 200, cors);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

// ============================================================
// F3: P39 — Reassign workers (reset invites)
// POST /api/reassign-workers
// Body: { shift_id }
// ============================================================
async function handleReassignWorkers(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (!['owner', 'dispatcher'].includes(session.role)) {
    return json(res, { error: 'Только владелец или диспетчер' }, 403, cors);
  }

  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }

  const { shift_id } = parsed;
  if (!shift_id || !/^[0-9a-f-]{36}$/.test(shift_id)) {
    return json(res, { error: 'Invalid shift_id' }, 400, cors);
  }

  try {
    // BUG-021 fix: Reset only declined assignments, preserve accepted/confirmed
    const sbRes = await sbFetch('shift_assignments',
      `shift_id=eq.${shift_id}&invite_status=eq.declined`,
      {
        method: 'PATCH',
        body: JSON.stringify({ invite_status: 'pending' })
      }
    );
    const data = await sbRes.json();
    const resetCount = Array.isArray(data) ? data.length : 0;
    audit('reassign_workers', `shift:${shift_id} reset:${resetCount}`, session.userId, session.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    json(res, { ok: true, reset_count: resetCount, data }, 200, cors);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

// ============================================================
// F4: P40-42 — Recurring shifts CRUD
// POST   /api/recurring-shifts
// GET    /api/recurring-shifts
// PATCH  /api/recurring-shifts/:id
// DELETE /api/recurring-shifts/:id
// ============================================================
async function handleRecurringShiftsList(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);

  let query = 'is_active=eq.true&select=*&order=created_at.desc&limit=100';

  // Clients see only their own recurring shifts
  if (session.role === 'client') {
    query += `&client_id=eq.${session.userId}`;
  } else if (session.role === 'dispatcher') {
    query += `&created_by=eq.${session.userId}`;
  }

  try {
    const sbRes = await sbFetch('recurring_orders', query);
    const data = await sbRes.json();
    json(res, data, 200, cors);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

async function handleRecurringShiftsCreate(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (!['owner', 'dispatcher'].includes(session.role)) {
    return json(res, { error: 'Только владелец или диспетчер' }, 403, cors);
  }

  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }

  const { client_id, service_type_id } = parsed;
  if (!client_id) {
    return json(res, { error: 'Missing required: client_id' }, 400, cors);
  }

  try {
    const insertData = {
      client_id,
      service_type_id: service_type_id || null,
      created_by: session.userId,
      is_active: true
    };
    // Pass through optional new fields (F-04)
    if (parsed.start_time !== undefined) insertData.start_time = parsed.start_time;
    if (parsed.worker_count !== undefined) insertData.worker_count = parsed.worker_count;
    if (parsed.interval_days !== undefined) insertData.interval_days = parsed.interval_days;
    if (parsed.address !== undefined) insertData.address = parsed.address;
    if (parsed.day_of_week !== undefined) insertData.day_of_week = parsed.day_of_week;
    if (parsed.time_start !== undefined) insertData.time_start = parsed.time_start;
    if (parsed.worker_id !== undefined) insertData.worker_id = parsed.worker_id;
    if (parsed.notes !== undefined) insertData.notes = parsed.notes;

    const sbRes = await sbFetch('recurring_orders', '', {
      method: 'POST',
      body: JSON.stringify(insertData)
    });
    const data = await sbRes.json();
    audit('recurring_create', `client:${client_id}`, session.userId, session.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    json(res, data, sbRes.status, cors);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

async function handleRecurringShiftsUpdate(req, res, cors, id) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (!['owner', 'dispatcher'].includes(session.role)) {
    return json(res, { error: 'Только владелец или диспетчер' }, 403, cors);
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, { error: 'Invalid ID' }, 400, cors);

  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }

  // Remove fields that shouldn't be directly edited
  delete parsed.id;
  delete parsed.created_at;
  delete parsed.created_by;

  try {
    // IDOR check: dispatcher can only edit own recurring orders
    if (session.role === 'dispatcher') {
      const own = await (await sbFetch('recurring_orders', `id=eq.${id}&created_by=eq.${session.userId}&select=id&limit=1`)).json();
      if (!own?.length) return json(res, { error: 'Нет доступа к этому заказу' }, 403, cors);
    }

    const sbRes = await sbFetch('recurring_orders', `id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(parsed)
    });
    const data = await sbRes.json();
    json(res, data, sbRes.status, cors);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

async function handleRecurringShiftsDelete(req, res, cors, id) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (!['owner', 'dispatcher'].includes(session.role)) {
    return json(res, { error: 'Только владелец или диспетчер' }, 403, cors);
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, { error: 'Invalid ID' }, 400, cors);

  try {
    // Soft delete: set is_active=false
    const sbRes = await sbFetch('recurring_orders', `id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false })
    });
    json(res, { ok: true }, 200, cors);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

// ============================================================
// F7: P65 — Client confirms payment
// POST /api/confirm-payment
// Body: { assignment_id }
// ============================================================
async function handleConfirmPayment(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
  if (!['client', 'owner'].includes(session.role)) {
    return json(res, { error: 'Только заказчик или владелец' }, 403, cors);
  }

  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { return json(res, { error: 'Invalid JSON' }, 400, cors); }

  const { assignment_id } = parsed;
  if (!assignment_id || !/^[0-9a-f-]{36}$/.test(assignment_id)) {
    return json(res, { error: 'Invalid assignment_id' }, 400, cors);
  }

  // For clients: verify they own the shift for this assignment
  if (session.role === 'client') {
    const asgns = await (await sbFetch('shift_assignments',
      `id=eq.${assignment_id}&select=shift_id&limit=1`)).json();
    if (!asgns?.length) return json(res, { error: 'Назначение не найдено' }, 404, cors);
    const shifts = await (await sbFetch('shifts',
      `id=eq.${asgns[0].shift_id}&select=client_id&limit=1`)).json();
    if (!shifts?.length || shifts[0].client_id !== session.userId) {
      return json(res, { error: 'Нет доступа' }, 403, cors);
    }
  }

  try {
    // Update payment status to confirmed
    const sbRes = await sbFetch('payments',
      `assignment_id=eq.${assignment_id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' })
      }
    );
    const data = await sbRes.json();
    audit('confirm_payment', `assignment:${assignment_id}`, session.userId, session.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    json(res, { ok: true, data }, 200, cors);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

// ============================================================
// F8: P67 — iCal export for a shift
// GET /api/shift/:id/ical
// ============================================================
async function handleShiftIcal(req, res, cors, shiftId) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);

  if (!/^[0-9a-f-]{36}$/.test(shiftId)) {
    return json(res, { error: 'Invalid shift ID' }, 400, cors);
  }

  try {
    const shifts = await (await sbFetch('shifts',
      `id=eq.${shiftId}&select=*,clients(name),service_types(name)&limit=1`)).json();
    if (!shifts?.length) return json(res, { error: 'Смена не найдена' }, 404, cors);

    const s = shifts[0];

    // Client can only see their own shift
    if (session.role === 'client' && s.client_id !== session.userId) {
      return json(res, { error: 'Нет доступа' }, 403, cors);
    }

    // Build iCal
    const date = s.date || new Date().toISOString().slice(0, 10);
    const startTime = s.start_time || '09:00';
    // Format: YYYYMMDDTHHMMSS (iCal local time format)
    const startParts = startTime.split(':');
    const startHour = startParts[0] || '09';
    const startMin = startParts[1] || '00';
    const dtStartFmt = `${date.replace(/-/g, '')}T${startHour}${startMin}00`;
    // Default 8-hour shift
    const endHourNum = parseInt(startHour) + 8;
    const dtEndFmt = `${date.replace(/-/g, '')}T${String(endHourNum).padStart(2, '0')}${startMin}00`;
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const summary = s.service_types?.name || 'Смена';
    const clientName = s.clients?.name || '';
    const location = s.address || '';
    const description = [
      `Клиент: ${clientName}`,
      s.comment ? `Комментарий: ${s.comment}` : '',
      `Рабочих: ${s.workers_needed || 1}`
    ].filter(Boolean).join('\\n');

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Dispatcher.PRO//Shift//RU',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${shiftId}@dispatcher.pro`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStartFmt}`,
      `DTEND:${dtEndFmt}`,
      `SUMMARY:${summary}${clientName ? ' — ' + clientName : ''}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="shift-${date}.ics"`,
      ...cors
    });
    res.end(ical);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

// ============================================================
// F9: P80 — PDF export of payments
// GET /export/payments.pdf
// ============================================================
async function handleExportPdf(req, res, cors) {
  const session = requireAuth(req);
  if (!session || (session.role !== 'owner' && session.role !== 'dispatcher')) {
    return json(res, { error: 'Нет доступа' }, 403, cors);
  }

  try {
    // Fetch payment data
    const asgn = await (await sbFetch('shift_assignments',
      `select=hours_worked,rate_per_hour,client_rate_per_hour,extra_amount,payment_status,worker_id,shifts!inner(date,client_id,clients(name))&limit=1000`)).json();
    const workers = await (await sbFetch('workers', 'select=id,full_name&limit=300')).json();
    const wMap = {};
    workers.forEach(w => wMap[w.id] = w.full_name);

    // Build HTML table
    let rowsHtml = '';
    let totalWorker = 0, totalClient = 0, totalMargin = 0;
    const validRows = (asgn || []).filter(a => parseFloat(a.hours_worked) > 0);

    // HTML escaping function for PDF export
    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    validRows.forEach(a => {
      const h = parseFloat(a.hours_worked);
      const r = parseFloat(a.rate_per_hour) || 400;
      const cr = parseFloat(a.client_rate_per_hour) || 520;
      const ex = parseFloat(a.extra_amount) || 0;
      const workerPay = h * r + ex;
      const clientPay = h * cr + ex;
      const margin = clientPay - workerPay;
      totalWorker += workerPay;
      totalClient += clientPay;
      totalMargin += margin;

      const statusLabels = {
        pending: 'Ожидает',
        paid: 'Оплачен',
        partial: 'Частично',
        unpaid: 'Не оплачен',
        confirmed: 'Подтверждён'
      };

      rowsHtml += `<tr>
        <td>${esc(a.shifts?.date || '')}</td>
        <td>${esc(wMap[a.worker_id] || '')}</td>
        <td>${esc(a.shifts?.clients?.name || '')}</td>
        <td style="text-align:right">${h}</td>
        <td style="text-align:right">${workerPay.toLocaleString('ru-RU')} ₽</td>
        <td style="text-align:right">${clientPay.toLocaleString('ru-RU')} ₽</td>
        <td style="text-align:right">${margin.toLocaleString('ru-RU')} ₽</td>
        <td>${statusLabels[a.payment_status] || esc(a.payment_status) || ''}</td>
      </tr>`;
    });

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; }
  h1 { font-size: 18px; color: #333; }
  .meta { font-size: 12px; color: #666; margin-bottom: 15px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #4F46E5; color: white; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f9f9f9; }
  .totals { margin-top: 15px; font-weight: bold; font-size: 12px; }
  .totals div { margin: 3px 0; }
</style>
</head>
<body>
  <h1>Отчёт по оплатам — Dispatcher.PRO</h1>
  <div class="meta">Дата: ${new Date().toLocaleString('ru-RU')} | Всего записей: ${validRows.length}</div>
  <table>
    <thead>
      <tr>
        <th>Дата</th>
        <th>Рабочий</th>
        <th>Клиент</th>
        <th style="text-align:right">Часы</th>
        <th style="text-align:right">Рабочему</th>
        <th style="text-align:right">От клиента</th>
        <th style="text-align:right">Маржа</th>
        <th>Статус</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div>Рабочим: ${totalWorker.toLocaleString('ru-RU')} ₽</div>
    <div>От клиентов: ${totalClient.toLocaleString('ru-RU')} ₽</div>
    <div>Маржа: ${totalMargin.toLocaleString('ru-RU')} ₽</div>
  </div>
</body>
</html>`;

    audit('export_pdf', 'payments.pdf', session.userId, session.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));

    // Return as HTML with content-type for browser print-to-PDF
    // Also provide download header
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="payments-report.html"',
      ...cors
    });
    res.end(html);
  } catch(e) {
    json(res, { error: e.message }, 500, cors);
  }
}

module.exports = {
  handleBulkHours,
  handleForceConfirm,
  handleReassignWorkers,
  handleRecurringShiftsList,
  handleRecurringShiftsCreate,
  handleRecurringShiftsUpdate,
  handleRecurringShiftsDelete,
  handleConfirmPayment,
  handleShiftIcal,
  handleExportPdf
};
