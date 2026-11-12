// Service Worker for Penguin View PWA  (v4)
//
// Design rules (each one fixes a real phone failure):
//  1. NEVER touch media. Range requests, <video>/<audio> fetches, /api/* and cross-origin URLs are left
//     to the browser. Routing video through a SW breaks seeking/playback on iOS Safari and some Androids.
//  2. Navigations are NETWORK-FIRST. The old worker served index.html cache-first forever, so after a
//     deploy phones kept an old shell that referenced JS bundles that no longer existed (blank screen).
//  3. Hashed build files (/assets/*) are immutable -> cache-first, and only cache real 200 non-HTML
//     responses so an error page can never poison the cache.
//  4. A new worker activates immediately, and the page is told so it can refresh at a safe moment.

const VERSION = 'v4';
const SHELL_CACHE = `penguin-view-shell-${VERSION}`;
const ASSET_CACHE = `penguin-view-assets-${VERSION}`;
const STATIC_CACHE = `penguin-view-static-${VERSION}`;
const KEEP = [SHELL_CACHE, ASSET_CACHE, STATIC_CACHE];

const PRECACHE = [
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/penguin_logo.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const asset of PRECACHE) {
        try { await cache.add(asset); } catch (err) { /* optional asset, skip */ }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

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
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(data.title || '🐧 Penguin View', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && typeof event.notification.data === 'string' ? event.notification.data : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ---------------------------------------------------------------------------
// Fetch strategy
// ---------------------------------------------------------------------------

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await withTimeout(fetch(request), 6000);
    const type = response.headers.get('content-type') || '';
    if (response.ok && type.includes('text/html')) {
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch (err) {
    const cached = (await cache.match('/index.html')) || (await caches.match('/index.html'));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#090d16;color:#e2e8f0;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><div><div style="font-size:48px">🐧</div><h2>You\'re offline</h2><p>Reconnect and reload to keep watching.</p></div></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  const type = response.headers.get('content-type') || '';
  if (response.status === 200 && !type.includes('text/html')) {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      const type = response.headers.get('content-type') || '';
      if (response.status === 200 && !type.includes('text/html')) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Rule 1: leave media + API + cross-origin entirely to the browser.
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('range')) return;
  if (request.destination === 'video' || request.destination === 'audio' || request.destination === 'track') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Everything else (dev modules, HMR, etc.) goes straight to the network.
});
