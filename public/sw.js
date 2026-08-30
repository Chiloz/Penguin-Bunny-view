// Service Worker for Penguin View PWA
const CACHE_NAME = 'penguin-view-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/penguin_logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA cache addAll error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Handle incoming Web Push events from server / device
self.addEventListener('push', (event) => {
  let data = { title: '🐧 Penguin View Alert', body: 'You have a new update in Penguin View!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: '🐧 Penguin View Alert', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'New message or invite received.',
    icon: data.icon || '/penguin_logo.jpg',
    badge: '/penguin_logo.jpg',
    tag: data.tag || 'penguin-notif',
    renotify: true,
    data: data.url || '/',
    vibrate: [100, 50, 100]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🐧 Penguin View', options)
  );
});

// Handle clicking on a notification: focus active window or open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && typeof event.notification.data === 'string')
    ? event.notification.data
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests and skip Firestore / API requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('identitytoolkit.googleapis.com') ||
    url.origin.includes('firebaseinstallations.googleapis.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        // Return offline fallback if navigating
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

