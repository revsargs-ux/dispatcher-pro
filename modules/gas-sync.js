/**
 * Google Sheets synchronization via GAS — bidirectional
 */
const crypto = require('crypto');
const { config } = require('./config');

// --- Push TO Google Sheets (App → GAS) ---

async function syncToGoogleSheets(action, data) {
  try {
    if (action === 'syncShift' && data.shift_status) {
      const statusMap = { pending: 'Ожидает', planned: 'Запланирована', completed: 'Завершена', cancelled: 'Отменена' };
      data.shift_status = statusMap[data.shift_status] || data.shift_status;
    }
    const params = new URLSearchParams({ action });
    if (action === 'syncShift') {
      Object.entries(data).forEach(([k, v]) => { if (v !== null && v !== undefined) params.set(k, String(v)); });
    } else {
      params.set('data', JSON.stringify(data));
    }
    const r = await fetch(config.gasUrl + '?' + params.toString(), {
      headers: { 'User-Agent': 'DispatcherPRO/1.0' },
      redirect: 'follow' // БАГ #4: GAS всегда редиректит — следуем
    });
    const result = await r.json();
    if (result.status === 'ok') {
      console.log('[GAS] Synced:', action, result.data?.message || '');
    } else {
      console.error('[GAS] Sync failed:', action, JSON.stringify(result));
    }
    return result;
  } catch (e) {
    console.error('[GAS] Sync error:', e.message);
    return null;
  }
}

// --- Pull FROM Google Sheets (GAS → App) ---

async function fetchFromGAS(action) {
  try {
    const url = config.gasUrl + '?action=' + action;
    const r = await fetch(url, { headers: { 'User-Agent': 'DispatcherPRO/1.0' }, redirect: 'follow' });
    const result = await r.json();
    return result.status === 'ok' ? result.data : null;
  } catch (e) {
    console.error('[GAS] Fetch error:', action, e.message);
    return null;
  }
}

/**
 * Periodic sync: pull workers from GAS and compare with Supabase
 */
async function gasSyncWorkers(sbFetch) {
  const gasWorkers = await fetchFromGAS('getEmployees');
  if (!gasWorkers || !Array.isArray(gasWorkers)) return;

  for (const gw of gasWorkers) {
    if (!gw.id) continue;
    try {
      const rows = await (await sbFetch('workers', `id=eq.${gw.id}&select=id,full_name,phone,is_active&limit=1`)).json();
      if (!rows.length) continue; // New workers from GAS not auto-created

      const existing = rows[0];
      const updates = {};
      if (gw.name && gw.name !== existing.full_name) updates.full_name = gw.name;
      if (gw.phone && gw.phone !== existing.phone) updates.phone = gw.phone;

      if (Object.keys(updates).length > 0) {
        await sbFetch('workers', `id=eq.${gw.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
        console.log('[GAS-Sync] Updated worker:', gw.id, updates);
      }
    } catch (e) {
      console.error('[GAS-Sync] Worker error:', gw.id, e.message);
    }
  }
}

/**
 * Periodic sync: pull shifts from GAS and compare assignments
 */
async function gasSyncShifts(sbFetch) {
  const gasShifts = await fetchFromGAS('getShifts');
  if (!gasShifts || !Array.isArray(gasShifts)) return;

  for (const gs of gasShifts) {
    if (!gs.id_assign || gs.id_assign === 'undefined') continue;
    try {
      const rows = await (await sbFetch('shift_assignments', `id=eq.${gs.id_assign}&select=id,hours_worked,rate_per_hour,extra_amount,paid_amount&limit=1`)).json();
      if (!rows.length) continue;

      const existing = rows[0];
      const updates = {};

      const gasHours = parseFloat(gs.hours) || 0;
      const gasRate = parseFloat(gs.rate) || 0;
      const gasPaid = parseFloat(gs.paid) || 0;
      const gasBonus = parseFloat(gs.bonus) || 0;
      const gasFine = parseFloat(gs.fine) || 0;

      if (gasHours && gasHours !== existing.hours_worked) updates.hours_worked = gasHours;
      if (gasRate && gasRate !== existing.rate_per_hour) updates.rate_per_hour = gasRate;
      if (gasPaid !== existing.paid_amount) updates.paid_amount = gasPaid;

      const gasExtra = gasBonus - gasFine;
      if (gasExtra !== existing.extra_amount) updates.extra_amount = gasExtra;

      if (Object.keys(updates).length > 0) {
        await sbFetch('shift_assignments', `id=eq.${gs.id_assign}`, { method: 'PATCH', body: JSON.stringify(updates) });
        console.log('[GAS-Sync] Updated assignment:', gs.id_assign, updates);
      }
    } catch (e) {
      console.error('[GAS-Sync] Shift error:', gs.id_assign, e.message);
    }
  }
}

/**
 * Run all periodic syncs
 */
async function runGasSync(sbFetch) {
  if (!config.gasUrl) return;
  console.log('[GAS-Sync] Starting periodic sync...');
  try {
    await gasSyncWorkers(sbFetch);
    await gasSyncShifts(sbFetch);
    console.log('[GAS-Sync] Complete');
  } catch (e) {
    console.error('[GAS-Sync] Error:', e.message);
  }
}

/**
 * Verify HMAC signature from GAS webhook
 * Header format: X-GAS-Signature: timestamp.signature
 * GAS side (comment for reference):
 *   const timestamp = Date.now().toString();
 *   const payload = timestamp + '.' + JSON.stringify(body);
 *   const signature = Utilities.computeHmacSha256Signature(payload, GAS_SECRET)
 *     .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
 *   headers['X-GAS-Signature'] = timestamp + '.' + signature;
 */
function verifyGasSignature(header, body) {
  if (!header || !config.gasWebhookSecret) return false;
  const [timestamp, signature] = header.split('.');
  if (!timestamp || !signature) return false;
  // Reject stale requests (>5 min)
  if (Date.now() - parseInt(timestamp, 10) > 5 * 60 * 1000) return false;
  const payload = timestamp + '.' + body;
  const expected = crypto.createHmac('sha256', config.gasWebhookSecret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = { syncToGoogleSheets, runGasSync, verifyGasSignature };
