/**
 * Dispatcher.PRO — API Integration Tests
 * Runs inside container: docker exec n8n-dispatcher-1 node tests/test-api.js
 * Uses real Supabase — creates test data, verifies, cleans up.
 */

const BASE = 'http://localhost:8080';
const TEST_PHONE = '+79990000099';
const TEST_PHONE_CLEAN = '79990000099';
const TEST_PASS = 'Test1234!';
const TEST_NAME = 'Test Dispatcher API';

let passed = 0;
let failed = 0;
const results = [];

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

async function request(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }
  return { status: res.status, data, headers: res.headers };
}

function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    results.push({ label, ok: true });
    log('✅', `PASS: ${label}`);
  } else {
    failed++;
    results.push({ label, ok: false, detail });
    log('❌', `FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function cleanup() {
  // Delete test user from all possible tables via Supabase REST (using service key from config)
  try {
    const { config } = require('../modules/config');
    const sbHeaders = {
      'apikey': config.sbKey,
      'Authorization': 'Bearer ' + config.sbKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    for (const table of ['users', 'workers', 'clients']) {
      const phoneCol = table === 'clients' ? 'contact' : 'phone';
      const res = await fetch(
        `${config.sbUrl}/rest/v1/${table}?${phoneCol}=ilike.%25${TEST_PHONE_CLEAN}%25`,
        { method: 'DELETE', headers: sbHeaders }
      );
      // status 200 or 204 = ok
    }
    log('🧹', 'Cleanup done');
  } catch (e) {
    log('⚠️', `Cleanup error: ${e.message}`);
  }
}

async function main() {
  console.log('\n🧪 Dispatcher.PRO API Tests\n');
  console.log('='.repeat(50));

  // Pre-cleanup in case of previous crash
  await cleanup();
  console.log();

  // ──────────────────────────────────────────────
  // a. POST /auth/register — register test dispatcher
  // ──────────────────────────────────────────────
  log('📝', 'Test 1: POST /auth/register — register test dispatcher');
  {
    const res = await request('POST', '/auth/register', {
      table: 'users',
      data: {
        full_name: TEST_NAME,
        phone: TEST_PHONE,
        password: TEST_PASS,
        role: 'dispatcher',
        is_active: true,
      },
    });
    assert(
      res.status === 200 || res.status === 201,
      'Register returns 200/201',
      `got ${res.status}`
    );
    const created = Array.isArray(res.data) ? res.data[0] : res.data;
    assert(created && created.id, 'Registered user has id', JSON.stringify(res.data).slice(0, 120));
  }
  console.log();

  // ──────────────────────────────────────────────
  // f. POST /auth/register duplicate phone — verify 409
  // ──────────────────────────────────────────────
  log('📝', 'Test 2: POST /auth/register duplicate phone → 409');
  {
    const res = await request('POST', '/auth/register', {
      table: 'users',
      data: {
        full_name: TEST_NAME,
        phone: TEST_PHONE,
        password: TEST_PASS,
        role: 'dispatcher',
        is_active: true,
      },
    });
    assert(res.status === 409, 'Duplicate phone returns 409', `got ${res.status}`);
    assert(
      (res.data.error || '').includes('уже зарегистрирован'),
      'Error message mentions duplicate',
      JSON.stringify(res.data)
    );
  }
  console.log();

  // ──────────────────────────────────────────────
  // b. POST /auth/login — login with test credentials
  // ──────────────────────────────────────────────
  log('📝', 'Test 3: POST /auth/login — correct credentials');
  let token = null;
  {
    const res = await request('POST', '/auth/login', {
      table: 'users',
      phone: TEST_PHONE,
      pass: TEST_PASS,
    });
    assert(res.status === 200, 'Login returns 200', `got ${res.status}`);
    assert(res.data.ok === true, 'Response has ok:true');
    assert(!!res.data.token, 'Token is returned', JSON.stringify(res.data).slice(0, 80));
    token = res.data.token;
  }
  console.log();

  // ──────────────────────────────────────────────
  // c. GET /auth/me — verify auth returns user data
  // ──────────────────────────────────────────────
  log('📝', 'Test 4: GET /auth/me — with valid token');
  {
    const res = await request('GET', '/auth/me', null, {
      Authorization: `Bearer ${token}`,
    });
    assert(res.status === 200, '/auth/me returns 200', `got ${res.status}`);
    assert(res.data.ok === true, 'Response has ok:true');
    assert(
      res.data.user && res.data.user.full_name === TEST_NAME,
      'User data matches registered name',
      JSON.stringify(res.data.user || {}).slice(0, 100)
    );
  }
  console.log();

  // ──────────────────────────────────────────────
  // d. POST /auth/login with wrong password — verify 200 but error
  // ──────────────────────────────────────────────
  log('📝', 'Test 5: POST /auth/login — wrong password');
  {
    const res = await request('POST', '/auth/login', {
      table: 'users',
      phone: TEST_PHONE,
      pass: 'WrongPass999!',
    });
    // Login returns 200 with ok:false + error, not 401
    assert(res.status === 200, 'Wrong password returns 200', `got ${res.status}`);
    assert(res.data.ok === false, 'ok is false');
    assert(
      (res.data.error || '').includes('Неверный пароль'),
      'Error says wrong password',
      res.data.error
    );
  }
  console.log();

  // ──────────────────────────────────────────────
  // e. POST /auth/login with nonexistent phone
  // ──────────────────────────────────────────────
  log('📝', 'Test 6: POST /auth/login — nonexistent phone');
  {
    const res = await request('POST', '/auth/login', {
      table: 'users',
      phone: '+79990000999',
      pass: 'whatever',
    });
    assert(res.status === 200, 'Nonexistent phone returns 200', `got ${res.status}`);
    assert(res.data.ok === false, 'ok is false');
    assert(
      (res.data.error || '').includes('Пользователь не найден'),
      'Error says user not found',
      res.data.error
    );
  }
  console.log();

  // ──────────────────────────────────────────────
  // g. GET /health — verify 200
  // ──────────────────────────────────────────────
  log('📝', 'Test 7: GET /health');
  {
    const res = await request('GET', '/health');
    assert(res.status === 200, '/health returns 200', `got ${res.status}`);
    assert(res.data.status === 'ok', 'status is ok', JSON.stringify(res.data));
  }
  console.log();

  // ──────────────────────────────────────────────
  // h. POST /api/workers without auth — verify 401
  // ──────────────────────────────────────────────
  log('📝', 'Test 8: POST /api/workers without auth → 401');
  {
    const res = await request('POST', '/api/workers', {
      full_name: 'No Auth Worker',
      phone: '+79990000001',
    });
    assert(res.status === 401, 'No auth returns 401', `got ${res.status}`);
  }
  console.log();

  // ──────────────────────────────────────────────
  // i. GET /export/payments.csv without auth — verify 401
  // ──────────────────────────────────────────────
  log('📝', 'Test 9: GET /export/payments.csv without auth → 401');
  {
    const res = await request('GET', '/export/payments.csv');
    assert(res.status === 401, 'No auth returns 401', `got ${res.status}`);
  }
  console.log();

  // ──────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────
  console.log('='.repeat(50));
  await cleanup();

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🎉 All tests passed!\n');
  } else {
    console.log('⚠️  Some tests failed. Details above.\n');
    for (const r of results) {
      if (!r.ok) console.log(`  ❌ ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    }
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(2);
});
