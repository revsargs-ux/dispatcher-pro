const config = require('../config');
const http = require('http');
const https = require('https');

/**
 * Make an HTTP request to the API
 */
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.baseUrl + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(config.timeouts.apiResponse, () => {
      req.destroy();
      reject(new Error('API timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Login via API
 */
async function login(table, phone, pass, role) {
  const body = { table, phone, pass };
  if (role) body.role = role;
  return request('POST', '/auth/login', body);
}

/**
 * Register via API
 */
async function register(table, data) {
  return request('POST', '/auth/register', { table, data });
}

/**
 * Get current user via API
 */
async function getMe(token) {
  return request('GET', '/auth/me', null, { Authorization: `Bearer ${token}` });
}

/**
 * Check if test accounts exist, create them if not
 */
async function ensureTestAccounts() {
  const results = { created: [], existing: [] };

  // Try logging in as each test account
  for (const [role, account] of Object.entries(config.accounts)) {
    try {
      const res = await login(account.table, account.phone, account.pass, account.role);
      if (res.data && res.data.ok) {
        results.existing.push(role);
        continue;
      }
    } catch (e) {}

    // Account doesn't exist — try to create it
    try {
      if (role === 'worker') {
        const res = await register('workers', {
          full_name: account.name,
          phone: account.phone,
          password: account.pass,
          is_active: true,
          archived: false
        });
        if (res.status < 400) results.created.push(role);
      } else if (role === 'client') {
        const res = await register('clients', {
          name: account.name,
          contact: account.phone,
          default_client_rate: 520,
          default_worker_rate: 400,
          archived: false,
          password: account.pass,
          city: 'Москва'
        });
        if (res.status < 400) results.created.push(role);
      } else if (role === 'dispatcher') {
        const res = await register('users', {
          full_name: account.name,
          phone: account.phone,
          password: account.pass,
          role: 'dispatcher',
          rate_per_hour: 7.5,
          monthly_target_hours: 8000,
          is_active: true
        });
        if (res.status < 400) results.created.push(role);
      } else {
        // Owner should already exist
        results.existing.push(role);
      }
    } catch (e) {
      // May already exist (duplicate phone)
      results.existing.push(role);
    }
  }

  return results;
}

module.exports = {
  request,
  login,
  register,
  getMe,
  ensureTestAccounts
};
