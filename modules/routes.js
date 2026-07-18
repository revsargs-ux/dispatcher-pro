/**
 * API proxy + all route handlers — thin router that imports sub-modules
 */
const fs = require('fs');
const path = require('path');

const { config, loadJson, saveJson } = require('./config');
const { sbFetch, sbHeaders } = require('./db');
const { sendPushNotification, sendPushToRole } = require('../notifications-module/push-trigger');
const { getCorsHeaders, SEC_HEADERS } = require('./cors');
const { requireAuth, hashPassword, blacklistToken } = require('./auth');
const { audit } = require('./audit');
const { verifyGasSignature } = require('./gas-sync');
const { recordRequest, getStats } = require('./monitoring');
const { tgNotify, tgNotifyRole, handleTgMessage, startPolling } = require('./telegram');
const { maxNotify, maxNotifyRole, startMaxPolling } = require('./max-bot');

// Sub-modules
const authRoutes = require('../routes/auth-routes');
const shiftRoutes = require('../routes/shift-routes');
const userRoutes = require('../routes/user-routes');
const paymentRoutes = require('../routes/payment-routes');
const trackingRoutes = require('../routes/tracking-routes');
const chatRoutes = require('../routes/chat-routes');
const featureRoutes = require('../routes/feature-routes');
const { readBody, json, extractPublicIp } = require('../routes/shared');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/js',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml'
};

// --- Notify pending workers when someone declines ---
async function notifyPendingWorkers(shiftId, declinedWorkerId) {
  try {
    const aRes = await sbFetch('shift_assignments',
      `shift_id=eq.${shiftId}&invite_status=in.(pending,invited)&select=worker_id,shifts!inner(date,start_time,address,clients(name))&limit=50`
    );
    const assignments = await aRes.json();
    if (!Array.isArray(assignments) || !assignments.length) return;
    const shiftInfo = assignments[0]?.shifts || {};
    const dateFmt = shiftInfo.date ? shiftInfo.date.split('-').reverse().join('.') : '—';
    const timeStr = shiftInfo.start_time ? shiftInfo.start_time.slice(0,5) : '—';
    const clientName = shiftInfo.clients?.name || '—';
    const address = shiftInfo.address || '—';
    const text = `📢 Освободилась смена!\n\n🏢 ${clientName}\n📅 ${dateFmt} в ${timeStr}\n📍 ${address}\n\nЗаказ снова доступен — подтвердите в приложении.`;
    for (const a of assignments) {
      if (a.worker_id === declinedWorkerId) continue;
      const wRes = await sbFetch('workers',
        `id=eq.${a.worker_id}&select=telegram_chat_id,max_chat_id,phone&limit=1`
      );
      const workers = await wRes.json();
      if (!Array.isArray(workers) || !workers[0]) continue;
      const w = workers[0];
      if (w.telegram_chat_id) tgNotify('workers', w.phone || w.telegram_chat_id, text);
      if (w.max_chat_id) maxNotify('workers', w.phone || w.max_chat_id, text);
    }
  } catch(e) {
    console.error('[notifyPendingWorkers] error:', e.message);
  }
}

// --- Health ---
async function handleHealth(req, res, cors) {
  let dbOk = false;
  try {
    const { sbFetch } = require('./db');
    const dbRes = await sbFetch('service_types', 'select=id&limit=1', { signal: AbortSignal.timeout(3000) });
    dbOk = dbRes.ok;
  } catch (e) {
    console.error('[Health] DB check failed:', e.message);
  }
  const status = dbOk ? 200 : 503;
  json(res, {
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }, status, cors);
}

// --- Stats ---
function handleStats(req, res, cors) {
  json(res, getStats(), 200, cors);
}

// --- API proxy (generic Supabase) with sync + notifications ---
const ALLOWED_TABLES = new Set(['users','workers','clients','dispatchers','shifts','shift_assignments','service_types','payments','recurring_orders','shift_requirements','reviews','chat_messages','user_device_tokens']);

