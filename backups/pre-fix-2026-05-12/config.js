/**
 * Configuration — all secrets from environment variables
 */
const path = require('path');
const fs = require('fs');

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  
  // Supabase
  sbUrl: process.env.SB_URL || 'https://bzozrjgfnpdhlymfuobd.supabase.co',
  sbKey: process.env.SB_KEY || '',
  
  // Telegram
  tgBotToken: process.env.TG_BOT_TOKEN || '',
  get tgApi() { return 'https://api.telegram.org/bot' + this.tgBotToken; },
  
  // Google Sheets
  gasUrl: process.env.GAS_URL || '',
  
  // CORS
  allowedOrigins: [
    'https://xn----gtbdan3bddhceo9d.xn--p1ai',
    'http://37.60.244.219:8080',
    'http://93.189.230.107:8080',
    'http://localhost:8080',
    'http://localhost:3000'
  ],
  
  // Paths
  appDir: path.resolve(__dirname + '/..'),
  get receiptsDir() { return path.join(this.appDir, 'receipts'); },
  
  // Auth
  sessionTtl: 24 * 60 * 60 * 1000, // 24 hours
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
  const fp = path.join(config.appDir, filename);
  return JSON.parse(fs.readFileSync(fp, 'utf8') || (filename.endsWith('.json') && !filename.includes('notifications') ? '{}' : '[]'));
}

function saveJson(filename, data) {
  const fp = path.join(config.appDir, filename);
  fs.writeFileSync(fp, JSON.stringify(data));
}

module.exports = { config, loadJson, saveJson };
