/**
 * GPS Tracking routes: status, start, stop, location, workers-location
 */
const { readBody, json } = require('./shared');
const { sbFetch } = require('../modules/db');

const trackingSessions = {}; // In-memory: worker_id -> { session_id, started_at }

async function handleTrackingStatus(req, res, cors, urlPath) {
  const q = new URL(req.url, 'http://localhost').searchParams;
  const workerId = q.get('worker_id');
  if (!workerId) return json(res, { error: 'worker_id required' }, 400, cors);
  const session = trackingSessions[workerId];
  if (session) {
    try {
      const sbRes = await sbFetch('tracking_locations', `session_id=eq.${session.session_id}&order=created_at.desc&limit=1`, {});
      const locations = await sbRes.json();
      return json(res, { active: true, session_id: session.session_id, started_at: session.started_at, last_location: locations?.[0] || null }, 200, cors);
    } catch (e) {
      return json(res, { active: true, session_id: session.session_id, started_at: session.started_at }, 200, cors);
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
    const location = {
      session_id, worker_id,
      lat: parseFloat(lat), lng: parseFloat(lng),
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
  try {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const workerIds = (q.get('worker_ids') || '').split(',').filter(Boolean);
    if (!workerIds.length) return json(res, [], 200, cors);
    const results = [];
    for (const wid of workerIds) {
      const session = trackingSessions[wid];
      let sessionId = session?.session_id;
      if (!sessionId) {
        const sbRes = await sbFetch('tracking_sessions', `worker_id=eq.${wid}&status=eq.active&order=created_at.desc&limit=1`, {});
        const sessions = await sbRes.json();
        if (sessions?.length) sessionId = sessions[0].id;
      }
      if (!sessionId) continue;
      const locRes = await sbFetch('tracking_locations', `session_id=eq.${sessionId}&order=created_at.desc&limit=1`, {});
      const locs = await locRes.json();
      if (locs?.length) {
        results.push({ worker_id: wid, lat: locs[0].lat, lng: locs[0].lng, accuracy: locs[0].accuracy, speed: locs[0].speed, battery_level: locs[0].battery_level, recorded_at: locs[0].created_at });
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
