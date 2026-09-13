const CACHE_NAME = 'skpt-imc-plus-v5';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './view-loader.js',
  './supabase-adapter.js',
  './app.js',
  './pwa.js',
  './auth-fix.js',
  './manifest.webmanifest',
  './icon.jpg',
  './views/view-dashboard.html',
  './views/view-patient-list.html',
  './views/view-patient-detail.html',
  './views/view-service.html',
  './views/view-schedule.html',
  './views/view-summary.html',
  './views/view-admin.html',
  './views/modals/modal-patient.html',
  './views/modals/modal-schedule.html',
  './views/modals/modal-download.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