async function handleApiProxy(req, res, cors, urlPath) {
  const table = urlPath.replace('/api/', '').split('/')[0];
  let query = req.url.includes('?') ? req.url.split('?').slice(1).join('?') : '';
  if (!table) return json(res, { error: 'Missing table' }, 400, cors);
  if (!ALLOWED_TABLES.has(table)) return json(res, { error: 'Forbidden table' }, 403, cors);

  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Требуется авторизация', code: 'AUTH_REQUIRED' }, 401, cors);

  // Query validation — owner gets full access (trusted, authenticated)
  if (session.role === 'owner') {
    // select=* allowed for owner — do not restrict
  } else if (query.match(/select=\*/)) {
    query = query.replace(/select=\*/, 'select=id');
  }
  if (!query.match(/limit=/)) query += '&limit=50';

  // Role-based access
  // BUG-003: payments — owner+client full; dispatcher GET only
  // BUG-020 fix: payments — owner full, client full, dispatcher GET+POST (создание оплат)
  if (table === 'payments' && session.role === 'worker') {
    return json(res, { error: 'Нет доступа' }, 403, cors);
  }
  // BUG-007: users — owner full; dispatcher PATCH own profile only
  if (table === 'users' && session.role !== 'owner') {
    if (!(session.role === 'dispatcher' && req.method === 'PATCH')) {
      return json(res, { error: 'Нет доступа' }, 403, cors);
    }
  }
  // Worker: only GET shift_assignments, POST nothing sensitive — all other mutations blocked
  if (session.role === 'worker') {
    // Block all DELETE
    if (req.method === 'DELETE') return json(res, { error: 'Нет доступа' }, 403, cors);
    // Block non-GET on protected tables
    if (req.method !== 'GET' && !['shift_assignments'].includes(table))
      return json(res, { error: 'Нет доступа' }, 403, cors);
  }

  // Dispatcher GET: restrict to own shifts (created_by), but workers/clients — show all (no created_by column)
  if (session.role === 'dispatcher' && req.method === 'GET') {
    const dispTablesWithCreatedBy = ['shifts', 'reviews']; // orders: table does NOT exist in DB (PGRST205)
    const dispTablesWithShiftId = ['shift_assignments', 'shift_requirements']; // filter via shift → created_by
    const dispTablesAll = ['workers', 'clients', 'recurring_orders']; // no created_by filter — show all
    if (dispTablesWithCreatedBy.includes(table)) {
      const sep = query ? '&' : '';
      const filter = `created_by=eq.${session.userId}`;
      query = query ? query + sep + filter : filter;
    } else if (dispTablesWithShiftId.includes(table)) {
      // BUG-019 fix: shift_assignments has no created_by — fetch dispatcher's shift_ids first
      try {
        const shiftsRes = await (await sbFetch('shifts', `created_by=eq.${session.userId}&select=id&limit=1000`)).json();
        const shiftIds = shiftsRes.map(s => s.id);
        if (shiftIds.length === 0) {
          // No shifts — return empty
          return json(res, [], 200, cors);
        }
        const sep = query ? '&' : '';
        const idsStr = shiftIds.join(',');
        query = query ? query + sep + `shift_id=in.(${idsStr})` : `shift_id=in.(${idsStr})`;
      } catch(e) {
        return json(res, [], 200, cors);
      }
    }
    // workers and clients: dispatcher sees all — no additional filter needed
  }

  // Worker GET: restrict to own data only — block access to workers/clients tables
  if (session.role === 'worker' && req.method === 'GET') {
    // Worker must NOT see other workers or clients
    if (table === 'workers' || table === 'clients' || table === 'users') {
      return json(res, { error: 'Нет доступа' }, 403, cors);
    }
    const workerTables = ['shift_assignments', 'shifts', 'reviews'];
    if (workerTables.includes(table)) {
      const sep = query ? '&' : '';
      const filter = `worker_id=eq.${session.userId}`;
      // For shifts table, filter via shift_assignments relationship
      if (table === 'shifts') {
        return json(res, { error: 'Используйте shift_assignments' }, 400, cors);
      }
      query = query ? query + sep + filter : filter;
    }
  }

  // Client GET: restrict to own data only — block access to workers/clients/users tables
  if (session.role === 'client' && req.method === 'GET') {
    if (table === 'workers' || table === 'users') {
      return json(res, { error: 'Нет доступа' }, 403, cors);
    }
    if (table === 'clients') {
      // Client can only see their own record
      const sep = query ? '&' : '';
      const filter = `id=eq.${session.userId}`;
      query = query ? query + sep + filter : filter;
    }
  }

  // BUG-007: Dispatcher can only PATCH own profile (force id filter)
  if (table === 'users' && req.method === 'PATCH' && session.role === 'dispatcher') {
    const sep = query ? '&' : '';
    query = query ? query + sep + `id=eq.${session.userId}` : `id=eq.${session.userId}`;
  }

  // F6: P63 — Client edits order: filter by client_id + date must be in future
  if (req.method === 'PATCH' && table === 'shifts' && session.role === 'client') {
    const sep = query ? '&' : '';
    query = query ? query + sep + `client_id=eq.${session.userId}` : `client_id=eq.${session.userId}`;
    // Note: date validation happens in the body parsing below for POST.
    // For PATCH, we validate after reading the body.
  }

  // BUG-001: Row-level security — client sees only own data
  if (session.role === 'client' && ['shifts', 'shift_assignments', 'payments'].includes(table)) {
    const cid = session.userId;
    const sep = query ? '&' : '';
    if (table === 'shifts') {
      query = query ? query + sep + `client_id=eq.${cid}` : `client_id=eq.${cid}`;
    } else if (table === 'shift_assignments' || table === 'payments') {
      // Two-step fetch: Supabase REST doesn't support subqueries (same fix as BUG-019)
      try {
        const clientShiftsRes = await (await sbFetch('shifts', `client_id=eq.${cid}&select=id&limit=1000`)).json();
        const clientShiftIds = clientShiftsRes.map(s => s.id);
        if (clientShiftIds.length === 0) {
          return json(res, [], 200, cors);
        }
        const idsStr = clientShiftIds.join(',');
        if (table === 'shift_assignments') {
          query = query ? query + sep + `shift_id=in.(${idsStr})` : `shift_id=in.(${idsStr})`;
        } else {
          // payments — need assignment IDs first
          const asgnRes = await (await sbFetch('shift_assignments', `shift_id=in.(${idsStr})&select=id&limit=5000`)).json();
          const asgnIds = asgnRes.map(a => a.id);
          if (asgnIds.length === 0) return json(res, [], 200, cors);
          const asgnStr = asgnIds.join(',');
          query = query ? query + sep + `assignment_id=in.(${asgnStr})` : `assignment_id=in.(${asgnStr})`;
        }
      } catch(e) {
        return json(res, [], 200, cors);
      }
    }
  }

  const body = await readBody(req);
  let parsedBody = body;
  try {
    if (body && req.method !== 'GET' && req.method !== 'DELETE') {
      const parsed = JSON.parse(body);

      // БАГ #3: Валидация даты смены — дата не должна быть в прошлом
      if (table === 'shifts' && req.method === 'POST' && parsed.date) {
        const shiftDate = new Date(parsed.date);
        const today = new Date(); today.setHours(0,0,0,0);
        if (isNaN(shiftDate.getTime())) {
          return json(res, { error: 'Неверный формат даты' }, 400, cors);
        }
        if (shiftDate < today) {
          return json(res, { error: 'Дата смены не может быть в прошлом' }, 400, cors);
        }
      }

      // #6: Валидация статусов смен
      const VALID_STATUSES = ['pending', 'planned', 'confirmed', 'in_progress', 'completed', 'cancelled'];
      if (table === 'shifts' && parsed.status !== undefined && !VALID_STATUSES.includes(parsed.status)) {
        return json(res, { error: 'Недопустимый статус. Допустимые: ' + VALID_STATUSES.join(', ') }, 400, cors);
      }

      // #7: Дата при PATCH смен — не должна быть в прошлом
      if (table === 'shifts' && req.method === 'PATCH' && parsed.date) {
        const shiftDate = new Date(parsed.date);
        const today = new Date(); today.setHours(0,0,0,0);
        if (isNaN(shiftDate.getTime())) {
          return json(res, { error: 'Неверный формат даты' }, 400, cors);
        }
        if (shiftDate < today) {
          return json(res, { error: 'Дата смены не может быть в прошлом' }, 400, cors);
        }
      }

      // #9: Валидация часов и ставок при создании/редактировании shift_assignments
      if (table === 'shift_assignments' && (req.method === 'POST' || req.method === 'PATCH')) {
        if (parsed.hours_worked !== undefined && parsed.hours_worked !== null) {
          const hw = parseFloat(parsed.hours_worked);
          if (isNaN(hw) || hw < 0.5 || hw > 24) {
            return json(res, { error: 'Часы работы должны быть от 0.5 до 24' }, 400, cors);
          }
        }
        if (parsed.rate_per_hour !== undefined && parsed.rate_per_hour !== null) {
          const rph = parseFloat(parsed.rate_per_hour);
          if (isNaN(rph) || rph < 1) {
            return json(res, { error: 'Ставка должна быть не менее 1' }, 400, cors);
          }
        }
        if (parsed.client_rate_per_hour !== undefined && parsed.client_rate_per_hour !== null) {
          const crph = parseFloat(parsed.client_rate_per_hour);
          if (isNaN(crph) || crph < 0) {
            return json(res, { error: 'Ставка клиента не может быть отрицательной' }, 400, cors);
          }
        }
      }

      // F6: P63 — Client cannot edit shift that's already started/completed
      if (table === 'shifts' && req.method === 'PATCH' && session.role === 'client') {
        // Fetch the shift being edited to check its date
        const idMatch = query.match(/id=eq\.([0-9a-f-]{36})/);
        if (idMatch) {
          try {
            const existing = await (await sbFetch('shifts', `id=eq.${idMatch[1]}&select=date,status&limit=1`)).json();
            if (existing.length) {
              const shiftDate = new Date(existing[0].date);
              const today = new Date(); today.setHours(0,0,0,0);
              if (shiftDate <= today) {
                return json(res, { error: 'Нельзя редактировать смену после её начала' }, 403, cors);
              }
              if (['completed', 'in_progress'].includes(existing[0].status)) {
                return json(res, { error: 'Нельзя редактировать завершённую или активную смену' }, 403, cors);
              }
            }
          } catch(e) { console.error('[F6] shift date check error:', e.message); }
        }
        // Block client from changing created_by or client_id
        delete parsed.created_by;
        delete parsed.client_id;
      }

      // BUG-006: Inject created_by from JWT for shifts
      if (req.method === 'POST' && table === 'shifts' && (session.role === 'dispatcher' || session.role === 'owner')) {
        parsed.created_by = session.userId;
      }

      // F5: P62 — Client creates order: inject client_id from JWT
      if (req.method === 'POST' && table === 'shifts' && session.role === 'client') {
        parsed.client_id = session.userId;
        // created_by stays null for client-created shifts
        if (!parsed.status) parsed.status = 'pending';
      }

      // БАГ #3: Валидация workers_needed — должно быть положительным
      if (table === 'shifts' && parsed.workers_needed !== undefined) {
        const wn = parseInt(parsed.workers_needed);
        if (isNaN(wn) || wn < 1 || wn > 100) {
          return json(res, { error: 'Количество рабочих должно быть от 1 до 100' }, 400, cors);
        }
        parsed.workers_needed = wn;
      }

      if (parsed.password && (table === 'workers' || table === 'clients' || table === 'users')) {
        if (parsed.password.length < 50) {
          parsed.password = hashPassword(parsed.password);
        }
      }

      // BUG-002: 3-hour decline limit on shift_assignments
      if (req.method === 'PATCH' && table === 'shift_assignments' && parsed.invite_status === 'declined') {
        const idMatch = query.match(/id=eq\.([0-9a-f-]{36})/);
        if (idMatch) {
          try {
            const asgnRes = await sbFetch('shift_assignments', `id=eq.${idMatch[1]}&select=shift_id&limit=1`);
            const asgnData = await asgnRes.json();
            if (asgnData.length && asgnData[0].shift_id) {
              const shiftRes = await sbFetch('shifts', `id=eq.${asgnData[0].shift_id}&select=date,start_time&limit=1`);
              const shiftData = await shiftRes.json();
              if (shiftData.length && shiftData[0].date) {
                const startStr = shiftData[0].start_time ? `${shiftData[0].date}T${shiftData[0].start_time}` : shiftData[0].date;
                const hoursUntil = (new Date(startStr) - Date.now()) / 3600000;
                if (hoursUntil < 3) {
                  return json(res, { error: 'Отказ возможен не менее чем за 3 часа до начала смены' }, 403, cors);
                }
              }
            }
          } catch(e) { console.error('[BUG-002] decline check error:', e.message); }
        }
      }

      parsedBody = JSON.stringify(parsed);
    }
  } catch(e) {}

  try {
    // BUG-004: Transform plain date=YYYY-MM-DD to gte/lte for Supabase
    const simpleDate = query.match(/(?:^|&)date=([^&]+)/);
    if (simpleDate && !simpleDate[1].startsWith('gte.') && !simpleDate[1].startsWith('lte.')) {
      const dv = simpleDate[1];
      query = query.replace(/(^|&)date=[^&]+/, '');
      const sep = query ? '&' : '';
      query += sep + `date=gte.${dv}&date=lte.${dv}`;
    }

    const opts = { method: req.method, headers: sbHeaders() };
    if (req.method === 'POST' || req.method === 'PATCH') opts.headers['Prefer'] = 'return=representation';
    if (parsedBody && req.method !== 'GET' && req.method !== 'DELETE') opts.body = parsedBody;

    // #14: Pagination support — add .range() if page/limit query params present
    let paginationHeaders = {};
    if (req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://localhost');
      const page = parseInt(urlObj.searchParams.get('page'));
      const limit = parseInt(urlObj.searchParams.get('limit'));
      if (page > 0 && limit > 0 && limit <= 200) {
        const offset = (page - 1) * limit;
        // Remove page/limit from query for Supabase
        query = query.replace(/(^|&)page=[^&]*/g, '').replace(/(^|&)limit=[^&]*/g, '').replace(/^&/, '');
        // Add Supabase range header
        const rangeStart = offset;
        const rangeEnd = offset + limit - 1;
        opts.headers['Range'] = `${rangeStart}-${rangeEnd}`;
        opts.headers['Prefer'] = 'count=exact';
      }
    }

    const sbRes = await fetch(`${config.sbUrl}/rest/v1/${table}${query ? '?' + query : ''}`, opts);
    const data = await sbRes.text();

    // #14: Extract total count for pagination
    if (req.method === 'GET') {
      const total = sbRes.headers.get('content-range');
      if (total) {
        const match = total.match(/\/(\d+)$/);
        if (match) paginationHeaders['X-Total-Count'] = match[1];
      }
    }

    // Post-processing hooks (sync + notifications)
    if (sbRes.status < 300) {
      await shiftRoutes.handlePostProcess(table, req.method, data, body, query, req);
      // Notify pending workers when someone declines a shift
      if (req.method === 'PATCH' && table === 'shift_assignments' && parsed?.invite_status === 'declined') {
        try {
          const declinedData = JSON.parse(data);
          const shiftId = Array.isArray(declinedData) ? declinedData[0]?.shift_id : declinedData?.shift_id;
          const workerId = Array.isArray(declinedData) ? declinedData[0]?.worker_id : declinedData?.worker_id;
          if (shiftId) notifyPendingWorkers(shiftId, workerId);
        } catch(e) { console.error('[declined notify] parse error:', e.message); }
      }
      const methodMap = { POST: 'data_create', PATCH: 'data_update', DELETE: 'data_delete' };
      const action = methodMap[req.method];
      if (action) audit(action, `${table} ${req.method}`, session?.userId, session?.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    }

    // Strip passwords from sensitive tables (BUG-025: all methods, not just GET)
    let responseData = data;
    const sensitiveTables = ['workers', 'clients', 'users'];
    if (sensitiveTables.includes(table)) {
      try {
        let parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          parsed = parsed.map(row => { const {password, ...rest} = row; return rest; });
        } else if (parsed && typeof parsed === 'object') {
          const {password, ...rest} = parsed; parsed = rest;
        }
        responseData = JSON.stringify(parsed);
      } catch(e) {}
    }
    // Log POST shifts for debugging
    if (req.method === 'POST' && table === 'shifts') {
      console.log('[POST shifts] body:', parsedBody, '| sbStatus:', sbRes.status, '| sbData:', data.substring(0,200));
    }
    res.writeHead(sbRes.status, { 'Content-Type': 'application/json', ...cors, ...paginationHeaders });
    res.end(responseData);
  } catch (e) {
    console.error('Proxy error:', e.message);
    json(res, { error: 'Proxy error' }, 502, cors);
  }
}

