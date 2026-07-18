/**
 * Dispatcher.PRO — Main entry point
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const { config } = require('./modules/config');
const { createRouter, startPolling } = require('./modules/routes');
const { handlePushSubscription } = require('./notifications-module/push-route');
const { runGasSync } = require('./modules/gas-sync');
const { requireAuth } = require('./modules/auth');
const { getCorsHeaders } = require('./modules/cors');
const { sbHeaders } = require('./modules/db');
const VERSION = '1.0.0';
const { startMaxPolling } = require('./modules/max-bot');

const { recordRequest } = require('./modules/monitoring');

// Ensure receipts directory exists
if (!fs.existsSync(config.receiptsDir)) fs.mkdirSync(config.receiptsDir, { recursive: true });

// Auto-migration: add status column to payments table if missing
const sbHeadersBase = sbHeaders;
let _paymentStatusColExists = null; // null = unknown, true/false after check
async function ensurePaymentStatusCol() {
  if (_paymentStatusColExists !== null) return _paymentStatusColExists;
  try {
    const r = await fetch(`${config.sbUrl}/rest/v1/payments?select=id,status&limit=1`, { headers: sbHeadersBase() });
    _paymentStatusColExists = (r.status === 200);
    if (!_paymentStatusColExists) console.warn('[Migration] payments.status column missing. Please run SQL: ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text DEFAULT \'paid\';');
  } catch (e) { console.warn('[Migration] check failed:', e.message); _paymentStatusColExists = false; }
  return _paymentStatusColExists;
}
ensurePaymentStatusCol();

// Auto-migration system: apply SQL files from /migrations folder
const { sbFetch: sbFetchMigration } = require('./modules/db');

async function runAutoMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) { console.log('[Migrations] No migrations directory'); return; }

  // Track applied migrations via data/.migrations-applied file
  const appliedFile = path.join(__dirname, 'data', '.migrations-applied');
  let applied = new Set();
  try {
    const data = fs.readFileSync(appliedFile, 'utf8');
    applied = new Set(data.split('\n').filter(Boolean));
  } catch (_) {}

  // Get all .sql files sorted
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  let newCount = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    // Execute via Supabase RPC (POST to /rest/v1/rpc/exec_sql is not available)
    // Instead, we split by semicolons and run each statement
    const statements = sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
    let success = true;
    for (const stmt of statements) {
      try {
        // Use Supabase SQL endpoint
        await fetch(`${config.sbUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': config.sbKey,
            'Authorization': 'Bearer ' + config.sbKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sql_text: stmt + ';' })
        });
      } catch (e) {
        console.warn(`[Migrations] Statement failed in ${file}:`, e.message);
        // Don't fail on individual statement errors (might be idempotent)
      }
    }
    applied.add(file);
    newCount++;
    console.log(`[Migrations] Applied: ${file}`);
  }

  if (newCount > 0) {
    try { fs.writeFileSync(appliedFile, [...applied].join('\n') + '\n'); } catch (_) {}
    console.log(`[Migrations] ${newCount} migration(s) applied`);
  } else {
    console.log('[Migrations] All up to date');
  }
}

// Run migrations on startup (non-blocking, best-effort)
runAutoMigrations().catch(e => console.warn('[Migrations] Error:', e.message));

// Clean old receipts daily
setInterval(() => {
  const now = Date.now();
  const dir = config.receiptsDir;
  fs.promises.readdir(dir).then(files => Promise.all(
    files.map(async f => {
      try {
        const stat = await fs.promises.stat(path.join(dir, f));
        if (now - stat.mtimeMs > config.receiptTtlDays * 24 * 60 * 60 * 1000) {
          await fs.promises.unlink(path.join(dir, f));
          console.log('[Receipts] Deleted old file:', f);
        }
      } catch (_) {}
    })
  )).catch(() => {});
}, 24 * 60 * 60 * 1000);

// Ensure shift-photos directory exists
const shiftPhotosDir = path.join(__dirname, 'data', 'shift-photos');
if (!fs.existsSync(shiftPhotosDir)) fs.mkdirSync(shiftPhotosDir, { recursive: true });

const router = createRouter();
const server = http.createServer(async (req, res) => {
  const startMs = Date.now();
  const origEnd = res.end;
  res.end = function (...args) {
    recordRequest(req.url.split('?')[0], res.statusCode, Date.now() - startMs);
    return origEnd.apply(res, args);
  };
  try {
    // Shift photo upload endpoint
    const urlPath = req.url.split('?')[0];

    // Healthcheck with database connectivity test
    if (urlPath === '/health') {
      try {
        const healthRes = await sbFetch('service_types', 'select=id&limit=1');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', database: 'connected' }));
      } catch (e) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', database: 'unreachable', error: e.message }));
      }
      return;
    }
    if (urlPath === '/api/upload-shift-photo' && req.method === 'POST') {
      const authSession = requireAuth(req);
      if (!authSession) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Auth required' })); }
      const body = await new Promise((resolve, reject) => { let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); req.on('error', reject); });
      try {
        const { filename, data: b64, shift_id } = JSON.parse(body);
        if (!filename || !b64 || !shift_id) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Missing fields' })); }
        if (!/^[0-9a-f-]{36}$/.test(shift_id)) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Invalid shift_id' })); }
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > 5 * 1024 * 1024) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'File too large' })); }
        const fname = shift_id + '_' + Date.now() + '_' + String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        await fs.promises.writeFile(path.join(shiftPhotosDir, fname), buf);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, filename: fname }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Upload error' })); }
      return;
    }
    // Shift photo list endpoint
    if (urlPath === '/api/shift-photos' && req.method === 'GET') {
      const authSession = requireAuth(req);
      if (!authSession) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Auth required' })); }
      const params = new URL(req.url, 'http://localhost').searchParams;
      const shiftId = params.get('shift_id');
      if (!shiftId) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'shift_id required' })); }
      try {
        const files = (await fs.promises.readdir(shiftPhotosDir)).filter(f => f.startsWith(shiftId + '_'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files.map(f => ({ filename: f, url: '/shift-photos/' + f }))));
      } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify([])); }
      return;
    }
    // Shift photo serve endpoint
    if (urlPath.startsWith('/shift-photos/') || urlPath.includes('/shift-photos/')) {
      res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Use /api/shift-photos endpoint' }));
    }
    // Block direct access to data directory
    const normalizedPath = path.normalize(urlPath);
    if (normalizedPath.startsWith('/data/')) {
      res.writeHead(403); return res.end('Forbidden');
    }
    // Serve language files
    if (urlPath === '/lang/ru.json' || urlPath === '/lang/en.json') {
      const langFile = path.join(__dirname, 'lang', urlPath.replace('/lang/', ''));
      if (fs.existsSync(langFile)) {
        const data = fs.readFileSync(langFile, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
        res.end(data);
      } else { res.writeHead(404); res.end('Not found'); }
      return;
    }
    // Push subscription endpoint (изолированный модуль уведомлений)
    if (req.url === '/api/push-subscription') {
      const cors = getCorsHeaders(req);
      return handlePushSubscription(req, res, cors);
    }
    // Proxy: /app-worker — отдаёт worker.html с параметрами Telegram (обход кэша WebView)
    if (urlPath === '/app-worker') {
      console.log('[AppWorker] Serving worker.html with TG proxy...');
      const appDir = config.appDir || __dirname;
      const workerPath = path.join(appDir, 'worker.html');
      console.log('[AppWorker] Reading:', workerPath);
      let html = fs.readFileSync(workerPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(html);
      return;
    }
    await router(req, res);
  } catch (e) {
    console.error('Unhandled route error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Healthcheck endpoint — checks database connectivity
// Must be before server.listen; http.createServer uses a single callback
// so we handle /health inside the main request handler

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[Dispatcher.PRO] v${VERSION} started on :${config.port} | ${new Date().toISOString()}`);
});

// Global error handlers
process.on('uncaughtException', (err) => { console.error('UNCAUGHT:', err.message); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('UNHANDLED:', err); process.exit(1); });

// Start Telegram polling
startPolling();

// Start МАКС polling
startMaxPolling();

// Start GAS periodic sync (every 5 minutes)
const sbFetchForSync = require('./modules/db').sbFetch;
const { autoConfirmHours } = require('./routes/shift-routes');

setInterval(() => runGasSync(sbFetchForSync), 5 * 60 * 1000);
// Run once on startup after 30 seconds
setTimeout(() => runGasSync(sbFetchForSync), 30000);
console.log('[GAS-Sync] Periodic sync enabled (every 5 min)');

// Auto-confirm client hours after 24h
setInterval(autoConfirmHours, 30 * 60 * 1000);
setTimeout(autoConfirmHours, 60000); // first run after 1 min
console.log('[AutoConfirm] Client hours auto-confirm enabled (every 30 min)');

// ===== Recurring orders: auto-create shifts by interval_days =====
// Polls every 5 minutes, creates shifts when interval_days elapsed since last shift
const sbFetch = require('./modules/db').sbFetch;

async function processRecurringOrders() {
  try {
    const res = await sbFetch('recurring_orders', 'is_active=eq.true&select=*');
    const orders = await res.json();
    if (!Array.isArray(orders) || !orders.length) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // #15: Batch fetch — collect all client_ids, do ONE query for last shifts
    const validOrders = orders.filter(o => o.client_id);
    if (!validOrders.length) return;

    const clientIds = [...new Set(validOrders.map(o => o.client_id))];
    const clientIdsStr = clientIds.join(',');

    // Single batch query: get latest shift per client_id
    const lastShiftsRes = await sbFetch('shifts', `client_id=in.(${clientIdsStr})&select=client_id,created_at,date&order=created_at.desc&limit=1000`);
    const allShifts = await lastShiftsRes.json();

    // Build map: client_id -> latest shift
    const lastShiftMap = new Map();
    if (Array.isArray(allShifts)) {
      for (const s of allShifts) {
        if (!lastShiftMap.has(s.client_id)) {
          lastShiftMap.set(s.client_id, s); // first one is latest (ordered desc)
        }
      }
    }

    // Batch check for today's duplicates
    const dupCheckRes = await sbFetch('shifts', `client_id=in.(${clientIdsStr})&date=eq.${todayStr}&notes=like.*recurring:*&select=id,client_id,notes&limit=1000`);
    const dupData = await dupCheckRes.json();
    const dupClientOrderPairs = new Set();
    if (Array.isArray(dupData)) {
      for (const d of dupData) {
        // Extract recurring order ID from notes
        const m = (d.notes || '').match(/recurring:(\d+)/);
        if (m) dupClientOrderPairs.add(`${d.client_id}:${m[1]}`);
      }
    }

    for (const order of validOrders) {
      const lastShift = lastShiftMap.get(order.client_id);

      let shouldCreate = false;
      if (!lastShift) {
        shouldCreate = true;
      } else {
        const daysSince = (now - new Date(lastShift.created_at)) / 86400000;
        if (daysSince >= (order.interval_days || 7)) {
          shouldCreate = true;
        }
      }

      if (!shouldCreate) continue;

      // Check duplicate using pre-fetched data
      if (dupClientOrderPairs.has(`${order.client_id}:${order.id}`)) continue;

      const shiftData = {
        client_id: order.client_id,
        date: todayStr,
        start_time: order.start_time || '10:00',
        service_type_id: order.service_type_id || null,
        worker_count: order.worker_count || 1,
        address: order.address || '',
        created_by: order.created_by || null,
        status: 'pending',
        notes: `recurring:${order.id}`
      };

      await sbFetch('shifts', '', {
        method: 'POST',
        body: JSON.stringify(shiftData)
      });
      console.log(`[Recurring] Created shift for order ${order.id} (client ${order.client_id}) on ${todayStr}`);
    }
  } catch (e) {
    console.error('[Recurring] Error:', e.message);
  }
}

// Poll every 5 minutes
setInterval(processRecurringOrders, 5 * 60 * 1000);
// First run 30s after startup
setTimeout(processRecurringOrders, 30000);
console.log('[Recurring] interval_days polling enabled (every 5 min)');
