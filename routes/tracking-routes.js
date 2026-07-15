/**
 * GPS Tracking routes: status, start, stop, location, workers-location
 */
const { readBody, json } = require('./shared');
const { sbFetch } = require('../modules/db');
const { requireAuth } = require('../modules/auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(value) {
  if (!value || !UUID_RE.test(value)) return false;
  return true;
}

function checkTrackingAccess(req, workerId) {
  const session = requireAuth(req);
  if (!session) return false;
  if (['owner', 'dispatcher'].includes(session.role)) return true;
  if (session.role === 'worker' && session.userId === workerId) return true;
  return false;
}

const trackingSessions = {}; // In-memory: worker_id -> { session_id, started_at }

async function handleTrackingStatus(req, res, cors, urlPath) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Auth required' }, 401, cors);
  const q = new URL(req.url, 'http://localhost').searchParams;
  const workerId = q.get('worker_id');
  if (!workerId) return json(res, { error: 'worker_id required' }, 400, cors);
  const ts = trackingSessions[workerId];
  if (ts) {
    try {
      const sbRes = await sbFetch('tracking_locations', `session_id=eq.${ts.session_id}&order=created_at.desc&limit=1`, {});
      const locations = await sbRes.json();
      return json(res, { active: true, session_id: ts.session_id, started_at: ts.started_at, last_location: locations?.[0] || null }, 200, cors);
    } catch (e) {
      return json(res, { active: true, session_id: ts.session_id, started_at: ts.started_at }, 200, cors);
    }
  }
  try {
    const sbRes = await sbFetch('tracking_sessions', `worker_id=eq.${workerId}&status=eq.active&order=created_at.desc&limit=1`, {});
    const sessions = await sbRes.json();
    if (sessions?.length) {
      const s = sessions[0];
      trackingSessions[workerId] = { session_id: s.id, started_at: s.created_at };
      return json(res, { active: true, session_id: s.id, started_at: s.created_at }, 200, cors);
    }
  } catch (e) {}
  return json(res, { active: false }, 200, cors);
}

async function handleTrackingStart(req, res, cors) {
  const body = await readBody(req);
  try {
    const { session_id, worker_id } = JSON.parse(body);
    if (!session_id || !worker_id) return json(res, { error: 'session_id and worker_id required' }, 400, cors);
    if (!validateUUID(session_id) || !validateUUID(worker_id)) return json(res, { error: 'Invalid ID format' }, 400, cors);
    if (!checkTrackingAccess(req, worker_id)) return json(res, { error: 'Access denied' }, 403, cors);
    await sbFetch('tracking_sessions', `id=eq.${session_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', worker_id }) });
    trackingSessions[worker_id] = { session_id, started_at: new Date().toISOString() };
    console.log('[Tracking] Started for worker', worker_id, 'session', session_id);
    return json(res, { ok: true, session_id }, 200, cors);
  } catch (e) {
    return json(res, { error: e.message }, 500, cors);
  }
}

async function handleTrackingStop(req, res, cors) {
  const body = await readBody(req);
  try {
    const { session_id, worker_id } = JSON.parse(body);
    if (!session_id) return json(res, { error: 'session_id required' }, 400, cors);
    if (worker_id && !/^[0-9a-f-]{36}$/.test(worker_id)) return json(res, { error: 'Invalid worker_id' }, 400, cors);
    await sbFetch('tracking_sessions', `id=eq.${session_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'stopped', ended_at: new Date().toISOString() }) });
    if (worker_id) delete trackingSessions[worker_id];
    console.log('[Tracking] Stopped session', session_id);
    return json(res, { ok: true }, 200, cors);
  } catch (e) {
    return json(res, { error: e.message }, 500, cors);
  }
}

async function handleTrackingLocation(req, res, cors) {
  const body = await readBody(req);
  try {
    const data = JSON.parse(body);
    const { session_id, worker_id, lat, lng, accuracy, speed, heading, battery_level } = data;
    if (!session_id || !worker_id || lat == null || lng == null) {
      return json(res, { error: 'session_id, worker_id, lat, lng required' }, 400, cors);
    }
    if (!validateUUID(session_id) || !validateUUID(worker_id)) return json(res, { error: 'Invalid ID format' }, 400, cors);
    if (!checkTrackingAccess(req, worker_id)) return json(res, { error: 'Access denied' }, 403, cors);
    const pLat = parseFloat(lat), pLng = parseFloat(lng);
    if (!isFinite(pLat) || !isFinite(pLng) || pLat < -90 || pLat > 90 || pLng < -180 || pLng > 180) {
      return json(res, { error: 'Invalid coordinates' }, 400, cors);
    }
    const location = {
      session_id, worker_id,
      lat: pLat, lng: pLng,
      accuracy: accuracy ? parseFloat(accuracy) : null,
      speed: speed ? parseFloat(speed) : null,
      heading: heading ? parseFloat(heading) : null,
      battery_level: battery_level != null ? parseFloat(battery_level) : null,
      created_at: new Date().toISOString()
    };
    const sbRes = await sbFetch('tracking_locations', '', { method: 'POST', body: JSON.stringify(location) });
    if (!sbRes.ok) {
      const err = await sbRes.text();
      console.error('[Tracking] Location save failed:', sbRes.status, err);
      return json(res, { error: 'DB save failed' }, 500, cors);
    }
    return json(res, { ok: true }, 200, cors);
  } catch (e) {
    console.error('[Tracking] Location error:', e.message);
    return json(res, { error: e.message }, 500, cors);
  }
}

async function handleTrackingWorkersLocation(req, res, cors) {
  const session = requireAuth(req);
  if (!session) return json(res, { error: 'Auth required' }, 401, cors);
  try {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const workerIds = (q.get('worker_ids') || '').split(',').filter(Boolean).slice(0, 50);
    if (!workerIds.length) return json(res, [], 200, cors);
    // Batch: fetch all active sessions for these workers in one query
    const validIds = workerIds.filter(id => /^[0-9a-f-]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    if (!validIds.length) return json(res, [], 200, cors);
    const sessRes = await sbFetch('tracking_sessions', `worker_id=in.(${validIds.join(',')}),status=eq.active&select=id,worker_id&limit=100`, {});
    const activeSessions = await sessRes.json();
    if (!activeSessions?.length) return json(res, [], 200, cors);
    const sidMap = {};
    for (const s of activeSessions) {
      const ts = trackingSessions[s.worker_id];
      sidMap[s.worker_id] = ts?.session_id || s.id;
    }
    const sessionIds = [...new Set(Object.values(sidMap))];
    const locRes = await sbFetch('tracking_locations', `session_id=in.(${sessionIds.join(',')}),order=created_at.desc&select=session_id,lat,lng,accuracy,speed,battery_level,created_at&limit=100`, {});
    const locations = await locRes.json();
    const latestLoc = {};
    for (const loc of (locations || [])) {
      if (!latestLoc[loc.session_id]) latestLoc[loc.session_id] = loc;
    }
    const results = [];
    for (const wid of validIds) {
      const sid = sidMap[wid];
      if (!sid) continue;
      const loc = latestLoc[sid];
      if (loc) {
        results.push({ worker_id: wid, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, speed: loc.speed, battery_level: loc.battery_level, recorded_at: loc.created_at });
      }
    }
    return json(res, results, 200, cors);
  } catch (e) {
    console.error('[Tracking] workers-location error:', e.message);
    return json(res, { error: e.message }, 500, cors);
  }
}

module.exports = {
  handleTrackingStatus,
  handleTrackingStart,
  handleTrackingStop,
  handleTrackingLocation,
  handleTrackingWorkersLocation
};
