/**
 * Dispatcher.PRO — Push Notifications Client Module (DISABLED)
 * Push subscription не работает (Edge Function не развёрнута).
 * Модуль загружается для будущего использования, но НЕ запрашивает
 * разрешение и НЕ подписывается автоматически.
 * 
 * Локальные уведомления (будильник воркера) работают через worker.html
 * встроенные функции requestNotifications/sendPush.
 *
 * Для активации: раскомментировать блок автозапуска ниже.
 */
(function() {
  'use strict';

  // Проверяем поддержку
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push] Web Push не поддерживается этим браузером');
    return;
  }

  console.log('[Push] Модуль загружен. Push-подписка отключена (Edge Function не развёрнута).');

  // --- Код ниже для будущего использования ---
  // Раскомментировать когда Edge Function будет готова:
  /*
  const PUSH_CONFIG = {
    vapidPublicKey: 'BBJHDD-bstMpOdLK8k8UyzA-nPRViHYKDBYCbjv9PWGEg-ar8Pp_PlWZ1sn4WXJ1pMl5OBFTAIIv-LOy_BBW7Ic',
    subscriptionEndpoint: '/api/push-subscription',
    syncInterval: 24 * 60 * 60 * 1000,
  };

  navigator.serviceWorker.ready.then(async (registration) => {
    const token = localStorage.getItem('dp_token');
    if (!token) return;
    await requestPermission();
    await subscribeToPush(registration);
    setInterval(() => subscribeToPush(registration), PUSH_CONFIG.syncInterval);
  });

  async function requestPermission() {
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    await Notification.requestPermission();
  }

  async function subscribeToPush(registration) {
    try {
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUSH_CONFIG.vapidPublicKey),
        });
      }
      await sendSubscriptionToServer(subscription);
    } catch (e) {
      console.error('[Push] Subscription error:', e);
    }
  }

  async function sendSubscriptionToServer(subscription) {
    const token = localStorage.getItem('dp_token');
    if (!token) return;
    const subData = subscription.toJSON();
    try {
      await fetch(PUSH_CONFIG.subscriptionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ endpoint: subData.endpoint, keys: subData.keys, platform: 'web' }),
      });
    } catch (e) {
      console.error('[Push] Send subscription error:', e);
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
  }
  */

  // Публичный API для будущего использования
  window.DispatcherPush = {
    enabled: false,
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
  };

})();
