// Service Worker — Dispatcher.PRO
// v32 — CACHE-FREE: no static cache, no pre-cache on install.
// Network-only for all HTML/API. Static assets cached only by browser (Cache-Control).
// Push notifications still work.

const CACHE_NAME = 'dispatcher-v32';

// === INSTALL: skip waiting, do NOT cache anything ===
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// === ACTIVATE: delete EVERYTHING, claim, unregister ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
    .then(() => self.registration.unregister())
  );
});

// === FETCH: network-only for HTML/API, cache-first only for static assets ===
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Push notifications / API calls — network only, no cache
  if (url.pathname.startsWith('/api/') || url.pathname === '/auth/login') {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // HTML pages — network only (no stale cache)
  if (url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.')) {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Static assets (images, fonts, js) — cache-first for speed
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => new Response('Offline', { status: 503 }))
  );
});

// ============================================================
// PUSH — уведомления
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
