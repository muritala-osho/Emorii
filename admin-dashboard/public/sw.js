const CACHE_NAME = 'emorii-admin-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Emorii Admin', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'Emorii Admin';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    tag: data.tag || 'admin-alert',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: data.data?.urgency === 'high',
    actions: [
      { action: 'open', title: 'Open Dashboard' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    timestamp: data.timestamp || Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetTab = event.notification.data?.tab || '';
  // Use self.registration.scope (the app's actual base URL) rather than just
  // self.location.origin. This matters when the dashboard is served at a
  // sub-path like /admin-web/ — origin alone would point at the API root.
  const appBase = self.registration.scope;
  const urlToOpen = appBase + (targetTab ? `?tab=${encodeURIComponent(targetTab)}` : '');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(appBase) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE_TAB', tab: targetTab });
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
