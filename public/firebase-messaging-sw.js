// Firebase Messaging Service Worker for Byeongdol Investment
// Handles background push notifications when app is closed or minimized

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker script
firebase.initializeApp({
  apiKey: "AIzaSyDgwYO4Rwh_grjUpFlLC5SD4t57MDXhJvg",
  authDomain: "calm-coder-vkx2q.firebaseapp.com",
  projectId: "calm-coder-vkx2q",
  storageBucket: "calm-coder-vkx2q.firebasestorage.app",
  messagingSenderId: "291296239961",
  appId: "1:291296239961:web:48f37f98420ba53a912c48"
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const title = payload.notification?.title || payload.data?.title || '병돌 인베스트먼트 알림';
  const body = payload.notification?.body || payload.data?.body || payload.data?.message || '새로운 시장 알림이 도착했습니다.';
  const icon = payload.notification?.icon || '/icons/icon-192x192.png';
  const badge = payload.notification?.badge || '/icons/icon-192x192.png';
  const tag = payload.data?.tag || payload.data?.stockSymbol || 'byeongdol-alert';

  const notificationOptions = {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.url || (payload.data?.stockSymbol ? `/?tab=stocks&symbol=${payload.data.stockSymbol}` : '/?tab=alerts'),
      stockSymbol: payload.data?.stockSymbol,
      type: payload.data?.type,
      timestamp: Date.now()
    }
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Fallback listener for raw Web Push events
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    console.log('[firebase-messaging-sw.js] Received push event:', data);

    const title = data.notification?.title || data.title || '병돌 인베스트먼트 실시간 알림';
    const body = data.notification?.body || data.body || data.message || '시장 변동이 감지되었습니다.';
    const options = {
      body,
      icon: data.notification?.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: data.data?.tag || data.data?.stockSymbol || 'byeongdol-alert',
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: data.data?.url || (data.data?.stockSymbol ? `/?tab=stocks&symbol=${data.data.stockSymbol}` : '/?tab=alerts'),
        ...data.data
      }
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.warn('[firebase-messaging-sw.js] Error parsing push data:', err);
  }
});

// Handle notification click to navigate to relevant stock / alerts view
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
