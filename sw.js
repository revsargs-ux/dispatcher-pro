// Service Worker — Dispatcher.PRO
// Push-уведомления + Offline кэш

const CACHE_NAME = 'dispatcher-v26';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/worker.html',
  '/client.html',
  '/owner.html',
  '/sql-setup.html',
  '/sw.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/badge-72.png'
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

// GPS tracking removed (disabled)

// ============================================================
// MESSAGE HANDLER — communication with page
// ============================================================
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'CHECK_VERSION') {
    caches.delete(CACHE_NAME).then(() => {
      clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'VERSION_UPDATED' })));
    });
  }
});
