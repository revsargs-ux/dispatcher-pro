// Service Worker — Dispatcher.PRO
// Обработка push-уведомлений + базовый fetch

// === УСТАНОВКА ===
self.addEventListener('install', () => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

// === АКТИВАЦИЯ ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(self.clients.claim());
});

// === FETCH — без кэширования, прозрачно ===
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));

// ============================================================
// PUSH — получение push-уведомлений
// Работает в 3 состояниях: foreground, background, terminated
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

  // Парсим данные из push-сообщения
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
    tag: 'dispatcher-notification',  // группирует одинаковые уведомления
    requireInteraction: true,         // не исчезает пока не нажмут
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
// NOTIFICATION CLICK — обработка клика по уведомлению
// Deep link: переход к конкретному заказу/смене
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
        // Если окно уже открыто — фокусируемся и переходим
        for (const client of clients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.navigate(fullUrl);
            return client.focus();
          }
        }
        // Если нет открытых окон — открываем новое
        return self.clients.openWindow(fullUrl);
      })
  );
});

// ============================================================
// PUSH SUBSCRIPTION CHANGE — обновление токена при смене
// ============================================================
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');
  event.waitUntil(
    // Отправляем новый токен на сервер
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
