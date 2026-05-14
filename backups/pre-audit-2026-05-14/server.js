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
const VERSION = '1.0.0';
const { startMaxPolling } = require('./modules/max-bot');

const { recordRequest } = require('./modules/monitoring');

// Ensure receipts directory exists
if (!fs.existsSync(config.receiptsDir)) fs.mkdirSync(config.receiptsDir, { recursive: true });

// Auto-migration: add status column to payments table if missing
const sbHeadersBase = () => ({ 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' });
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

// Clean old receipts daily
setInterval(() => {
  try {
    const now = Date.now();
    fs.readdirSync(config.receiptsDir).forEach(f => {
      const stat = fs.statSync(path.join(config.receiptsDir, f));
      if (now - stat.mtimeMs > config.receiptTtlDays * 24 * 60 * 60 * 1000) {
        fs.unlinkSync(path.join(config.receiptsDir, f));
        console.log('[Receipts] Deleted old file:', f);
      }
    });
  } catch (e) { console.error('[Receipts] Cleanup error:', e.message); }
}, 24 * 60 * 60 * 1000);

const router = createRouter();
const server = http.createServer(async (req, res) => {
  const startMs = Date.now();
  const origEnd = res.end;
  res.end = function (...args) {
    recordRequest(req.url.split('?')[0], res.statusCode, Date.now() - startMs);
    return origEnd.apply(res, args);
  };
  try {
    // Push subscription endpoint (изолированный модуль уведомлений)
    if (req.url === '/api/push-subscription') {
      return handlePushSubscription(req, res);
    }
    await router(req, res);
  } catch (e) {
    console.error('Unhandled route error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[Dispatcher.PRO] v${VERSION} started on :${config.port} | ${new Date().toISOString()}`);
});

// Global error handlers
process.on('uncaughtException', (err) => { console.error('Uncaught:', err.message); });
process.on('unhandledRejection', (err) => { console.error('Unhandled:', err); });

// Start Telegram polling
startPolling();

// Start МАКС polling
startMaxPolling();

// Start GAS periodic sync (every 5 minutes)
const sbHeaders = () => ({ 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' });
const sbFetchForSync = async (table, query, opts = {}) => {
  const headers = sbHeaders();
  if (opts.method === 'PATCH') headers['Prefer'] = 'return=representation';
  const url = `${config.sbUrl}/rest/v1/${table}${query ? '?' + query : ''}`;
  const fetchOpts = { method: opts.method || 'GET', headers };
  if (opts.body) fetchOpts.body = opts.body;
  return fetch(url, fetchOpts);
};

setInterval(() => runGasSync(sbFetchForSync), 5 * 60 * 1000);
// Run once on startup after 30 seconds
setTimeout(() => runGasSync(sbFetchForSync), 30000);
console.log('[GAS-Sync] Periodic sync enabled (every 5 min)');
