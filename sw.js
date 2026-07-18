// Service Worker — Dispatcher.PRO
// v28 — исправлен двойной respondWith, удалён мёртвый код

const CACHE_NAME = 'dispatcher-v29';
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
  '/assets/badge-72.png',
  '/tg-worker.html'
];

// === УСТАНОВКА ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// === АКТИВАЦИЯ ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// === FETCH — единый respondWith ===
self.addEventListener('fetch', (e) => {
  // Skip non-GET requests — просто пускаем без кэша
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Network-first: всегда пробуем сеть, кэш — только fallback
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(e.request).then((cached) => {
          if (cached) return cached;
          // Навигация без кэша → index.html
          if (e.request.mode === 'navigate') return caches.match('/index.html');
          return new Response('Offline', { status: 503 });
        })
      )
  );
});

// ============================================================
// PUSH — получение push-уведомлений
// ============================================================
self.addEventListener('push', (event) => {
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

  event.waitUntil(
    self.registration.showNotification(data.title, {
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
    })
  );
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================
self.addEventListener('notificationclick', (event) => {
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
// MESSAGE HANDLER
// ============================================================
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'CHECK_VERSION') {
    caches.delete(CACHE_NAME).then(() => {
      clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'VERSION_UPDATED' })));
    });
  }
});
