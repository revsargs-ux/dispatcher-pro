/**
 * db.js — Unified Supabase access helper
 * All routes should use sbFetch/sbHeaders from here instead of defining locally.
 */
const { config } = require('./config');

function sbHeaders() {
  return { 'apikey': config.sbKey, 'Authorization': 'Bearer ' + config.sbKey, 'Content-Type': 'application/json' };
}

async function sbFetch(table, query, opts = {}) {
  const headers = sbHeaders();
  if (opts.method === 'POST' || opts.method === 'PATCH') headers['Prefer'] = 'return=representation';
  const url = `${config.sbUrl}/rest/v1/${table}${query ? '?' + query : ''}`;
  const fetchOpts = { method: opts.method || 'GET', headers };
  if (opts.body && opts.method !== 'GET' && opts.method !== 'DELETE') fetchOpts.body = opts.body;
  return fetch(url, fetchOpts);
}

module.exports = { sbFetch, sbHeaders };
