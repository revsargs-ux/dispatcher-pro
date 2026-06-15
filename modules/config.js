/**
 * Configuration — all secrets from environment variables
 */
const path = require('path');
const fs = require('fs');

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  
  // Supabase
  sbUrl: process.env.SB_URL || '',
  sbKey: process.env.SB_KEY || '',
  get sbKeySet() { return !!this.sbKey && this.sbKey.length > 10; },
  
  // Telegram
  tgBotToken: process.env.TG_BOT_TOKEN || '',
  get tgBotTokenSet() { return !!this.tgBotToken && this.tgBotToken.length > 10; },
  get tgApi() { return 'https://api.telegram.org/bot' + this.tgBotToken; },
  maxBotToken: process.env.MAX_BOT_TOKEN || '',
  get maxApi() { return 'https://platform-api.max.ru'; },
  
  // Google Sheets
  gasUrl: process.env.GAS_URL || '',
  gasWebhookSecret: process.env.GAS_WEBHOOK_SECRET || '',
  
  // Gemini / ZAI
  geminiKey: process.env.GEMINI_API_KEY || '',

  // CORS
  allowedOrigins: [
    'https://xn----gtbdan3bddhceo9d.xn--p1ai',
    'https://bot.plus-rabochie.ru',
// localhost removed — production only
  ],
  
  // Paths
  appDir: path.resolve(__dirname + '/..'),
  get receiptsDir() { return path.join(this.appDir, 'receipts'); },
  
  // Auth
  sessionTtl: 7 * 24 * 60 * 60 * 1000, // 7 days (JWT)
  rateLimit: { max: 5, windowMs: 300000 }, // 5 attempts / 5 min
  
  // Upload
  maxFileSize: 5 * 1024 * 1024, // 5MB
  
  // Receipts cleanup
  receiptTtlDays: 30,
  
  // Telegram polling
  pollMaxRetries: 10,
  pollTimeout: 40000,
};

// Load JSON data files
function loadJson(filename) {
  const fp = path.join(config.appDir, 'data', filename);
  try { return JSON.parse(fs.readFileSync(fp, 'utf8') || '[]'); } catch(e) { return filename.endsWith('.json') ? [] : {}; }
}

function saveJson(filename, data) {
  const fp = path.join(config.appDir, 'data', filename);
  try { fs.writeFileSync(fp, JSON.stringify(data)); } catch(e) { console.error('[Config] Cannot save', filename, e.message); }
}

// Startup validation
if (!config.sbUrl || !config.sbUrl.startsWith('http')) {
  console.error('[FATAL] SB_URL is required and must be a valid URL');
  process.exit(1);
}
if (!config.sbKey || config.sbKey.length < 10) {
  console.error('[FATAL] SB_KEY is required (min 10 chars)');
  process.exit(1);
}

module.exports = { config, loadJson, saveJson };
