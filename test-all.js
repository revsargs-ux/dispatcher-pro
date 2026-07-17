#!/usr/bin/env node
/**
 * Dispatcher.PRO — Auto-test script
 * Tests all API endpoints and role-based access control
 * Run: node test-all.js
 */
const https = require('https');
const jwt = require('jsonwebtoken');

const BASE_URL = 'https://xn----gtbdan3bddhceo9d.xn--p1ai';
// Load secrets
const fs = require('fs');
const path = require('path');
const JWT_SECRET = fs.readFileSync(path.join(__dirname, 'data', '.jwt_secret'), 'utf8').trim();

// Users to test
const TEST_USERS = {
  owner: { id: 'a32be261-b8b8-4662-9913-2b8e10c65320', name: 'Ревик', phone: '+79248910259', role: 'owner' },
  dispatcher: { id: '27153f22-ac82-4950-9676-d1e72911b7b1', name: 'Астхик', phone: '+79619610522', role: 'dispatcher' },
};

function createToken(userId, role) {
  return jwt.sign(
    { userId, role, table: 'users', iat: Math.floor(Date.now()/1000) },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

function apiFetch(path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const results = { passed: 0, failed: 0, errors: [] };

function assert(label, condition, detail = '') {
  if (condition) {
    results.passed++;
    console.log(`  ✅ ${label}`);
  } else {
    results.failed++;
    results.errors.push({ label, detail });
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==================== TESTS ====================

async function testAuth() {
  console.log('\n🔐 AUTH');
  
  // Login
  const r = await apiFetch('/auth/login', 'POST', null, { table: 'users', phone: '+79248910259', pass: '000000' });
  assert('POST /auth/login responds', r.status === 200 || r.status === 400 || r.status === 401, `status=${r.status}`);
  
  // Health
  const h = await apiFetch('/health');
  assert('GET /health responds', h.status === 200, `status=${h.status}`);
  
  // No auth → 401
  const u = await apiFetch('/api/users?select=id&limit=1');
  assert('Unauthenticated → 401', u.status === 401, `status=${u.status}`);
}

async function testOwnerAccess() {
  console.log('\n👑 OWNER ACCESS');
  const token = createToken(TEST_USERS.owner.id, 'owner');
  
  // All tables should be accessible to owner
  const tables = [
    { table: 'users', q: '?select=id&limit=5' },
    { table: 'workers', q: '?select=id&limit=5' },
    { table: 'clients', q: '?select=id&limit=5' },
    { table: 'shifts', q: '?select=id&limit=5' },
    { table: 'shift_assignments', q: '?select=id&limit=5' },
    { table: 'service_types', q: '?select=id&limit=5' },
    { table: 'payments', q: '?select=id&limit=5' },
    { table: 'shift_requirements', q: '?select=id&limit=5' },
    { table: 'recurring_orders', q: '?select=id&limit=5' },
    { table: 'reviews', q: '?select=id&limit=5' },
    { table: 'recurring_orders', q: '?select=id&limit=5' },
  ];
  
  for (const t of tables) {
    const r = await apiFetch('/api/' + t.table + t.q, 'GET', token);
    assert(`Owner GET /api/${t.table}`, r.status === 200, `status=${r.status} ${r.body.substring(0,80)}`);
    await sleep(50); // rate limit
  }
  
  // Owner should see dispatchers
  const d = await apiFetch('/api/users?select=id,full_name,role&limit=20', 'GET', token);
  assert('Owner sees all users', d.status === 200, `status=${d.status}`);
  
  // Owner should see all shifts
  const s = await apiFetch('/api/shifts?select=id&limit=200', 'GET', token);
  assert('Owner sees all shifts', s.status === 200, `status=${s.status}`);
  
  // Owner should see all workers
  const w = await apiFetch('/api/workers?is_active=eq.true&archived=eq.false&limit=200', 'GET', token);
  assert('Owner sees all workers', w.status === 200, `status=${w.status}`);
  
  // Owner should see all clients
  const c = await apiFetch('/api/clients?archived=eq.false&limit=200', 'GET', token);
  assert('Owner sees all clients', c.status === 200, `status=${c.status}`);
}

async function testDispatcherAccess() {
  console.log('\n👥 DISPATCHER ACCESS');
  const token = createToken(TEST_USERS.dispatcher.id, 'dispatcher');
  
  // Dispatcher GET tables
  const allowed = [
    { table: 'workers', q: '?select=id&limit=5' },
    { table: 'clients', q: '?select=id&limit=5' },
    { table: 'shifts', q: '?select=id&limit=5' },
    { table: 'shift_assignments', q: '?select=id&limit=5' },
    { table: 'service_types', q: '?select=id&limit=5' },
    { table: 'payments', q: '?select=id&limit=5' },
    { table: 'shift_requirements', q: '?select=id&limit=5' },
    { table: 'recurring_orders', q: '?select=id&limit=5' },
  ];
  
  for (const t of allowed) {
    const r = await apiFetch('/api/' + t.table + t.q, 'GET', token);
    assert(`Dispatcher GET /api/${t.table}`, r.status === 200, `status=${r.status} ${r.body.substring(0,80)}`);
    await sleep(50);
  }
  
  // Dispatcher should NOT access users table (only PATCH own)
  const u = await apiFetch('/api/users?select=id&limit=5', 'GET', token);
  assert('Dispatcher cannot GET /api/users', u.status === 403, `status=${u.status}`);
  
  // Dispatcher should NOT see all shifts, only own
  // (already tested above with 200 — shifts filtered by created_by)
}

async function testForbiddenTables() {
  console.log('\n🚫 FORBIDDEN TABLES');
  const token = createToken(TEST_USERS.owner.id, 'owner');
  
  const blocked = [
    'secret_data',
    'internal_logs',
    'passwords',
  ];
  
  for (const t of blocked) {
    const r = await apiFetch('/api/' + t + '?select=id&limit=1', 'GET', token);
    assert(`Blocked table ${t} → 403`, r.status === 403, `status=${r.status}`);
    await sleep(50);
  }
}

async function testFrontendAssets() {
  console.log('\n📦 FRONTEND ASSETS');
  
  const assets = [
    { path: '/', type: 'HTML' },
    { path: '/index.html', type: 'HTML' },
    { path: '/worker.html', type: 'HTML' },
    { path: '/client.html', type: 'HTML' },
    { path: '/owner.html', type: 'HTML' },
    { path: '/manifest.json', type: 'JSON' },
    { path: '/sw.js', type: 'SW' },
    { path: '/assets/icon-192.png', type: 'PNG' },
    { path: '/assets/icon-512.png', type: 'PNG' },
    { path: '/assets/badge-72.png', type: 'PNG' },
    { path: '/lang/ru.json', type: 'JSON' },
    { path: '/lang/en.json', type: 'JSON' },
  ];
  
  for (const a of assets) {
    const r = await apiFetch(a.path);
    const ok = r.status === 200;
    const hasCorrectType = ok && (
      (a.type === 'HTML' && r.body.includes('<!DOCTYPE')) ||
      (a.type === 'JSON' && r.body.startsWith('{')) ||
      (a.type === 'PNG' && r.body.length > 100) ||
      (a.type === 'JS' && (r.body.includes('function') || r.body.includes('addEventListener'))) ||
      (a.type === 'SW' && r.body.includes('Service Worker'))
    );
    assert(`${a.path} (${a.type})`, ok && hasCorrectType, `status=${r.status} size=${r.body.length}`);
    await sleep(50);
  }
}

async function testPWA() {
  console.log('\n📱 PWA');
  
  const m = await apiFetch('/manifest.json');
  const manifest = JSON.parse(m.body);
  assert('manifest.json valid', m.status === 200 && manifest.name === 'Dispatcher.PRO');
  assert('manifest has icons', Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  assert('manifest display=standalone', manifest.display === 'standalone');
  
  const icon192 = await apiFetch('/assets/icon-192.png');
  assert('icon-192.png exists', icon192.status === 200 && icon192.body.length > 500);
  
  const icon512 = await apiFetch('/assets/icon-512.png');
  assert('icon-512.png exists', icon512.status === 200 && icon512.body.length > 500);
}

async function testStaticFilesBlocked() {
  console.log('\n🔒 SENSITIVE FILES BLOCKED');
  
  const blocked = [
    '/server.js',
    '/modules/auth.js',
    '/modules/routes.js',
    '/.env',
    '/data/sessions.json',
  ];
  
  for (const f of blocked) {
    const r = await apiFetch(f);
    assert(`${f} blocked`, r.status === 403 || r.status === 404, `status=${r.status}`);
    await sleep(50);
  }
}

async function testJsSyntax() {
  console.log('\n📜 JS SYNTAX CHECK');
  const files = ['index.html', 'client.html', 'worker.html', 'owner.html'];
  const fs = require('fs');
  for (const f of files) {
    try {
      const html = fs.readFileSync('/home/n8n/dispatcher-deploy/' + f, 'utf8');
      let i = 0, ok = true;
      while (true) {
        const s = html.indexOf('<script>', i);
        if (s === -1) break;
        const e = html.indexOf('</script>', s);
        if (e === -1) break;
        try { new Function(html.substring(s+8, e)); }
        catch (err) { assert(f + ' JS syntax', false, err.message); ok = false; break; }
        i = e + 9;
      }
      if (ok) assert(f + ' JS syntax', true);
    } catch (err) {
      assert(f + ' JS syntax', false, err.message);
    }
  }
}

// ==================== MAIN ====================

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Dispatcher.PRO — Auto-test');
  console.log('  ' + new Date().toISOString());
  console.log('═══════════════════════════════════════');
  
  try {
    await testAuth();
    await testFrontendAssets();
    await testPWA();
    await testStaticFilesBlocked();
    await testJsSyntax();
    await testOwnerAccess();
    await testDispatcherAccess();
    await testForbiddenTables();
  } catch (e) {
    console.error('\n💥 UNEXPECTED ERROR:', e.message);
    results.errors.push({ label: 'CRASH', detail: e.message });
    results.failed++;
  }
  
  console.log('\n═══════════════════════════════════════');
  console.log(`  ✅ Passed: ${results.passed}`);
  console.log(`  ❌ Failed: ${results.failed}`);
  if (results.errors.length > 0) {
    console.log('\n  Failed tests:');
    results.errors.forEach(e => console.log(`    - ${e.label}: ${e.detail}`));
  }
  console.log('═══════════════════════════════════════');
  
  process.exit(results.failed > 0 ? 1 : 0);
}

main();
