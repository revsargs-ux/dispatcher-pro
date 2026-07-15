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
  try { fs.writeFileSync(SECRET_FILE, JWT_SECRET); } catch(e2) { console.error('[Auth] Cannot write JWT secret file:', e2.message); throw new Error('Cannot write JWT secret file — aborting'); }
}

function createToken(userId, role, table) {
  return jwt.sign(
    { userId, role, table, iat: Math.floor(Date.now()/1000) },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// --- Token blacklist (in-memory, persisted to data/sessions.json) ---
const BLACKLIST_FILE = path.join(config.appDir, 'data', 'sessions.json')
const tokenBlacklist = new Map() // token -> expiry timestamp

function loadBlacklist() {
  try {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'))
    const now = Date.now()
    for (const [token, expiry] of Object.entries(data)) {
      if (typeof expiry === 'number' && expiry > now) tokenBlacklist.set(token, expiry)
    }
  } catch(e) {}
}

function saveBlacklist() {
  try {
    const now = Date.now()
    const obj = {}
    for (const [token, expiry] of tokenBlacklist.entries()) {
      if (expiry > now) obj[token] = expiry
    }
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(obj))
  } catch(e) { console.error('[Blacklist] Save error:', e.message) }
}

function blacklistToken(token, expiresInMs) {
  const expiry = Date.now() + (expiresInMs || 7 * 24 * 60 * 60 * 1000) // default 7d
  tokenBlacklist.set(token, expiry)
  saveBlacklist()
}

function isBlacklisted(token) {
  const expiry = tokenBlacklist.get(token)
  if (!expiry) return false
  if (Date.now() > expiry) {
    tokenBlacklist.delete(token)
    return false
  }
  return true
}

// --- Refresh Token Rotation with family tracking ---
// Each refresh creates a familyId. If an already-used refresh token is reused,
// we detect theft and blacklist the entire family.
const tokenFamilies = new Map() // familyId -> { tokens: Set<token>, userId }
const tokenToFamily = new Map() // token -> familyId

function refreshToken(oldToken) {
  try {
    const payload = jwt.verify(oldToken, JWT_SECRET)
    if (isBlacklisted(oldToken)) {
      // Already used token reused — possible theft. Blacklist entire family.
      const familyId = tokenToFamily.get(oldToken)
      if (familyId) {
        const family = tokenFamilies.get(familyId)
        if (family) {
          for (const t of family.tokens) {
            blacklistToken(t, 7 * 24 * 60 * 60 * 1000)
          }
          tokenFamilies.delete(familyId)
          console.warn(`[Auth] Token reuse detected! Family ${familyId} blacklisted for user ${family.userId}`)
        }
      }
      return null
    }

    // Mark old token as used (blacklist it)
    blacklistToken(oldToken, 7 * 24 * 60 * 60 * 1000)

    // Create new token with same payload
    const newToken = createToken(payload.userId, payload.role, payload.table)

    // Track in family
    const familyId = tokenToFamily.get(oldToken) || `fam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    if (!tokenFamilies.has(familyId)) {
      tokenFamilies.set(familyId, { tokens: new Set(), userId: payload.userId })
    }
    const family = tokenFamilies.get(familyId)
    family.tokens.add(oldToken)
    family.tokens.add(newToken)
    tokenToFamily.set(newToken, familyId)
    // Keep old mapping too so reuse detection works
    tokenToFamily.set(oldToken, familyId)

    return newToken
  } catch(e) {
    return null
  }
}

// Cleanup expired blacklist entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  let changed = false
  for (const [token, expiry] of tokenBlacklist.entries()) {
    if (now > expiry) { tokenBlacklist.delete(token); changed = true }
  }
  if (changed) saveBlacklist()
}, 600000)

// Cleanup expired token families every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tokenFamilies) {
    // Families with no active tokens can be cleaned
    // Check if all tokens in the family are expired/blacklisted
    let allExpired = true;
    for (const t of val.tokens) {
      const exp = tokenBlacklist.get(t);
      if (!exp || exp > now) { allExpired = false; break; }
    }
    if (allExpired) tokenFamilies.delete(key);
  }
}, 3600000);

loadBlacklist()

function requireAuth(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  if (isBlacklisted(token)) return null;
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
  return false;
}

function needsUpgrade(storedPassword) {
  return bcrypt ? !storedPassword.startsWith('$2') : false;
}

function isPlaintext(password) {
  return password.length < 50 && !password.startsWith('$2');
}

// Rate limiting (persistent via file)
const { loadJson, saveJson } = require('./config');
const RL_FILE = 'rate-limits.json';
let loginAttempts = loadJson(RL_FILE) || {};
const _rlSaveTimer = { pending: false };
function _debounceSaveRL() {
  if (_rlSaveTimer.pending) return;
  _rlSaveTimer.pending = true;
  setTimeout(() => { try { saveJson(RL_FILE, loginAttempts); } catch(e) {} _rlSaveTimer.pending = false; }, 60000);
}
function checkRateLimit(ip) {
  const now = Date.now();
  if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lastAttempt: 0 };
  const a = loginAttempts[ip];
  if (now - a.lastAttempt > config.rateLimit.windowMs) { a.count = 0; }
  a.count++;
  a.lastAttempt = now;
  _debounceSaveRL();
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
  checkRateLimit, resetRateLimit,
  blacklistToken, isBlacklisted, refreshToken
};
