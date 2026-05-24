/**
 * User/client routes: client pay method, notifications, telegram status, address suggest
 */
const { readBody, json } = require('./shared');
const { config, loadJson, saveJson } = require('../modules/config');
const { sbFetch } = require('../modules/db');
const { requireAuth } = require('../modules/auth');
const { checkNotifsTable } = require('./shift-routes');

// --- Client pay method ---
function handleClientPayMethodGet(req, res, cors) {
  const cid = new URL('http://localhost' + req.url).searchParams.get('client_id');
  const methods = loadJson('client-pay-methods.json');
  json(res, { method: methods[cid] || 'transfer' }, 200, cors);
}
function handleClientPayMethodPost(req, res, cors) {
  return readBody(req).then(body => {
    try {
      const { client_id, method } = JSON.parse(body);
      if (!client_id || !method) return json(res, { error: 'Missing fields' }, 400, cors);
      const methods = loadJson('client-pay-methods.json');
      methods[client_id] = method;
      saveJson('client-pay-methods.json', methods);
      json(res, { ok: true }, 200, cors);
    } catch (e) {
      json(res, { error: 'Invalid JSON' }, 400, cors);
    }
  }).catch(e => json(res, { error: 'Server error' }, 500, cors));
}

// --- Notifications ---
async function handleNotificationsGet(req, res, cors) {
  try {
    const session = requireAuth(req);
    const userId = session?.sub || session?.userId;
    const role = session?.role;
    if (await checkNotifsTable()) {
      const parts = [];
      if (userId) parts.push(`user_id=eq.${userId}`);
      if (role) parts.push(`role=eq.${role}`);
      const q = parts.length ? parts.join('&') + '&is_read=eq.false&order=created_at.desc&limit=50' : 'is_read=eq.false&order=created_at.desc&limit=50';
      const r = await sbFetch('app_notifications', q);
      const data = await r.json();
      return json(res, Array.isArray(data) ? data : [], 200, cors);
    }
  } catch (e) { console.error('[Notifs] Supabase error, falling back to JSON:', e.message); }
  const notifs = loadJson('notifications.json');
  json(res, notifs, 200, cors);
}
async function handleNotificationsDelete(req, res, cors) {
  try {
    const session = requireAuth(req);
    const userId = session?.sub || session?.userId;
    const role = session?.role;
    if (await checkNotifsTable()) {
      const parts = [];
      if (userId) parts.push(`user_id=eq.${userId}`);
      if (role) parts.push(`role=eq.${role}`);
      const q = parts.join('&');
      if (q) await sbFetch('app_notifications', q, { method: 'DELETE' });
      return json(res, { ok: true }, 200, cors);
    }
  } catch (e) { console.error('[Notifs] Supabase error, falling back to JSON:', e.message); }
  saveJson('notifications.json', []);
  json(res, { ok: true }, 200, cors);
}

// --- Address suggest ---
async function handleAddressSuggest(req, res, cors) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const q = params.get('q') || '';
  if (q.length < 2) return json(res, { suggestions: [] }, 200, cors);
  try {
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ' Камчатский край')}&countrycodes=ru&limit=5&addressdetails=1&accept-language=ru`, {
      headers: { 'User-Agent': 'DispatcherPRO/1.0' }
    });
    const geoData = await geoRes.json();
    json(res, { suggestions: geoData.map(r => ({ name: r.display_name, lat: r.lat, lon: r.lon })).slice(0, 5) }, 200, cors);
  } catch (e) { json(res, { suggestions: [] }, 200, cors); }
}

// --- Telegram status ---
async function handleTelegramStatus(req, res, cors) {
  const q = new URL('http://localhost' + req.url).searchParams;
  const phone = (q.get('phone') || '').replace(/[-+()\s]/g, '').replace(/^8/, '7');
  const table = q.get('table') || 'users';
  const field = q.get('field') || 'telegram_chat_id';
  try {
    const phoneCol = table === 'clients' ? 'contact' : 'phone';
    const rows = await (await sbFetch(table, `${phoneCol}=ilike.%25${phone.slice(-10)}%25&select=${field}&limit=1`)).json();
    json(res, { linked: Array.isArray(rows) && rows.length > 0 && !!rows[0][field] }, 200, cors);
  } catch (e) { json(res, { linked: false }, 500, cors); }
}

module.exports = {
  handleClientPayMethodGet,
  handleClientPayMethodPost,
  handleNotificationsGet,
  handleNotificationsDelete,
  handleAddressSuggest,
  handleTelegramStatus
};
