/**
 * Audit log — JSON lines file + console output
 */
const fs = require('fs')
const path = require('path')

const LOG_PATH = path.join(__dirname, '..', 'data', 'audit.log')
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// Important actions that also go to console
const CONSOLE_ACTIONS = new Set([
  'login_success', 'login_failure', 'register', 'password_reset', 'data_delete', 'export', 'upload_receipt'
])

function ensureDir() {
  const dir = path.dirname(LOG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function trimLog() {
  try {
    if (!fs.existsSync(LOG_PATH)) return
    const stat = fs.statSync(LOG_PATH)
    if (stat.size < MAX_SIZE) return
    // Keep last ~5MB by reading from the end
    const keepSize = Math.floor(MAX_SIZE / 2)
    const fd = fs.openSync(LOG_PATH, 'r')
    const buf = Buffer.alloc(keepSize)
    fs.readSync(fd, buf, 0, keepSize, stat.size - keepSize)
    fs.closeSync(fd)
    // Find first newline to align to line boundary
    const nlIdx = buf.indexOf(10) // '\n'
    const content = nlIdx >= 0 ? buf.slice(nlIdx + 1).toString() : buf.toString()
    fs.writeFileSync(LOG_PATH, content)
    console.log('[AUDIT] Log trimmed from', stat.size, 'to', content.length, 'bytes')
  } catch (e) {
    console.error('[AUDIT] Trim error:', e.message)
  }
}

function audit(action, details, userId, role, ip) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    details,
    userId: userId || 'anonymous',
    role: role || 'unknown',
    ip: ip || 'unknown'
  }
  const line = JSON.stringify(entry) + '\n'

  try {
    ensureDir()
    fs.appendFileSync(LOG_PATH, line)
  } catch (e) {
    console.error('[AUDIT] Write error:', e.message)
  }

  if (CONSOLE_ACTIONS.has(action)) {
    console.log(`[AUDIT] ${action} | user=${entry.userId} role=${entry.role} ip=${entry.ip} | ${details}`)
  }

  // Check size every 100 writes (lazy counter)
  if (Math.random() < 0.01) trimLog()
}

module.exports = { audit }
