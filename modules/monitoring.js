/**
 * Monitoring module — request stats, error rates, response times
 */

const ONE_MINUTE = 60 * 1000;
const TEN_MINUTES = 10 * ONE_MINUTE;
const WINDOW_MS = ONE_MINUTE;

// Per-endpoint stats: { endpoint: { requests: [], errors: [] } }
// Each entry: { time: timestamp, duration: ms, status: number }
const endpointStats = {};

// Totals
let totalRequests = 0;
let totalErrors = 0;

function getOrCreate(endpoint) {
  if (!endpointStats[endpoint]) {
    endpointStats[endpoint] = { requests: [], errors: [] };
  }
  return endpointStats[endpoint];
}

/** Record a completed request */
function recordRequest(endpoint, statusCode, durationMs) {
  const now = Date.now();
  totalRequests++;

  const stat = getOrCreate(endpoint);
  stat.requests.push({ time: now, duration: durationMs, status: statusCode });

  if (statusCode >= 400) {
    totalErrors++;
    stat.errors.push({ time: now, status: statusCode });
  }

  // Check error rate in current minute window
  _checkErrorRate();
}

/** Clean up entries older than WINDOW_MS */
function _cleanupOld() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const ep of Object.keys(endpointStats)) {
    const s = endpointStats[ep];
    s.requests = s.requests.filter(e => e.time >= cutoff);
    s.errors = s.errors.filter(e => e.time >= cutoff);
    if (s.requests.length === 0) delete endpointStats[ep];
  }
}

/** Warn if error rate exceeds 20% in any minute */
function _checkErrorRate() {
  const cutoff = Date.now() - WINDOW_MS;
  let recentTotal = 0;
  let recentErrors = 0;
  for (const s of Object.values(endpointStats)) {
    const recent = s.requests.filter(e => e.time >= cutoff);
    recentTotal += recent.length;
    recentErrors += recent.filter(e => e.status >= 400).length;
  }
  if (recentTotal >= 10 && (recentErrors / recentTotal) > 0.2) {
    console.warn(`[Monitoring] ⚠️ Error rate ${(recentErrors / recentTotal * 100).toFixed(1)}% in last minute (${recentErrors}/${recentTotal})`);
  }
}

/** Get stats snapshot */
function getStats() {
  _cleanupOld();
  const cutoff = Date.now() - WINDOW_MS;

  let perMinuteTotal = 0;
  let perMinuteErrors = 0;
  const topEndpoints = [];

  for (const [ep, s] of Object.entries(endpointStats)) {
    const recent = s.requests.filter(e => e.time >= cutoff);
    const recentErrors = s.errors.filter(e => e.time >= cutoff);
    perMinuteTotal += recent.length;
    perMinuteErrors += recentErrors.length;

    const avgDuration = recent.length > 0
      ? Math.round(recent.reduce((sum, e) => sum + e.duration, 0) / recent.length)
      : 0;

    topEndpoints.push({
      endpoint: ep,
      requests: recent.length,
      errors: recentErrors.length,
      avgDuration
    });
  }

  // Sort by request count descending, top 10
  topEndpoints.sort((a, b) => b.requests - a.requests);

  return {
    requests: { total: totalRequests, perMinute: perMinuteTotal },
    errors: { total: totalErrors, perMinute: perMinuteErrors },
    topEndpoints: topEndpoints.slice(0, 10),
    uptime: process.uptime(),
    memory: process.memoryUsage().rss
  };
}

// Auto-cleanup every 10 minutes
setInterval(_cleanupOld, TEN_MINUTES);

module.exports = { recordRequest, getStats };
