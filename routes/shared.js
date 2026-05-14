/**
 * Shared utilities for route sub-modules
 */

// --- Helper: read request body ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// --- Helper: send JSON response ---
function json(res, data, status = 200, cors) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(data));
}

module.exports = { readBody, json };
