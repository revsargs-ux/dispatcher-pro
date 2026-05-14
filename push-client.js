/**
 * Dispatcher.PRO — Push Notifications Client Module
 * Подключается к любому порталу (index.html, worker.html, client.html)
 * Только ДОБАВЛЯЕТ функционал, не ломает существующий код
 * 
 * Использование: <script src="/push-client.js"></script>
 */
(function() {
  'use strict';

  // Конфигурация
  const PUSH_CONFIG = {
    vapidPublicKey: 'BBJHDD-bstMpOdLK8k8UyzA-nPRViHYKDBYCbjv9PWGEg-ar8Pp_PlWZ1sn4WXJ1pMl5OBFTAIIv-LOy_BBW7Ic',
    subscriptionEndpoint: '/api/push-subscription',
    syncInterval: 24 * 60 * 60 * 1000, // Обновление токена раз в сутки
  };

  // Проверяем поддержку
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push] Web Push не поддерживается этим браузером');
    return;
  }

  // Дожидаемся загрузки SW
  navigator.serviceWorker.ready.then(async (registration) => {
    console.log('[Push] Service Worker ready');

    // Проверяем есть ли авторизация
    const token = localStorage.getItem('dp_token');
    if (!token) {
      console.log('[Push] Пользователь не авторизован — push не активируем');
      return;
    }

    // Запрашиваем разрешение на уведомления (один раз)
    await requestPermission();

    // Регистрируем push-подписку
    await subscribeToPush(registration);

    // Периодическое обновление подписки
    setInterval(() => subscribeToPush(registration), PUSH_CONFIG.syncInterval);

    // Обновление при видимости страницы (возврат в приложение)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update(); // Проверяем обновления SW
      }
    });
  });

  // --- Запрос разрешения ---
  async function requestPermission() {
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') {
      console.log('[Push] Уведомления заблокированы пользователем');
      return;
    }
    const result = await Notification.requestPermission();
    console.log('[Push] Permission:', result);
  }

  // --- Подписка на push ---
  async function subscribeToPush(registration) {
    try {
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Создаём новую подписку
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUSH_CONFIG.vapidPublicKey),
        });
        console.log('[Push] New subscription created');
      }

      // Отправляем подписку на сервер
      await sendSubscriptionToServer(subscription);
    } catch (e) {
      console.error('[Push] Subscription error:', e);
    }
  }

  // --- Отправка подписки на сервер ---
  async function sendSubscriptionToServer(subscription) {
    const token = localStorage.getItem('dp_token');
    if (!token) return;

    const subData = subscription.toJSON();

    try {
      const response = await fetch(PUSH_CONFIG.subscriptionEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: subData.endpoint,
          keys: subData.keys,
          platform: 'web',
        }),
      });

      if (response.ok) {
        console.log('[Push] Subscription saved to server');
      } else {
        console.error('[Push] Server returned:', response.status);
      }
    } catch (e) {
      console.error('[Push] Send subscription error:', e);
    }
  }

  // --- Утилита: конвертация VAPID ключа ---
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
  }

  // ============================================================
  // API endpoint для сохранения push-подписки
  // Этот код добавляется в routes.js через ОТДЕЛЬНЫЙ маршрут
  // или обрабатывается существующим /api прокси
  // ============================================================

  // Публичный метод для внешнего использования
  window.DispatcherPush = {
    getSubscription: async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.pushManager.getSubscription();
    },
    unsubscribe: async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        console.log('[Push] Unsubscribed');
      }
    },
    requestPermission: requestPermission,
  };

})();
