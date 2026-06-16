/**
 * Payment routes: export CSV, upload receipt, serve receipt, GAS webhook
 */
const fs = require('fs');
const path = require('path');
const { readBody, json, extractPublicIp } = require('./shared');
const { config } = require('../modules/config');
const { sbFetch } = require('../modules/db');
const { requireAuth } = require('../modules/auth');
const { audit } = require('../modules/audit');
const { verifyGasSignature } = require('../modules/gas-sync');

// --- Export CSV ---
async function handleExportCsv(req, res, cors) {
  const session = requireAuth(req);
  if (!session || (session.role !== 'owner' && session.role !== 'dispatcher')) {
    return json(res, { error: 'Нет доступа' }, 403, cors);
  }
  try {
    const ms = new Date().toISOString().split('T')[0].slice(0, 8) + '01';
    const asgn = await (await sbFetch('shift_assignments',
      `select=hours_worked,rate_per_hour,client_rate_per_hour,extra_amount,payment_status,worker_id,shifts!inner(date,client_id,clients(name))&shifts.date=gte.${ms}&limit=1000`)).json();
    const workers = await (await sbFetch('workers', 'select=id,full_name&limit=300')).json();
    const wMap = {}; workers.forEach(w => wMap[w.id] = w.full_name);
    let csv = '\uFEFFДата,Рабочий,Клиент,Часы,Рабочему,От клиента,Маржа,Статус\n';
    (asgn || []).filter(a => parseFloat(a.hours_worked) > 0).forEach(a => {
      const h = parseFloat(a.hours_worked), r = parseFloat(a.rate_per_hour) || 400, cr = parseFloat(a.client_rate_per_hour) || 520, ex = parseFloat(a.extra_amount) || 0;
      csv += `${a.shifts?.date || ''},"${wMap[a.worker_id] || ''}","${a.shifts?.clients?.name || ''}",${h},${h*r+ex},${h*cr+ex},${(cr-r)*h},${a.payment_status}\n`;
    });
    audit('export', 'payments.csv', session.userId, session.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    res.writeHead(200, { ...cors, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=payments.csv' });
    res.end(csv);
  } catch (e) { res.writeHead(500, cors); res.end('Export error'); }
}

// --- Upload receipt (JSON base64 OR multipart/form-data) ---
async function handleUploadReceipt(req, res, cors) {
  const contentType = req.headers['content-type'] || '';
  const session = requireAuth(req);
  if (!session) { res.writeHead(401, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ error: 'Auth required' })); }

  try {
    let buf, originalName;

    if (contentType.startsWith('multipart/form-data')) {
      // Parse multipart/form-data using boundary
      const body = await readBody(req);
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) throw new Error('No boundary in content-type');
      const parts = parseMultipart(body, boundary);
      const filePart = parts.find(p => p.name === 'file' || p.filename);
      if (!filePart || !filePart.data) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
        return res.end(JSON.stringify({ error: 'Missing file field' }));
      }
      buf = Buffer.from(filePart.data, 'binary');
      originalName = filePart.filename || 'upload';
    } else {
      // JSON mode (legacy)
      const body = await readBody(req);
      const { filename, data: b64 } = JSON.parse(body);
      if (!filename || !b64) { res.writeHead(400, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ error: 'Missing fields' })); }
      buf = Buffer.from(b64, 'base64');
      originalName = filename;
    }

    if (buf.length > config.maxFileSize) { res.writeHead(413, { 'Content-Type': 'application/json', ...cors }); return res.end(JSON.stringify({ error: 'File too large' })); }
    const fname = Date.now() + '-' + String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!fs.existsSync(config.receiptsDir)) fs.mkdirSync(config.receiptsDir, { recursive: true });
    await fs.promises.writeFile(path.join(config.receiptsDir, fname), buf);
    audit('upload_receipt', fname, session?.userId, session?.role, extractPublicIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress));
    json(res, { filename: fname, url: '/receipts/' + fname });
  } catch (e) { console.error('Upload error:', e); res.writeHead(500, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify({ error: 'Upload error' })); }
}

// --- Simple multipart parser (no external deps) ---
function parseMultipart(body, boundary) {
  const parts = [];
  const delim = Buffer.from('--' + boundary);
  const bodyBuf = Buffer.from(body, 'binary');
  let start = 0;
  while (true) {
    const s = bodyBuf.indexOf(delim, start);
    if (s === -1) break;
    const nextS = bodyBuf.indexOf(delim, s + delim.length);
    if (nextS === -1) break;
    const partData = bodyBuf.slice(s + delim.length + 2, nextS - 2); // \r\n before boundary
    const headerEnd = partData.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) { start = nextS; continue; }
    const headers = partData.slice(0, headerEnd).toString('utf8');
    const content = partData.slice(headerEnd + 4);
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fileMatch = headers.match(/filename="([^"]*)"/);
    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: fileMatch ? fileMatch[1] : '',
      data: content.toString('binary')
    });
    start = nextS;
  }
  return parts;
}

// --- Serve receipt ---
function handleReceipt(req, res, cors, urlPath) {
  const rFile = path.join(config.receiptsDir, urlPath.replace('/receipts/', ''));
  if (!rFile.startsWith(config.receiptsDir) || !fs.existsSync(rFile)) { res.writeHead(404, cors); return res.end('Not found'); }
  const ext = path.extname(rFile).toLowerCase();
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf' }[ext] || 'application/octet-stream';
  res.writeHead(200, { ...cors, 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  fs.createReadStream(rFile).pipe(res);
}

// --- GAS webhook ---
async function handleGasWebhook(req, res, cors) {
  const body = req._rawBody || await readBody(req);
  try {
    const { table, id, data } = JSON.parse(body);
    if (!table || !id || !data) return json(res, { error: 'Missing table, id or data' }, 400, cors);
    if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, { error: 'Invalid ID format' }, 400, cors);
    const allowedTables = ['workers', 'clients', 'shifts', 'shift_assignments', 'payments', 'users'];
    if (!allowedTables.includes(table)) return json(res, { error: 'Table not allowed' }, 403, cors);
    const sbRes = await sbFetch(table, `id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    const result = await sbRes.text();
    console.log('[GAS-Webhook] Updated', table, id, 'status:', sbRes.status);
    res.writeHead(sbRes.status, { 'Content-Type': 'application/json', ...cors });
    res.end(result);
  } catch (e) {
    console.error('[GAS-Webhook] Error:', e.message);
    json(res, { error: e.message }, 500, cors);
  }
}

module.exports = {
  handleExportCsv,
  handleUploadReceipt,
  handleReceipt,
  handleGasWebhook
};
