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

// IP → City cache (5min, 100 entries)
const cityCache = new Map();

// Extract first public IP from x-forwarded-for chain or raw IP
function extractPublicIp(ipRaw) {
  if (!ipRaw) return '';
  // x-forwarded-for can be a comma-separated chain: "client.ip, proxy1.ip, proxy2.ip"
  const ips = ipRaw.split(',').map(s => s.trim()).filter(Boolean);
  for (const ip of ips) {
    const clean = ip.replace(/^::ffff:/, '');
    // Skip private/loopback IPs
    if (clean === '127.0.0.1' || clean === '::1' || clean === 'unknown') continue;
    if (clean.startsWith('10.') || clean.startsWith('192.168.')) continue;
    // 172.16.x.x — 172.31.x.x
    const m172 = clean.match(/^172\.(\d+)\./);
    if (m172 && parseInt(m172[1]) >= 16 && parseInt(m172[1]) <= 31) continue;
    return clean;
  }
  // Fallback: return first non-empty IP even if private
  return ips[0]?.replace(/^::ffff:/, '') || '';
}

async function getCityByIp(ip) {
  if (!ip || ip === 'unknown' || ip.startsWith('::') || ip === '127.0.0.1') return '';
  if (cityCache.has(ip)) return cityCache.get(ip);
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,country,status&lang=ru`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const city = data.status === 'success' && data.country === 'Russia' ? (data.city || '') : '';
    if (cityCache.size > 100) { const first = cityCache.keys().next().value; cityCache.delete(first); }
    cityCache.set(ip, city);
    return city;
  } catch { return ''; }
}

// Обновить город у пользователя если пустой
async function ensureCity(table, userId, ip) {
  try {
    const check = await (await sbFetch(table, `id=eq.${userId}&select=city&limit=1`)).json();
    if (check.length && !check[0].city) {
      const city = await getCityByIp(ip);
      if (city) await sbFetch(table, `id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ city }) });
    }
  } catch {}
}

// --- 2FA store: userId -> { code, expires, familyId } ---
const twoFAStore = new Map();

// --- 2FA rate limit: IP -> { count, resetAt } ---
const twoFARateLimit = new Map();

