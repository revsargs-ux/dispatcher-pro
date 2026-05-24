// Service Worker — Dispatcher.PRO
// Push-уведомления + фоновый GPS-трекинг + Offline кэш

const CACHE_NAME = 'dispatcher-v22';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/worker.html',
  '/client.html',
  '/owner.html',
  '/sql-setup.html',
  '/sw.js',
  '/manifest.json',
  '/icon-192.png',
  '/badge-72.png'
];

// URLs that should always go network-first (API calls)
const NETWORK_FIRST_PATTERNS = ['/api/', '/auth/'];

// === УСТАНОВКА ===
self.addEventListener('install', (event) => {
  console.log('[SW] Installed');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// === АКТИВАЦИЯ ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// === FETCH — cache-first для статики, network-first для API ===
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Network-first for API/auth calls
  const isApi = NETWORK_FIRST_PATTERNS.some((p) => url.pathname.startsWith(p));
  if (isApi) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // Cache successful API responses briefly
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback for navigation requests
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('<html><body style="font-family:system-ui;background:#1a1a2e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#4ecdc4">📡 Нет соединения</h2><p>Проверьте подключение к интернету и обновите страницу</p></div></body></html>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        });
    })
  );
});

// ============================================================
// PUSH — получение push-уведомлений
// ============================================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  let data = {
    title: 'Dispatcher.PRO',
    body: 'Новое уведомление',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    data: data.data || { url: '/' },
    vibrate: [200, 100, 200],
    tag: 'dispatcher-notification',
    requireInteraction: true,
    actions: [
      { action: 'open', title: '📂 Открыть' },
      { action: 'dismiss', title: '✖ Закрыть' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.navigate(fullUrl);
            return client.focus();
          }
        }
        return self.clients.openWindow(fullUrl);
      })
  );
});

// ============================================================
// PUSH SUBSCRIPTION CHANGE
// ============================================================
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');
  event.waitUntil(
    fetch('/api/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldEndpoint: event.oldSubscription?.endpoint,
        newEndpoint: event.newSubscription?.endpoint,
      }),
    }).catch((e) => console.error('[SW] Subscription update failed:', e))
  );
});

// ============================================================
// GPS TRACKING — background location reporting
// ============================================================

let trackingInterval = null;
let trackingConfig = { sessionId: null, workerId: null, intervalMs: 5 * 60 * 1000 };
let batteryLevel = null;

// --- IndexedDB queue for offline locations ---
function openTrackingDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dispatcher_tracking', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('location-queue')) {
        db.createObjectStore('location-queue', { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueLocation(location) {
  try {
    const db = await openTrackingDB();
    const tx = db.transaction('location-queue', 'readwrite');
    tx.objectStore('location-queue').add(location);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    console.log('[SW-Tracking] Queued location (offline)');
  } catch (e) {
    console.error('[SW-Tracking] Queue error:', e);
  }
}

async function flushQueue() {
  try {
    const db = await openTrackingDB();
    const tx = db.transaction('location-queue', 'readonly');
    const store = tx.objectStore('location-queue');
    const all = await new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!all.length) return;

    // Try sending each queued location
    let sent = 0;
    for (const loc of all) {
      try {
        const r = await sendLocationToServer(loc);
        if (r) sent++;
        else break; // stop if server fails
      } catch { break; }
    }
    if (sent > 0) {
      const delTx = db.transaction('location-queue', 'readwrite');
      const delStore = delTx.objectStore('location-queue');
      delStore.clear();
      console.log('[SW-Tracking] Flushed', sent, 'queued locations');
    }
  } catch (e) {
    console.error('[SW-Tracking] Flush error:', e);
  }
}

async function sendLocationToServer(location) {
  try {
    const token = await getAuthToken();
    const r = await fetch('/api/tracking/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(location),
    });
    return r.ok;
  } catch (e) {
    console.error('[SW-Tracking] Send failed:', e);
    return false;
  }
}

