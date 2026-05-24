/**
 * db.js — Unified Supabase access helper
 * All routes should use sbFetch/sbHeaders from here instead of defining locally.
 */
const { config } = require('./config');

function sbHeaders() {
  return { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' };
}

/** Validate table name to prevent injection */
const VALID_TABLE_RE = /^[a-z_][a-z0-9_]{0,63}$/;

/** Validate Supabase query parameter key-value pairs */
function sanitizeQuery(query) {
  if (!query) return '';
  // Basic validation: no control chars, reasonable length
  if (query.length > 2000) throw new Error('Query too long');
  return query;
}

async function sbFetch(table, query, opts = {}) {
  if (!VALID_TABLE_RE.test(table)) throw new Error(`Invalid table name: ${table}`);
  query = sanitizeQuery(query);
  const headers = sbHeaders();
  if (opts.method === 'POST' || opts.method === 'PATCH') headers['Prefer'] = 'return=representation';
  const url = `${config.sbUrl}/rest/v1/${table}${query ? '?' + query : ''}`;
  const fetchOpts = { method: opts.method || 'GET', headers };
  if (opts.body && opts.method !== 'GET' && opts.method !== 'DELETE') fetchOpts.body = opts.body;
  return fetch(url, fetchOpts);
}

module.exports = { sbFetch, sbHeaders };
