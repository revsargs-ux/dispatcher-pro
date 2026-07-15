/**
 * Shared utilities for route sub-modules
 */

// --- Helper: read request body ---
function readBody(req, maxBytes) {
  const limit = maxBytes || 1024 * 1024; // 1MB default
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        return reject(Object.assign(new Error('Body too large'), { statusCode: 413 }));
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// --- Helper: send JSON response ---
function json(res, data, status = 200, cors) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(data));
}

// --- Helper: extract first public IP from x-forwarded-for chain ---
function extractPublicIp(ipRaw) {
  if (!ipRaw) return '';
  const ips = ipRaw.split(',').map(s => s.trim()).filter(Boolean);
  for (const ip of ips) {
    const clean = ip.replace(/^::ffff:/, '');
    if (clean === '127.0.0.1' || clean === '::1' || clean === 'unknown') continue;
    if (clean.startsWith('10.') || clean.startsWith('192.168.')) continue;
    const m172 = clean.match(/^172\.(\d+)\./);
    if (m172 && parseInt(m172[1]) >= 16 && parseInt(m172[1]) <= 31) continue;
    return clean;
  }
  return ips[0]?.replace(/^::ffff:/, '') || '';
}

module.exports = { readBody, json, extractPublicIp };