// --- Static files ---
function handleStatic(req, res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';
  // Block sensitive files
  const blocked = ['.env', '.json', '.yml', '.yaml', '.toml', '.md', 'Dockerfile', '.git'];
  const jsBlocked = ['/server.js', '/modules/', '/routes/', '/push-client.js', '/bot-knowledge.md', '/notifications-module/'];
  if (urlPath !== '/manifest.json' && blocked.some(ext => urlPath.endsWith(ext))) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (jsBlocked.some(p => urlPath.startsWith(p))) {
    res.writeHead(403); return res.end('Forbidden');
  }
  const filePath = path.join(config.appDir, urlPath);
  if (!filePath.startsWith(config.appDir)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream', ...SEC_HEADERS, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    res.end(data);
  });
}

// ===================== MAIN ROUTER =====================
const apiLimiter = {};

function checkApiRateLimit(ip) {
  const now = Date.now();
  if (!apiLimiter[ip]) apiLimiter[ip] = { count: 0, lastAttempt: 0 };
  const a = apiLimiter[ip];
  if (now - a.lastAttempt > 60000) { a.count = 0; }
  a.count++;
  a.lastAttempt = now;
  return a.count <= 300; // БАГ #6: увеличен с 120 до 300 запросов/мин
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of Object.entries(apiLimiter)) {
    if (now - a.lastAttempt > 600000) delete apiLimiter[ip];
  }
}, 600000);

