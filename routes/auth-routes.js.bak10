/**
 * Auth routes: login, register, forgot, me, refresh, logout, 2FA
 */
const { readBody, json } = require('./shared');
const { config } = require('../modules/config');
const { sbFetch, sbHeaders } = require('../modules/db');
const { createToken, requireAuth, getTokenFromReq, hashPassword, checkPassword, needsUpgrade, checkRateLimit, resetRateLimit, blacklistToken, refreshToken } = require('../modules/auth');
const { audit } = require('../modules/audit');
const { tgSendMessage } = require('../modules/telegram');
const { syncToGoogleSheets } = require('../modules/gas-sync');

// --- 2FA store: userId -> { code, expires, familyId } ---
const twoFAStore = new Map();

function generate2FACode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// --- Auth login ---
async function handleLogin(req, res, cors) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) return json(res, { ok: false, error: 'Слишком много попыток. Подождите 5 минут.' }, 429, cors);

  const body = await readBody(req);
  try {
    const { table, phone, pass, role } = JSON.parse(body);
    if (!phone || !pass) return json(res, { ok: false, error: 'Заполните все поля' });

    const cleanPhone = phone.replace(/[-+()\s]/g, '').replace(/^8/, '7');
    const phoneCol = table === 'clients' ? 'contact' : 'phone';
    const isActiveFilter = table === 'clients' ? '' : '&is_active=eq.true';
    const users = await (await sbFetch(table, `${phoneCol}=ilike.%25${cleanPhone.slice(-10)}%25${isActiveFilter}&limit=1`)).json();
    if (!users.length) { audit('login_failure', `not found: ${cleanPhone} (${table})`, null, null, ip); return json(res, { ok: false, error: 'Пользователь не найден' }); }
    const u = users[0];

    if (!checkPassword(pass, u.password)) { audit('login_failure', `wrong pass: ${u.full_name || u.name} (${table})`, u.id, u.role, ip); return json(res, { ok: false, error: 'Неверный пароль' }); }
    if (role && u.role !== role) return json(res, { ok: false, error: 'Нет доступа' });
    if (u.is_active === false) return json(res, { ok: false, error: 'Аккаунт отключён' });

    // Upgrade plaintext or SHA-256 to bcrypt
    if (needsUpgrade(u.password)) {
      await sbFetch(table, `id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: hashPassword(pass) }) });
    }

    resetRateLimit(ip);
    const token = createToken(u.id, u.role || (table === 'workers' ? 'worker' : table === 'clients' ? 'client' : 'owner'), table);
    audit('login_success', `${u.full_name || u.name} (${table})`, u.id, u.role, ip);

    // Check if 2FA needed (owner/dispatcher with linked TG)
    const userRole = u.role || (table === 'workers' ? 'worker' : table === 'clients' ? 'client' : 'owner');
    if ((userRole === 'owner' || userRole === 'dispatcher') && u.telegram_chat_id) {
      const code = generate2FACode();
      twoFAStore.set(u.id, { code, expires: Date.now() + 5 * 60 * 1000, token, user: { id: u.id, full_name: u.full_name || u.name, phone: u.phone || u.contact || '', role: userRole, rate_per_hour: u.rate_per_hour, monthly_target_hours: u.monthly_target_hours, is_active: u.is_active } });
      try {
        await tgSendMessage(u.telegram_chat_id, `🔐 Код подтверждения входа: <code>${code}</code>\n\nДействителен 5 минут. Если это не вы — проигнорируйте.`);
      } catch (e) { console.error('[2FA] TG send error:', e.message); }
      return json(res, { ok: true, require2FA: true, userId: u.id, role: userRole });
    }

    json(res, {
      ok: true, token,
      user: { id: u.id, full_name: u.full_name || u.name, phone: u.phone || u.contact || '', role: userRole, rate_per_hour: u.rate_per_hour, monthly_target_hours: u.monthly_target_hours, is_active: u.is_active }
    });
  } catch (e) { json(res, { ok: false, error: e.message }, 500, cors); }
}

// --- Verify 2FA ---
async function handleVerify2FA(req, res, cors) {
  const body = await readBody(req);
  try {
    const { userId, code } = JSON.parse(body);
    if (!userId || !code) return json(res, { ok: false, error: 'userId и код обязательны' }, 400, cors);

    const entry = twoFAStore.get(userId);
    if (!entry) return json(res, { ok: false, error: 'Код не запрашивался или устарел' }, 400, cors);
    if (Date.now() > entry.expires) { twoFAStore.delete(userId); return json(res, { ok: false, error: 'Код истёк. Войдите заново.' }, 400, cors); }
    if (entry.code !== code) return json(res, { ok: false, error: 'Неверный код' }, 400, cors);

    // Success — clear and return token
    twoFAStore.delete(userId);
    json(res, { ok: true, token: entry.token, user: entry.user });
  } catch (e) { json(res, { ok: false, error: e.message }, 500, cors); }
}

// --- Auth register ---
async function handleRegister(req, res, cors) {
  const regSession = requireAuth(req);
  const body = await readBody(req);
  try {
    const { table, data } = JSON.parse(body);
    if (!regSession) {
      if (!['workers', 'clients', 'users'].includes(table)) return json(res, { ok: false, error: 'Регистрация недоступна для этого типа' }, 403, cors);
      if (table === 'users') {
        if (data.role && data.role !== 'dispatcher') return json(res, { ok: false, error: 'Саморегистрация доступна только для диспетчеров' }, 403, cors);
        data.role = data.role || 'dispatcher'; // Force role
      }
    } else {
      if (!['owner', 'dispatcher'].includes(regSession.role)) return json(res, { ok: false, error: 'Нет прав для регистрации' }, 403, cors);
      if (data.role === 'owner' && regSession.role !== 'owner') return json(res, { ok: false, error: 'Только владелец может создать владельца' }, 403, cors);
    }

    const phoneField = table === 'clients' ? 'contact' : 'phone';
    if (data[phoneField]) {
      const digits = data[phoneField].replace(/[-+()\s]/g, '').replace(/^8/, '7');
      data[phoneField] = '+' + digits;
    }

    // Проверка дубликата телефона
    if (data[phoneField]) {
      const dupDigits = data[phoneField].replace(/[-+()\s]/g, '').replace(/^8/, '7');
      const dupCheck = await (await sbFetch(table, `${phoneField}=ilike.%25${dupDigits.slice(-10)}%25&select=id,full_name&limit=1`)).json();
      if (dupCheck.length) {
        return json(res, { ok: false, error: 'Пользователь с таким номером уже зарегистрирован' }, 409, cors);
      }
    }

    if (data.password) data.password = hashPassword(data.password);

    const sbRes = await sbFetch(table, '', { method: 'POST', body: JSON.stringify(data) });
    const result = await sbRes.text();

    if (sbRes.status < 300 && table === 'users') {
      try {
        const u = Array.isArray(JSON.parse(result)) ? JSON.parse(result)[0] : JSON.parse(result);
        if (u) syncToGoogleSheets('syncUser', { id: u.id, full_name: u.full_name, phone: u.phone || u.contact, is_active: u.is_active !== false });
      } catch (e) { console.error('[GAS] User sync error:', e.message); }
    }

    // Audit registration
    if (sbRes.status < 300) {
      try {
        const regData = Array.isArray(JSON.parse(result)) ? JSON.parse(result)[0] : JSON.parse(result);
        audit('register', `${regData.full_name || regData.name || ''} (${table})`, regData.id, regData.role || table, req.headers['x-forwarded-for'] || req.socket.remoteAddress);
      } catch(e) {}
    }

    res.writeHead(sbRes.status, { 'Content-Type': 'application/json', ...cors });
    res.end(result);
  } catch (e) { json(res, { ok: false, error: e.message }, 500, cors); }
}

// --- Forgot password ---
async function handleForgot(req, res, cors) {
  const body = await readBody(req);
  try {
    const { table, phone } = JSON.parse(body);
    if (!phone) return json(res, { ok: false, error: 'Введите телефон' });

    const cleanPhone = phone.replace(/[-+()\s]/g, '').replace(/^8/, '7');
    const phoneCol = table === 'clients' ? 'contact' : 'phone';
    const users = await (await sbFetch(table, `${phoneCol}=ilike.%25${cleanPhone.slice(-10)}%25&select=id,full_name,telegram_chat_id&limit=1`)).json();
    if (!users.length) return json(res, { ok: false, error: 'Пользователь не найден' });
    const u = users[0];
    if (!u.telegram_chat_id) return json(res, { ok: false, error: 'Telegram не привязан. Обратитесь к администратору.' });

    const newPass = Math.random().toString(36).slice(2, 8);
    await sbFetch(table, `id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: hashPassword(newPass) }) });
    await tgSendMessage(u.telegram_chat_id, `🔑 Ваш новый пароль: <code>${newPass}</code>\n\nВойдите в систему и смените его в настройках.`);
    console.log('[TG] Password reset for', u.full_name);
    audit('password_reset', u.full_name, u.id, table, req.headers['x-forwarded-for'] || req.socket.remoteAddress);
    json(res, { ok: true });
  } catch (e) {
    console.error('[Forgot] Error:', e.message);
    json(res, { ok: false, error: 'Ошибка сервера' }, 500, cors);
  }
}

