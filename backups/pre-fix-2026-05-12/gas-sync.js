/**
 * Google Sheets synchronization via GAS
 */
const { config } = require('./config');

async function syncToGoogleSheets(action, data) {
  try {
    if (action === 'syncShift' && data.shift_status) {
      const statusMap = { pending: 'Ожидает', planned: 'Запланирована', completed: 'Завершена', cancelled: 'Отменена' };
      data.shift_status = statusMap[data.shift_status] || data.shift_status;
    }
    const params = new URLSearchParams({ action });
    if (action === 'syncShift') {
      Object.entries(data).forEach(([k, v]) => { if (v !== null && v !== undefined) params.set(k, String(v)); });
    } else {
      params.set('data', JSON.stringify(data));
    }
    const r = await fetch(config.gasUrl + '?' + params.toString(), {
      headers: { 'User-Agent': 'DispatcherPRO/1.0' }
    });
    const result = await r.json();
    if (result.status === 'ok') {
      console.log('[GAS] Synced:', action, result.data?.message || '');
    } else {
      console.error('[GAS] Sync failed:', action, JSON.stringify(result));
    }
    return result;
  } catch (e) {
    console.error('[GAS] Sync error:', e.message);
    return null;
  }
}

module.exports = { syncToGoogleSheets };
