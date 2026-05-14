/**
 * Dispatcher.PRO — Main entry point
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const { config } = require('./modules/config');
const { createRouter, startPolling } = require('./modules/routes');

// Ensure receipts directory exists
if (!fs.existsSync(config.receiptsDir)) fs.mkdirSync(config.receiptsDir, { recursive: true });

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
  try {
    await router(req, res);
  } catch (e) {
    console.error('Unhandled route error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Dispatcher.PRO proxy on :${config.port}`);
});

// Global error handlers
process.on('uncaughtException', (err) => { console.error('Uncaught:', err.message); });
process.on('unhandledRejection', (err) => { console.error('Unhandled:', err); });

// Start Telegram polling
startPolling();
