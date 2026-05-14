/**
 * Chat routes — client/worker/dispatcher messaging per shift
 */
const { sbFetch } = require('../modules/db');
const { requireAuth } = require('../modules/auth');
const { readBody, json } = require('./shared');

// --- GET /api/chat/:shift_id — get messages ---
async function handleChatGet(req, res, cors, urlPath) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);

  const parts = urlPath.split('/');
  const shiftId = parts[3]; // /api/chat/:shift_id
  if (!shiftId || !/^[0-9a-f-]{36}$/.test(shiftId)) {
    return json(res, { error: 'Неверный shift_id' }, 400, cors);
  }

  // Verify user has access to this shift
  const hasAccess = await verifyShiftAccess(shiftId, session);
  if (!hasAccess) return json(res, { error: 'Нет доступа к этому чату' }, 403, cors);

  try {
    const r = await sbFetch('chat_messages', `shift_id=eq.${shiftId}&order=created_at.asc&limit=100&select=id,sender_id,sender_role,sender_name,message,created_at`);
    const data = await r.json();
    if (!Array.isArray(data)) return json(res, [], 200, cors);
    json(res, data, 200, cors);
  } catch (e) {
    console.error('Chat GET error:', e.message);
    json(res, { error: 'Ошибка загрузки сообщений' }, 500, cors);
  }
}

// --- POST /api/chat/:shift_id — send message ---
async function handleChatPost(req, res, cors, urlPath) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);

  const parts = urlPath.split('/');
  const shiftId = parts[3];
  if (!shiftId || !/^[0-9a-f-]{36}$/.test(shiftId)) {
    return json(res, { error: 'Неверный shift_id' }, 400, cors);
  }

  // Verify user has access to this shift
  const hasAccess = await verifyShiftAccess(shiftId, session);
  if (!hasAccess) return json(res, { error: 'Нет доступа к этому чату' }, 403, cors);

  const body = await readBody(req);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return json(res, { error: 'Неверный JSON' }, 400, cors);
  }

  const message = (parsed.message || '').trim();
  if (!message) return json(res, { error: 'Пустое сообщение' }, 400, cors);
  if (message.length > 2000) return json(res, { error: 'Сообщение слишком длинное' }, 400, cors);

  // Get sender name
  let senderName = session.role === 'owner' ? 'Диспетчер' : session.fullName || 'Неизвестный';
  if (session.role === 'owner' || session.role === 'dispatcher') {
    // Try to get from users table
    try {
      const ur = await sbFetch('users', `id=eq.${session.userId}&select=full_name&limit=1`);
      const ud = await ur.json();
      if (Array.isArray(ud) && ud[0]?.full_name) senderName = ud[0].full_name;
    } catch (e) {}
  }

  try {
    const msg = {
      shift_id: shiftId,
      sender_id: session.userId,
      sender_role: session.role === 'owner' || session.role === 'dispatcher' ? 'dispatcher' : session.role,
      sender_name: senderName,
      message
    };
    const r = await sbFetch('chat_messages', '', { method: 'POST', body: JSON.stringify(msg) });
    const data = await r.text();
    res.writeHead(r.status, { 'Content-Type': 'application/json', ...cors });
    res.end(data);
  } catch (e) {
    console.error('Chat POST error:', e.message);
    json(res, { error: 'Ошибка отправки сообщения' }, 500, cors);
  }
}

// --- Verify that user has access to shift chat ---
async function verifyShiftAccess(shiftId, session) {
  const role = session.role;

  // Owner/dispatcher can access any shift chat
  if (role === 'owner' || role === 'dispatcher') return true;

  try {
    if (role === 'worker') {
      // Check if worker is assigned to this shift
      const r = await sbFetch('shift_assignments', `shift_id=eq.${shiftId}&worker_id=eq.${session.userId}&select=id&limit=1`);
      const data = await r.json();
      return Array.isArray(data) && data.length > 0;
    }
    if (role === 'client') {
      // Check if shift belongs to this client
      const r = await sbFetch('shifts', `id=eq.${shiftId}&client_id=eq.${session.userId}&select=id&limit=1`);
      const data = await r.json();
      return Array.isArray(data) && data.length > 0;
    }
  } catch (e) {
    console.error('verifyShiftAccess error:', e.message);
  }
  return false;
}

module.exports = { handleChatGet, handleChatPost };
