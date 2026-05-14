/**
 * Authentication — sessions, tokens, password hashing
 */
const crypto = require('crypto');
const { config } = require('./config');

// In-memory sessions (cleared on restart)
const SESSIONS = {}; // token -> { userId, role, table, expires }

// Rate limiting: IP -> { count, lastAttempt }
const loginAttempts = {};

function createToken(userId, role, table) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS[token] = { userId, role, table, expires: Date.now() + config.sessionTtl };
  return token;
}

function verifyToken(token) {
  const s = SESSIONS[token];
  if (!s) return null;
  if (Date.now() > s.expires) { delete SESSIONS[token]; return null; }
  return s;
}

function getTokenFromReq(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers['cookie'] || '';
  const m = cookie.match(/dp_token=([^;]+)/);
  if (m) return m[1];
  return null;
}

function requireAuth(req) {
  const token = getTokenFromReq(req);
  return verifyToken(token);
}

/**
 * Password hashing — SHA-256 with salt (legacy, backward-compatible)
 * TODO: migrate to bcrypt when possible
 */
const PASSWORD_SALT = 'dp_pro_2026_salt';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + PASSWORD_SALT).digest('hex');
}

/**
 * Check password — supports plaintext (old) and SHA-256 hash
 */
function checkPassword(inputPassword, storedPassword) {
  const hashedInput = hashPassword(inputPassword);
  return storedPassword === inputPassword || storedPassword === hashedInput;
}

function isPlaintext(password) {
  return password.length < 50;
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lastAttempt: 0 };
  const a = loginAttempts[ip];
  if (now - a.lastAttempt > config.rateLimit.windowMs) { a.count = 0; }
  a.count++;
  a.lastAttempt = now;
  return a.count <= config.rateLimit.max;
}

function resetRateLimit(ip) {
  delete loginAttempts[ip];
}

// Cleanup expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of Object.entries(SESSIONS)) {
    if (now > s.expires) delete SESSIONS[t];
  }
}, 60 * 60 * 1000);

module.exports = {
  createToken, verifyToken, getTokenFromReq, requireAuth,
  hashPassword, checkPassword, isPlaintext,
  checkRateLimit, resetRateLimit, SESSIONS
};