function createRouter() {
  return async (req, res) => {
    const urlPath = req.url.split('?')[0];
    const cors = getCorsHeaders(req);

    if (req.method === 'OPTIONS') { res.writeHead(200, cors); return res.end(); }

    const clientIp = extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
    if (!checkApiRateLimit(clientIp) && urlPath.startsWith('/api/')) {
      return json(res, { error: 'Слишком много запросов' }, 429, cors);
    }

    // --- Public routes ---
    if (urlPath === '/health' && req.method === 'GET') return handleHealth(req, res, cors);

    // --- Stats ---
    if (urlPath === '/api/stats' && req.method === 'GET') {
      const session = requireAuth(req);
      if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
      if (session.role !== 'owner' && session.role !== 'dispatcher') return json(res, { error: 'Нет доступа' }, 403, cors);
      return handleStats(req, res, cors);
    }

    // --- Auth routes ---
    if (urlPath === '/auth/login' && req.method === 'POST') return await authRoutes.handleLogin(req, res, cors);
    if (urlPath === '/auth/register' && req.method === 'POST') return await authRoutes.handleRegister(req, res, cors);
    if (urlPath === '/auth/forgot' && req.method === 'POST') return await authRoutes.handleForgot(req, res, cors);
    if (urlPath === '/auth/me' && req.method === 'GET') return await authRoutes.handleAuthMe(req, res, cors);
    if (urlPath === '/auth/refresh' && req.method === 'POST') return await authRoutes.handleAuthRefresh(req, res, cors);
    if (urlPath === '/auth/logout' && req.method === 'POST') return await authRoutes.handleAuthLogout(req, res, cors);
    if (urlPath === '/auth/verify-2fa' && req.method === 'POST') return await authRoutes.handleVerify2FA(req, res, cors);
  if (urlPath === '/auth/tg-login' && req.method === 'POST') return await authRoutes.handleTgLogin(req, res, cors);

    // --- GAS webhook ---
    if (urlPath === '/api/gas-webhook' && req.method === 'POST') {
      const sigHeader = (req.headers['x-gas-signature'] || '');
      const body = await readBody(req);
      if (!verifyGasSignature(sigHeader, body)) return json(res, { error: 'Invalid signature' }, 403, cors);
      req._rawBody = body;
      return await paymentRoutes.handleGasWebhook(req, res, cors);
    }

    // --- Auth required routes ---
    const auth = () => { if (!requireAuth(req)) { json(res, { error: 'Требуется авторизация', code: 'AUTH_REQUIRED' }, 401, cors); return false; } return true; };

    // User/client routes
    if (urlPath === '/api/client-pay-method' && req.method === 'GET') { if (!auth()) return; return userRoutes.handleClientPayMethodGet(req, res, cors); }
    if (urlPath === '/api/client-pay-method' && req.method === 'POST') { if (!auth()) return; return userRoutes.handleClientPayMethodPost(req, res, cors); }
    if (urlPath === '/api/notifications/new-workers' && req.method === 'GET') { if (!auth()) return; return await userRoutes.handleNotificationsGet(req, res, cors); }
    if (urlPath === '/api/notifications/new-workers' && req.method === 'DELETE') { if (!auth()) return; return await userRoutes.handleNotificationsDelete(req, res, cors); }
    if (urlPath === '/api/pending-orders' && req.method === 'GET') { if (!auth()) return; return await shiftRoutes.handlePendingOrders(req, res, cors); }
    if (urlPath === '/api/claim-order' && req.method === 'POST') { if (!auth()) return; return await shiftRoutes.handleClaimOrder(req, res, cors); }

    // Reviews
    if (urlPath === '/api/reviews' && req.method === 'POST') { if (!auth()) return; return await shiftRoutes.handleSubmitReview(req, res, cors); }
    if (urlPath === '/api/client-hours-confirm' && req.method === 'POST') { if (!auth()) return; return await shiftRoutes.handleClientHoursConfirm(req, res, cors); }
    if (urlPath.match(/^\/api\/reviews\/worker\/[0-9a-f-]{36}$/) && req.method === 'GET') {
      if (!auth()) return;
      const wId = urlPath.split('/').pop();
      return await shiftRoutes.handleGetWorkerReviews(req, res, cors, wId);
    }

    // Recurring orders (both legacy /api/recurring and canonical /api/recurring_orders)
    const isRecurring = urlPath === '/api/recurring' || urlPath === '/api/recurring_orders';
    const isRecurringId = urlPath.match(/^\/api\/(?:recurring|recurring_orders)\/[0-9a-f-]{36}$/);
    if (isRecurring && req.method === 'GET') { if (!auth()) return; return await shiftRoutes.handleRecurringList(req, res, cors); }
    if (isRecurring && req.method === 'POST') { if (!auth()) return; return await shiftRoutes.handleRecurringCreate(req, res, cors); }
    if (isRecurringId && req.method === 'PATCH') {
      if (!auth()) return;
      const id = urlPath.split('/').pop();
      return await shiftRoutes.handleRecurringUpdate(req, res, cors, id);
    }
    if (isRecurringId && req.method === 'DELETE') {
      if (!auth()) return;
      const id = urlPath.split('/').pop();
      return await shiftRoutes.handleRecurringDelete(req, res, cors, id);
    }
    if (urlPath.startsWith('/api/address-suggest') && req.method === 'GET') { if (!auth()) return; return await userRoutes.handleAddressSuggest(req, res, cors); }
    if (urlPath === '/api/telegram-status' && req.method === 'GET') { if (!auth()) return; return await userRoutes.handleTelegramStatus(req, res, cors); }

    // Chat routes
    if (urlPath.startsWith('/api/chat/') && urlPath.split('/').length === 4) {
      if (!auth()) return;
      if (req.method === 'GET') return await chatRoutes.handleChatGet(req, res, cors, urlPath);
      if (req.method === 'POST') return await chatRoutes.handleChatPost(req, res, cors, urlPath);
    }

    // Tracking routes
    if (urlPath === '/api/tracking/status' && req.method === 'GET') { if (!auth()) return; return await trackingRoutes.handleTrackingStatus(req, res, cors, urlPath); }
    if (urlPath === '/api/tracking/start' && req.method === 'POST') { if (!auth()) return; return await trackingRoutes.handleTrackingStart(req, res, cors); }
    if (urlPath === '/api/tracking/stop' && req.method === 'POST') { if (!auth()) return; return await trackingRoutes.handleTrackingStop(req, res, cors); }
    if (urlPath === '/api/tracking/location' && req.method === 'POST') { if (!auth()) return; return await trackingRoutes.handleTrackingLocation(req, res, cors); }
    if (urlPath === '/api/tracking/workers-location' && req.method === 'GET') { if (!auth()) return; return await trackingRoutes.handleTrackingWorkersLocation(req, res, cors); }

    // Dashboard — alias for /api/stats
    if (urlPath === '/api/dashboard' && req.method === 'GET') {
      const session = requireAuth(req);
      if (!session) return json(res, { error: 'Требуется авторизация' }, 401, cors);
      if (session.role !== 'owner' && session.role !== 'dispatcher') return json(res, { error: 'Нет доступа' }, 403, cors);
      return handleStats(req, res, cors);
    }

    // --- Feature routes (F1-F9) ---

    // F1: Bulk hours
    if (urlPath === '/api/bulk-hours' && req.method === 'POST') { if (!auth()) return; return await featureRoutes.handleBulkHours(req, res, cors); }

    // F2: Force confirm hours
    if (urlPath === '/api/force-confirm' && req.method === 'POST') { if (!auth()) return; return await featureRoutes.handleForceConfirm(req, res, cors); }

    // F3: Reassign workers
    if (urlPath === '/api/reassign-workers' && req.method === 'POST') { if (!auth()) return; return await featureRoutes.handleReassignWorkers(req, res, cors); }

    // F4: Recurring shifts (new schema with interval_days)
    if (urlPath === '/api/recurring-shifts' && req.method === 'GET') { if (!auth()) return; return await featureRoutes.handleRecurringShiftsList(req, res, cors); }
    if (urlPath === '/api/recurring-shifts' && req.method === 'POST') { if (!auth()) return; return await featureRoutes.handleRecurringShiftsCreate(req, res, cors); }
    if (urlPath.match(/^\/api\/recurring-shifts\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
      if (!auth()) return;
      const id = urlPath.split('/').pop();
      return await featureRoutes.handleRecurringShiftsUpdate(req, res, cors, id);
    }
    if (urlPath.match(/^\/api\/recurring-shifts\/[0-9a-f-]{36}$/) && req.method === 'DELETE') {
      if (!auth()) return;
      const id = urlPath.split('/').pop();
      return await featureRoutes.handleRecurringShiftsDelete(req, res, cors, id);
    }

    // F7: Confirm payment (client)
    if (urlPath === '/api/confirm-payment' && req.method === 'POST') { if (!auth()) return; return await featureRoutes.handleConfirmPayment(req, res, cors); }

    // Geocode proxy (BUG-046: remove Dadata token from frontend)
    if (urlPath === '/api/geocode' && req.method === 'GET') {
      const q = new URL(req.url, 'http://localhost').searchParams.get('q');
      if (!q) return json(res, [], 200, cors);
      try {
        const dadataKey = process.env.DADATA_API_KEY || '';
        if (!dadataKey) return json(res, [], 200, cors);
        const r = await fetch(`https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Token ' + dadataKey },
          body: JSON.stringify({ query: q, count: 5 }),
          signal: AbortSignal.timeout(5000)
        });
        const d = await r.json();
        return json(res, (d.suggestions || []).map(s => s.value), 200, cors);
      } catch (e) { return json(res, [], 200, cors); }
    }

    // F8: iCal export
    if (urlPath.match(/^\/api\/shift\/[0-9a-f-]{36}\/ical$/) && req.method === 'GET') {
      if (!auth()) return;
      const id = urlPath.match(/\/api\/shift\/([0-9a-f-]{36})\/ical/)[1];
      return await featureRoutes.handleShiftIcal(req, res, cors, id);
    }

    // BUG-026: GET /api/shift/:id/photos — proxy to shift-photos endpoint
    if (urlPath.match(/^\/api\/shift\/[0-9a-f-]{36}\/photos$/) && req.method === 'GET') {
      if (!auth()) return;
      const shiftId = urlPath.match(/\/api\/shift\/([0-9a-f-]{36})\/photos/)[1];
      try {
        const fs2 = require('fs');
        const path2 = require('path');
        const photosDir = path2.join(config.appDir, 'data', 'shift-photos');
        const files = (await fs2.promises.readdir(photosDir).catch(() => [])).filter(f => f.startsWith(shiftId + '_'));
        return json(res, files.map(f => ({ filename: f, url: '/api/shift-photos/' + f })), 200, cors);
      } catch (e) { return json(res, [], 200, cors); }
    }

    // --- Client report endpoint ---
    // GET /api/client/report?from=YYYY-MM-DD&to=YYYY-MM-DD
    // Returns CSV with hours rounded to 10 min
    if (urlPath === '/api/client/report' && req.method === 'GET') {
      if (!auth()) return;
      const session = requireAuth(req);
      if (!session || session.role !== 'client') return json(res, { error: 'Доступ только заказчику' }, 403, cors);
      try {
        const url = new URL(req.url, 'http://x');
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        if (!from || !to) return json(res, { error: 'Укажите from и to (YYYY-MM-DD)' }, 400, cors);

        // Fetch shifts + assignments for this client in date range
        const shiftsRes = await sbFetch('shifts', `client_id=eq.${session.userId}&date=gte.${from}&date=lte.${to}&select=id,date,start_time,planned_end_time,service_types(name),comment,address`);
        const shifts = await shiftsRes.json();
        if (!Array.isArray(shifts) || !shifts.length) return json(res, { rows: [], summary: null }, 200, cors);

        const shiftIds = shifts.map(s => s.id).join(',');
        const asgnRes = await sbFetch('shift_assignments', `shift_id=in.(${shiftIds})&invite_status=eq.confirmed&select=id,shift_id,worker_id,hours_worked,actual_start_time,actual_end_time,rate_per_hour,client_rate_per_hour,extra_amount,paid_amount,client_hours_status`);
        const asgns = await asgnRes.json();
        if (!Array.isArray(asgns)) return json(res, { rows: [], summary: null }, 200, cors);

        // Get worker names
        const workerIds = [...new Set(asgns.map(a => a.worker_id))];
        const wNameMap = {};
        if (workerIds.length) {
          const wRes = await sbFetch('workers', `id=in.(${workerIds.join(',')})&select=id,full_name`);
          const wrk = await wRes.json();
          if (Array.isArray(wrk)) wrk.forEach(w => { wNameMap[w.id] = w.full_name || 'Рабочий'; });
        }

        // Build report rows with 10-min rounding
        const rows = [];
        let totalHours = 0, totalCost = 0, totalPaid = 0;
        for (const s of shifts) {
          for (const a of asgns.filter(x => x.shift_id === s.id)) {
            const rawHours = parseFloat(a.hours_worked) || 0;
            // Round to 10 minutes: Math.round(hours * 6) / 6
            const roundHours = Math.round(rawHours * 6) / 6;
            const rate = parseFloat(a.client_rate_per_hour) || 0;
            const extra = parseFloat(a.extra_amount) || 0;
            const cost = roundHours * rate + extra;
            const paid = parseFloat(a.paid_amount) || 0;
            totalHours += roundHours;
            totalCost += cost;
            totalPaid += paid;
            rows.push({
              date: s.date,
              service: s.service_types?.name || '—',
              address: s.address || '—',
              worker: wNameMap[a.worker_id] || '—',
              rawHours: rawHours.toFixed(2),
              roundHours: roundHours.toFixed(2),
              roundHoursText: (roundHours % 1 === 0 ? roundHours.toString() : roundHours.toFixed(1)).replace('.', ','),
              rate: rate,
              extra: extra,
              cost: cost,
              paid: paid,
              debt: cost - paid,
              hoursStatus: a.client_hours_status || '—',
            });
          }
        }

        json(res, {
          rows,
          summary: {
            totalHours: totalHours.toFixed(2),
            totalCost: totalCost.toFixed(2),
            totalPaid: totalPaid.toFixed(2),
            totalDebt: (totalCost - totalPaid).toFixed(2),
          }
        }, 200, cors);
      } catch (e) {
        console.error('[Report] error:', e.message);
        json(res, { error: e.message }, 500, cors);
      }
      return;
    }

    // API proxy
    if (urlPath.startsWith('/api/')) return await handleApiProxy(req, res, cors, urlPath);

    // F9: PDF export
    if (urlPath === '/export/payments.pdf') { if (!auth()) return; return await featureRoutes.handleExportPdf(req, res, cors); }

    // Payment routes
    if (urlPath === '/export/payments.csv') { if (!auth()) return; return await paymentRoutes.handleExportCsv(req, res, cors); }
    if (urlPath === '/upload-receipt' && req.method === 'POST') { if (!auth()) return; return await paymentRoutes.handleUploadReceipt(req, res, cors); }
    if (urlPath.startsWith('/receipts/')) { if (!auth()) return; return paymentRoutes.handleReceipt(req, res, cors, urlPath); }

    // Static
    return handleStatic(req, res, urlPath);
  };
}

module.exports = { createRouter, startPolling, handlePostProcess: shiftRoutes.handlePostProcess, maxNotify, maxNotifyRole, tgNotify, tgNotifyRole };
