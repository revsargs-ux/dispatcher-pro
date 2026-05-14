/**
 * Authentication — JWT tokens (stateless), password hashing
 */
const crypto = require('crypto');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch(e) { bcrypt = null; }
const jwt = require('jsonwebtoken');
const { config } = require('./config');

// JWT secret — persistent, random, survives restarts
const fs = require('fs');
const path = require('path');
const SECRET_FILE = path.join(config.appDir, 'data', '.jwt_secret');
let JWT_SECRET;
try {
  JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
} catch(e) {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  try { fs.writeFileSync(SECRET_FILE, JWT_SECRET); } catch(e2) {}
}

function createToken(userId, role, table) {
  return jwt.sign(
    { userId, role, table, iat: Math.floor(Date.now()/1000) },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch(e) {
    return null;
  }
}

function getTokenFromReq(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers['cookie'] || '';
  const m = cookie.match(/dp_token=([^;]+)/);
  if (m) return m[1];
  return null;
}

/**
 * Password hashing
 */
const LEGACY_SALT = 'dp_pro_2026_salt';

function hashPassword(password) {
  if (bcrypt) return bcrypt.hashSync(password, 10);
  return crypto.createHash('sha256').update(password + LEGACY_SALT).digest('hex');
}

function legacyHash(password) {
  return crypto.createHash('sha256').update(password + LEGACY_SALT).digest('hex');
}

function checkPassword(inputPassword, storedPassword) {
  if (bcrypt && storedPassword.startsWith('$2')) {
    return bcrypt.compareSync(inputPassword, storedPassword);
  }
  const shaHash = legacyHash(inputPassword);
  if (storedPassword === shaHash) return true;
  if (storedPassword === inputPassword) return true;
  return false;
}

function needsUpgrade(storedPassword) {
  return bcrypt ? !storedPassword.startsWith('$2') : false;
}

function isPlaintext(password) {
  return password.length < 50 && !password.startsWith('$2');
}

// Rate limiting
const loginAttempts = {};
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

setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of Object.entries(loginAttempts)) {
    if (now - a.lastAttempt > 600000) delete loginAttempts[ip];
  }
}, 600000);

module.exports = {
  createToken, requireAuth, getTokenFromReq,
  hashPassword, checkPassword, isPlaintext, needsUpgrade,
  checkRateLimit, resetRateLimit
};
