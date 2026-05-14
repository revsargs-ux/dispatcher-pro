/**
 * GPS Tracking module — in-memory sessions + Supabase persistence
 */
const fs = require('fs')
const path = require('path')
const { config } = require('./config')

const TRACKING_FILE = path.join(config.appDir, 'data', 'tracking.json')

// In-memory sessions
let sessions = {}

// Load persisted sessions
function loadSessions() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      sessions = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8')) || {}
    }
  } catch (e) {
    console.error('[Tracking] Load error:', e.message)
    sessions = {}
  }
}

// Persist sessions
function saveSessions() {
  try {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(sessions, null, 2))
  } catch (e) {
    console.error('[Tracking] Save error:', e.message)
  }
}

// Clean stale sessions (older than 24h)
function cleanStaleSessions() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let changed = false
  for (const [id, s] of Object.entries(sessions)) {
    if (s.started_at && new Date(s.started_at).getTime() < cutoff) {
      delete sessions[id]
      changed = true
    }
  }
  if (changed) saveSessions()
}

// Clean old locations from Supabase (older than 7 days)
async function cleanOldLocations() {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { config: cfg } = require('./config')
    const headers = { 'apikey': cfg.sbKey, 'Authorization': 'Bearer ' + cfg.sbKey, 'Content-Type': 'application/json' }
    await fetch(`${cfg.sbUrl}/rest/v1/worker_locations?recorded_at.lt.${cutoff}`, {
      method: 'DELETE',
      headers
    })
  } catch (e) {
    console.error('[Tracking] Location cleanup error:', e.message)
  }
}

// Start a tracking session
function startSession(workerIds) {
  const sessionId = 'track_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  sessions[sessionId] = {
    worker_ids: workerIds,
    started_at: new Date().toISOString(),
    active: true
  }
  saveSessions()
  return sessionId
}

// Stop a tracking session
function stopSession(sessionId) {
  if (sessions[sessionId]) {
    sessions[sessionId].active = false
    sessions[sessionId].stopped_at = new Date().toISOString()
    saveSessions()
    return true
  }
  return false
}

// Get active session
function getActiveSession() {
  for (const [id, s] of Object.entries(sessions)) {
    if (s.active) return { session_id: id, ...s }
  }
  return null
}

// Save location to Supabase
async function addLocation(workerId, data) {
  const active = getActiveSession()
  const sessionId = data.session_id || (active ? active.session_id : null)
  if (!sessionId) throw new Error('No active tracking session')

  const headers = { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' }
  const row = {
    worker_id: workerId,
    session_id: sessionId,
    lat: data.lat,
    lng: data.lng,
    accuracy: data.accuracy || null,
    speed: data.speed || null,
    heading: data.heading || null,
    battery_level: data.battery_level || null,
    recorded_at: new Date().toISOString()
  }

  const res = await fetch(`${config.sbUrl}/rest/v1/worker_locations`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(row)
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error('Supabase insert failed: ' + err)
  }
  return true
}

// Get locations for a session
async function getLocations(sessionId) {
  const headers = { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey }

  // Get last 24h locations for trail
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const res = await fetch(
    `${config.sbUrl}/rest/v1/worker_locations?session_id=eq.${sessionId}&recorded_at=gte.${since}&order=recorded_at.desc&limit=1000`,
    { headers }
  )
  if (!res.ok) throw new Error('Failed to fetch locations')
  const locations = await res.json()

  // Get worker info for unique worker_ids
  const workerIds = [...new Set(locations.map(l => l.worker_id).filter(Boolean))]
  let workers = {}
  if (workerIds.length > 0) {
    const wRes = await fetch(
      `${config.sbUrl}/rest/v1/workers?id=in.(${workerIds.join(',')})&select=id,full_name,phone`,
      { headers }
    )
    if (wRes.ok) {
      const wList = await wRes.json()
      for (const w of wList) workers[w.id] = w
    }
  }

  // Last location per worker
  const lastPerWorker = {}
  for (const loc of locations) {
    if (loc.worker_id && !lastPerWorker[loc.worker_id]) {
      lastPerWorker[loc.worker_id] = loc
    }
  }

  return {
    session_id: sessionId,
    workers: Object.entries(lastPerWorker).map(([wid, loc]) => ({
      worker_id: wid,
      name: workers[wid]?.full_name || null,
      phone: workers[wid]?.phone || null,
      last_location: loc
    })),
    trail: locations.reverse() // chronological order for map
  }
}

// Init
loadSessions()
cleanStaleSessions()

// Periodic cleanup
setInterval(cleanStaleSessions, 60 * 60 * 1000) // every hour
setInterval(cleanOldLocations, 6 * 60 * 60 * 1000) // every 6 hours
// Run initial location cleanup after 2 minutes
setTimeout(cleanOldLocations, 120000)

module.exports = { startSession, stopSession, getActiveSession, addLocation, getLocations, sessions }
