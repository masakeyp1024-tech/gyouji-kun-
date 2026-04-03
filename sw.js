const CACHE_NAME = 'gyouji-kun-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon.svg'
];

self.addEventListener('install', event => {
  // Force the new service worker to activate immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  // Delete old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only intercept GET requests, skip API calls
  if (event.request.method !== 'GET' || event.request.url.includes('googleapis.com')) {
    return;
  }

  // Network-first strategy: try network, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Update cache with fresh response
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // If network fails, use cache
        return caches.match(event.request);
      })
  );
});