// --- Auth me (verify JWT + return user data) ---
async function handleAuthMe(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { ok: false, error: 'Токен недействителен' }, 401, cors);

  try {
    const { userId, role, table } = session;
    const isActiveFilter = table === 'clients' ? '' : '&is_active=eq.true';
    const users = await (await sbFetch(table, `id=eq.${userId}${isActiveFilter}&limit=1`)).json();
    if (!users.length) return json(res, { ok: false, error: 'Пользователь не найден' }, 404, cors);
    const u = users[0];
    if (u.is_active === false) return json(res, { ok: false, error: 'Аккаунт отключён' }, 403, cors);

    // Issue fresh token (extends session)
    const freshToken = createToken(u.id, u.role || (table === 'workers' ? 'worker' : table === 'clients' ? 'client' : 'owner'), table);
    json(res, {
      ok: true, token: freshToken,
      user: { id: u.id, full_name: u.full_name || u.name, phone: u.phone || u.contact || '', role: u.role, rate_per_hour: u.rate_per_hour, monthly_target_hours: u.monthly_target_hours, is_active: u.is_active }
    });
  } catch (e) { json(res, { ok: false, error: e.message }, 500, cors); }
}

// --- Auth refresh ---
async function handleAuthRefresh(req, res, cors) {
  const body = await readBody(req);
  try {
    const { token } = JSON.parse(body);
    if (!token) return json(res, { ok: false, error: 'Токен не указан' }, 400, cors);
    const newToken = refreshToken(token);
    if (!newToken) return json(res, { ok: false, error: 'Токен недействителен', code: 'AUTH_REQUIRED' }, 401, cors);
    json(res, { ok: true, token: newToken });
  } catch (e) { json(res, { ok: false, error: e.message }, 500, cors); }
}

// --- Auth logout ---
async function handleAuthLogout(req, res, cors) {
  const token = getTokenFromReq(req);
  if (token) blacklistToken(token, 7 * 24 * 60 * 60 * 1000);
  json(res, { ok: true });
}

function mountAuthRoutes(router, createRouter) {
  // These are used by the main router — no-op here, mounting is done in main routes.js
}

module.exports = {
  handleLogin,
  handleRegister,
  handleForgot,
  handleAuthMe,
  handleAuthRefresh,
  handleAuthLogout,
  handleVerify2FA
};
