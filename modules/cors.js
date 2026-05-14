/**
 * CORS middleware
 */
const { config } = require('./config');

function getCorsHeaders(req) {
  const origin = req.headers['origin'] || '';
  const allowed = config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true'
  };
}

// Security headers for static files
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co https://script.google.com https://nominatim.openstreetmap.org https://unpkg.com; frame-src https://*.supabase.co"
};

module.exports = { getCorsHeaders, SEC_HEADERS };