function check2FARateLimit(ip) {
  const now = Date.now();
  const entry = twoFARateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    twoFARateLimit.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

function generate2FACode() {
  const crypto = require('crypto');
  const buf = crypto.randomBytes(4);
  return String((buf.readUInt32BE(0) % 900000) + 100000);
}

// --- Password reset rate limit: IP -> { count, resetAt } ---
const passwordResetLimit = new Map();
const RESET_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RESET_LIMIT_MAX = 3;

function checkPasswordResetLimit(ip) {
  const now = Date.now();
  const entry = passwordResetLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    passwordResetLimit.set(ip, { count: 1, resetAt: now + RESET_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RESET_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// --- Auth login ---
async function handleLogin(req, res, cors) {
  const ip = extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  // Skip rate limit for localhost and tests
  const skipRL = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!skipRL && !checkRateLimit(ip)) return json(res, { ok: false, error: 'Слишком много попыток. Подождите 5 минут.' }, 429, cors);

  const body = await readBody(req);
  try {
    const { table, phone, pass, role } = JSON.parse(body);
    if (!phone || !pass) return json(res, { ok: false, error: 'Заполните все поля' });

    const cleanPhone = phone.replace(/[-+()\s]/g, '').replace(/^8/, '7');
    const phoneCol = table === 'clients' ? 'contact' : 'phone';
    const isActiveFilter = table === 'clients' ? '' : '&is_active=eq.true';
    const users = await (await sbFetch(table, `${phoneCol}=ilike.%25${cleanPhone.slice(-10)}%25${isActiveFilter}&limit=1`)).json();
    if (!users.length) { audit('login_failure', `not found: ${cleanPhone} (${table})`, null, null, ip); return json(res, { ok: false, error: 'Пользователь не найден' }, 401, cors); }
    const u = users[0];

    if (!(await checkPassword(pass, u.password))) { audit('login_failure', `wrong pass: ${u.full_name || u.name} (${table})`, u.id, u.role, ip); return json(res, { ok: false, error: 'Неверный пароль' }, 401, cors); }
    if (role && u.role !== role) return json(res, { ok: false, error: 'Нет доступа' }, 403, cors);
    if (u.is_active === false) return json(res, { ok: false, error: 'Аккаунт отключён' }, 403, cors);

    // Upgrade plaintext or SHA-256 to bcrypt
    if (needsUpgrade(u.password)) {
      await sbFetch(table, `id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: await hashPassword(pass) }) });
    }

    resetRateLimit(ip);
    const token = createToken(u.id, u.role || (table === 'workers' ? 'worker' : table === 'clients' ? 'client' : 'owner'), table);
    audit('login_success', `${u.full_name || u.name} (${table})`, u.id, u.role, ip);
    // Определить город если пустой (фоново, не блокируем вход)
    ensureCity(table, u.id, ip).catch(()=>{});

    // Check if 2FA needed (owner/dispatcher with linked TG)
    const userRole = u.role || (table === 'workers' ? 'worker' : table === 'clients' ? 'client' : 'owner');
    if ((userRole === 'owner' || userRole === 'dispatcher') && u.telegram_chat_id) {
      const code = generate2FACode();
      twoFAStore.set(u.id, { code, expires: Date.now() + 5 * 60 * 1000, token, user: { id: u.id, full_name: u.full_name || u.name, phone: u.phone || u.contact || '', role: userRole, city: u.city || '', rate_per_hour: u.rate_per_hour, monthly_target_hours: u.monthly_target_hours, is_active: u.is_active } });
      try {
        await tgSendMessage(u.telegram_chat_id, `🔐 Код подтверждения входа: <code>${code}</code>\n\nДействителен 5 минут. Если это не вы — проигнорируйте.`);
      } catch (e) { console.error('[2FA] TG send error:', e.message); }
      return json(res, { ok: true, require2FA: true, userId: u.id, role: userRole });
    }

    json(res, {
      ok: true, token,
      user: { id: u.id, full_name: u.full_name || u.name, phone: u.phone || u.contact || '', role: userRole, city: u.city || '', rate_per_hour: u.rate_per_hour, monthly_target_hours: u.monthly_target_hours, is_active: u.is_active }
    });
  } catch (e) { json(res, { ok: false, error: e.message }, 500, cors); }
}

// --- Verify 2FA ---
async function handleVerify2FA(req, res, cors) {
  // Rate limit by IP
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!check2FARateLimit(clientIp)) return json(res, { ok: false, error: 'Слишком много попыток. Попробуйте позже.' }, 429, cors);
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
        // Allow owner self-registration only if no owners exist in DB
        if (data.role === 'owner') {
          const existing = await (await sbFetch('users', 'role=eq.owner&select=id&limit=1')).json();
          if (existing.length > 0) return json(res, { ok: false, error: 'Владелец уже зарегистрирован' }, 403, cors);
        } else {
          if (data.role && data.role !== 'dispatcher') return json(res, { ok: false, error: 'Саморегистрация доступна только для диспетчеров' }, 403, cors);
          data.role = data.role || 'dispatcher';
        }
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

    // Определить город по IP при регистрации
    const regIp = extractPublicIp(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
    if (!data.city) {
      const regCity = await getCityByIp(regIp);
      if (regCity) data.city = regCity;
    }

    // Проверка дубликата телефона (BUG-018 fix: encode + as %2B)
    if (data[phoneField]) {
      const encPhone = encodeURIComponent(data[phoneField]);
      const dupCheck = await (await sbFetch(table, `${phoneField}=eq.${encPhone}&select=id&limit=1`)).json();
      if (dupCheck.length) {
        return json(res, { ok: false, error: 'Пользователь с таким номером уже зарегистрирован' }, 409, cors);
      }
    }

    if (data.password) data.password = await hashPassword(data.password);

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
        audit('register', `${regData.full_name || regData.name || ''} (${table})`, regData.id, regData.role || table, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
        // BUG-008: Auto-login after registration — return token
        const newRole = regData.role || (table === 'workers' ? 'worker' : table === 'clients' ? 'client' : 'dispatcher');
        const token = createToken(regData.id, newRole, table);
        return json(res, { ok: true, token, user: { id: regData.id, full_name: regData.full_name || regData.name, phone: regData.phone || regData.contact || '', role: newRole } }, 201, cors);
      } catch(e) {}
    }

    res.writeHead(sbRes.status, { 'Content-Type': 'application/json', ...cors });
    res.end(result);
  } catch (e) { json(res, { ok: false, error: e.message }, 500, cors); }
}

// --- Forgot password ---
async function handleForgot(req, res, cors) {
  // Rate limit password resets: max 3 per hour per IP
  const ip = extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  if (ip && !checkPasswordResetLimit(ip)) {
    return json(res, { ok: false, error: 'Слишком много попыток сброса пароля. Попробуйте позже.' }, 429, cors);
  }
  const body = await readBody(req);
  try {
    const { table, phone } = JSON.parse(body);
    if (!phone) return json(res, { ok: false, error: 'Введите телефон' });

    const cleanPhone = phone.replace(/[-+()\s]/g, '').replace(/^8/, '7');
    const phoneCol = table === 'clients' ? 'contact' : 'phone';
    const nameCol = table === 'clients' ? 'name' : 'full_name';
    // For clients, contact stored with +7 prefix, so keep original phone format
    // For users, phone stored as 79XXXXXXXXX, need ilike search
    const phoneFilter = table === 'clients' ? `${phoneCol}=ilike.%25${cleanPhone.slice(-10)}` : `${phoneCol}=ilike.%25${cleanPhone.slice(-10)}%25`;
    const users = await (await sbFetch(table, `${phoneFilter}&select=id,${nameCol},telegram_chat_id,max_chat_id&limit=1`)).json();
    if (!users.length) return json(res, { ok: false, error: 'Пользователь не найден' });
    const u = users[0];
    const displayName = u.name || u.full_name || 'Пользователь';
    if (!u.telegram_chat_id && !u.max_chat_id) {
      // No messenger linked — generate password and return it (owner can share manually)
      const newPass = require('crypto').randomBytes(4).toString('hex');
      await sbFetch(table, `id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: await hashPassword(newPass) }) });
      audit('password_reset', displayName, u.id, table, ip);
      json(res, { ok: true, password: newPass });
      return;
    }

    const newPass = require('crypto').randomBytes(4).toString('hex');
    await sbFetch(table, `id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: await hashPassword(newPass) }) });
    const msg = `🔑 Ваш новый пароль: <code>${newPass}</code>\n\nВойдите в систему и смените его в настройках.`;
    if (u.telegram_chat_id) await tgSendMessage(u.telegram_chat_id, msg);
    if (u.max_chat_id) {
      try {
        const maxModule = require('../modules/max-bot');
        if (maxModule?.maxSendMessage) await maxModule.maxSendMessage(u.max_chat_id, msg.replace(/<[^>]+>/g, ''));
      } catch(e) { console.error('[Forgot] MAX send error:', e.message); }
    }
    console.log('[Forgot] Password reset for', displayName, 'channels:', u.telegram_chat_id?'TG':'', u.max_chat_id?'MAX':'');
    audit('password_reset', displayName, u.id, table, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    json(res, { ok: true, password: newPass }); // owner получает пароль в ответе
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
    const effectiveRole = u.role || (table === 'workers' ? 'worker' : table === 'clients' ? 'client' : 'owner');
    const freshToken = createToken(u.id, effectiveRole, table);
    json(res, {
      ok: true, token: freshToken,
      user: { id: u.id, full_name: u.full_name || u.name, phone: u.phone || u.contact || '', role: effectiveRole, city: u.city || '', rate_per_hour: u.rate_per_hour, monthly_target_hours: u.monthly_target_hours, is_active: u.is_active }
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

// --- TG Mini App login (by telegram_chat_id) ---
const _tgLoginAttempts = new Map(); // ip -> { count, resetAt }
const TG_LOGIN_MAX = 5;
const TG_LOGIN_WINDOW = 60 * 1000;


async function handleCheckTgLink(req, res, cors) {
  try {
    const url = new URL(req.url, 'http://x');
    const chatId = url.searchParams.get('chat_id');
    if (!chatId) { res.writeHead(400, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ linked: false, error: 'chat_id required' })); }
    const [workerRes, clientRes] = await Promise.all([
      sbFetch('workers', 'telegram_chat_id=eq.' + encodeURIComponent(chatId) + '&select=id&limit=1'),
      sbFetch('clients', 'telegram_chat_id=eq.' + encodeURIComponent(chatId) + '&select=id&limit=1')
    ]);
    const workers = await workerRes.json();
    const clients = await clientRes.json();
    const linked = (Array.isArray(workers) && workers.length > 0) || (Array.isArray(clients) && clients.length > 0);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ linked, role: (Array.isArray(workers) && workers.length > 0) ? 'worker' : (Array.isArray(clients) && clients.length > 0) ? 'client' : null }));
  } catch (e) {
    console.error('[checkTgLink] Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ linked: false, error: 'Server error' }));
  }
}

async function handleTgLinkAuto(req, res, cors) {
  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const phone = (data.phone||'').replace(/[^0-9]/g,'').replace(/^8/,'7');
    const chatId = String(data.chat_id||'');
    if (!phone||!chatId) { res.writeHead(400,{'Content-Type':'application/json',...cors}); return res.end(JSON.stringify({ok:false,error:'phone and chat_id required'})); }
    const safePhone = phone.slice(-10);
    // Search in clients
    const cr = await sbFetch('clients','contact=ilike.%25'+safePhone+'%25&select=id&limit=1');
    const cd = await cr.json();
    if (Array.isArray(cd)&&cd.length) {
      await sbFetch('clients','id=eq.'+cd[0].id,{method:'PATCH',body:JSON.stringify({telegram_chat_id:chatId})});
      res.writeHead(200,{'Content-Type':'application/json',...cors});
      return res.end(JSON.stringify({ok:true,role:'client',id:cd[0].id}));
    }
    // Search in workers
    const wr = await sbFetch('workers','phone=ilike.%25'+safePhone+'%25&select=id&limit=1');
    const wd = await wr.json();
    if (Array.isArray(wd)&&wd.length) {
      await sbFetch('workers','id=eq.'+wd[0].id,{method:'PATCH',body:JSON.stringify({telegram_chat_id:chatId})});
      res.writeHead(200,{'Content-Type':'application/json',...cors});
      return res.end(JSON.stringify({ok:true,role:'worker',id:wd[0].id}));
    }
    res.writeHead(404,{'Content-Type':'application/json',...cors});
    res.end(JSON.stringify({ok:false,error:'Number not found'}));
  } catch(e) {
    console.error('[tgLinkAuto] Error:',e.message);
    res.writeHead(500,{'Content-Type':'application/json',...cors});
    res.end(JSON.stringify({ok:false,error:'Server error'}));
  }
}

async function handleCheckMaxLink(req, res, cors) {
  try {
    const url = new URL(req.url, 'http://x');
    const chatId = url.searchParams.get('chat_id');
    if (!chatId) { res.writeHead(400, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ linked: false, error: 'chat_id required' })); }
    const [workerRes, clientRes] = await Promise.all([
      sbFetch('workers', 'max_chat_id=eq.' + encodeURIComponent(chatId) + '&select=id&limit=1'),
      sbFetch('clients', 'max_chat_id=eq.' + encodeURIComponent(chatId) + '&select=id&limit=1')
    ]);
    const workers = await workerRes.json();
    const clients = await clientRes.json();
    const linked = (Array.isArray(workers) && workers.length > 0) || (Array.isArray(clients) && clients.length > 0);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ linked, role: (Array.isArray(workers) && workers.length > 0) ? 'worker' : (Array.isArray(clients) && clients.length > 0) ? 'client' : null }));
  } catch (e) {
    console.error('[checkMaxLink] Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ linked: false, error: 'Server error' }));
  }
}

async function handleMaxLink(req, res, cors) {
  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const phone = data.phone;
    if (!phone) { res.writeHead(400, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ ok: false, error: 'phone required' })); }
    const cleanPhone = phone.replace(/[^0-9]/g, '').replace(/^8/, '7');
    const safePhone = cleanPhone.slice(-10);
    const searchConfigs = [
      { table: 'clients', phoneCol: 'contact', select: 'id,name,contact' },
      { table: 'workers', phoneCol: 'phone', select: 'id,full_name' }
    ];
    let found = null;
    for (const cfg of searchConfigs) {
      const r = await sbFetch(cfg.table, cfg.phoneCol + '=ilike.%25' + safePhone + '%25&select=' + cfg.select + '&limit=1');
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) { found = { table: cfg.table, id: rows[0].id }; break; }
    }
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...cors });
      return res.end(JSON.stringify({ ok: false, error: 'Number not found in system' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ ok: true, message: 'Number found. Write to @DispatcherPRO1_bot to link.' }));
  } catch (e) {
    console.error('[maxLink] Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ ok: false, error: 'Server error' }));
  }
}

async function handleTgLogin(req, res, cors) {
  const ip = extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  const now = Date.now();
  const att = _tgLoginAttempts.get(ip);
  if (att && att.count >= TG_LOGIN_MAX && now < att.resetAt) {
    console.log('[Auth] tg-login rate limited:', ip, 'count:', att.count);
    return json(res, { error: 'Too many attempts' }, 429, cors);
  }
  if (!att || now >= att.resetAt) _tgLoginAttempts.set(ip, { count: 1, resetAt: now + TG_LOGIN_WINDOW });
  else att.count++;
  console.log('[Auth] tg-login attempt:', ip, 'count:', _tgLoginAttempts.get(ip)?.count);
  try {
    const body = await readBody(req);
    const { telegram_chat_id } = JSON.parse(body);
    if (!telegram_chat_id) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
      return res.end(JSON.stringify({ error: 'telegram_chat_id required' }));
    }

    const chatId = String(telegram_chat_id);

    // Search workers and clients in parallel
    const [workerRes, clientRes] = await Promise.all([
      sbFetch('workers', 'telegram_chat_id=eq.' + encodeURIComponent(chatId) + '&select=id,full_name,telegram_chat_id&limit=1'),
      sbFetch('clients', 'telegram_chat_id=eq.' + encodeURIComponent(chatId) + '&select=id,full_name,name,telegram_chat_id&limit=1')
    ]);

    const workers = await workerRes.json();
    const clients = await clientRes.json();

    let user = null;
    let role = null;

    if (Array.isArray(workers) && workers.length > 0) {
      user = workers[0];
      role = 'worker';
    } else if (Array.isArray(clients) && clients.length > 0) {
      user = clients[0];
      role = 'client';
    }

    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...cors });
      return res.end(JSON.stringify({ error: 'User not found. Link your account in the bot first.' }));
    }

    const token = createToken(user.id, role, role === 'worker' ? 'workers' : 'clients');
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ token, user: { id: user.id, role, city: user.city || '', full_name: user.full_name || user.name } }));
  } catch (e) {
    console.error('[TG Login] Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ error: 'Server error' }));
  }
}

function mountAuthRoutes(router, createRouter) {
  // These are used by the main router — no-op here, mounting is done in main routes.js
}

module.exports = {  handleCheckTgLink,
  handleTgLinkAuto,
  handleCheckMaxLink,
  handleMaxLink,

  handleLogin,
  handleRegister,
  handleForgot,
  handleAuthMe,
  handleAuthRefresh,
  handleAuthLogout,
  handleVerify2FA,
  handleTgLogin
};