async function getAuthToken() {
  // Try to get token from client
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    try {
      client.postMessage({ type: 'GET_AUTH_TOKEN' });
      // We can't await this easily, so fall through
    } catch {}
  }
  // The token is sent via START_TRACKING message
  return trackingConfig.token || '';
}

async function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not available'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 60000
    });
  });
}

async function getBatteryLevel() {
  try {
    if ('getBattery' in navigator) {
      const battery = await navigator.getBattery();
      batteryLevel = battery.level;
      battery.addEventListener('levelchange', () => { batteryLevel = battery.level; });
    }
  } catch (e) {
    batteryLevel = null;
  }
  return batteryLevel;
}

async function reportLocation() {
  if (!trackingConfig.sessionId || !trackingConfig.workerId) return;

  try {
    const pos = await getCurrentPosition();
    const batt = await getBatteryLevel();

    const location = {
      session_id: trackingConfig.sessionId,
      worker_id: trackingConfig.workerId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      battery_level: batt,
      timestamp: new Date().toISOString()
    };

    const sent = await sendLocationToServer(location);
    if (!sent) {
      await queueLocation(location);
    } else {
      // Try flushing queued locations
      await flushQueue();
    }

    // Battery optimization: increase interval if low battery
    if (batt !== null && batt < 0.10 && trackingConfig.intervalMs < 15 * 60 * 1000) {
      console.log('[SW-Tracking] Low battery (< 10%), increasing interval to 15 min');
      stopTrackingInterval();
      trackingConfig.intervalMs = 15 * 60 * 1000;
      startTrackingInterval();
    } else if (batt !== null && batt > 0.20 && trackingConfig.intervalMs > 5 * 60 * 1000) {
      console.log('[SW-Tracking] Battery OK (> 20%), restoring interval to 5 min');
      stopTrackingInterval();
      trackingConfig.intervalMs = 5 * 60 * 1000;
      startTrackingInterval();
    }

    // Notify all clients
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(c => c.postMessage({
      type: 'TRACKING_UPDATE',
      location,
      battery: batt
    }));

  } catch (e) {
    console.error('[SW-Tracking] Location error:', e.message);
    // Notify clients of error
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(c => c.postMessage({
      type: 'TRACKING_ERROR',
      error: e.message
    }));
  }
}

function startTrackingInterval() {
  if (trackingInterval) clearInterval(trackingInterval);
  trackingInterval = setInterval(reportLocation, trackingConfig.intervalMs);
}

function stopTrackingInterval() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
}

function startTracking(config) {
  console.log('[SW-Tracking] Starting tracking for session:', config.sessionId);
  trackingConfig = {
    sessionId: config.session_id,
    workerId: config.worker_id,
    token: config.token || '',
    intervalMs: 5 * 60 * 1000
  };
  stopTrackingInterval();
  // Report immediately, then on interval
  reportLocation();
  startTrackingInterval();
}

function stopTracking() {
  console.log('[SW-Tracking] Stopping tracking');
  stopTrackingInterval();
  trackingConfig = { sessionId: null, workerId: null, intervalMs: 5 * 60 * 1000 };
}

// ============================================================
// MESSAGE HANDLER — communication with page
// ============================================================
self.addEventListener('message', (event) => {
  const msg = event.data;

  if (msg.type === 'START_TRACKING') {
    startTracking(msg);
    if (event.ports?.[0]) {
      event.ports[0].postMessage({ type: 'TRACKING_STARTED', ok: true });
    }
  }

  if (msg.type === 'STOP_TRACKING') {
    stopTracking();
    if (event.ports?.[0]) {
      event.ports[0].postMessage({ type: 'TRACKING_STOPPED', ok: true });
    }
  }

  if (msg.type === 'TRACKING_CHECK') {
    const isActive = !!trackingConfig.sessionId;
    if (event.ports?.[0]) {
      event.ports[0].postMessage({
        type: 'TRACKING_STATUS',
        active: isActive,
        session_id: trackingConfig.sessionId,
        worker_id: trackingConfig.workerId
      });
    }
  }

  if (msg.type === 'AUTH_TOKEN_UPDATE') {
    trackingConfig.token = msg.token;
  }
});
