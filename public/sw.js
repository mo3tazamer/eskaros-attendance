const VERSION = 'attendance-v3';
const SHELL = [
  '/index.html',
  '/css/app.css',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/fonts/cairo-arabic.woff2',
  '/fonts/cairo-latin.woff2',
  '/js/main.js',
  '/js/core/api.js',
  '/js/core/dom.js',
  '/js/core/format.js',
  '/js/core/session.js',
  '/js/components/clock.js',
  '/js/components/shell.js',
  '/js/components/states.js',
  '/js/components/status.js',
  '/js/ui/avatar.js',
  '/js/ui/icons.js',
  '/js/ui/sheet.js',
  '/js/ui/toast.js',
  '/js/views/auth/login.js',
  '/js/views/auth/setup.js',
  '/js/views/employee/home.js',
  '/js/views/employee/attendance.js',
  '/js/views/employee/loans.js',
  '/js/views/employee/profile.js',
  '/js/views/admin/home.js',
  '/js/views/admin/attendance.js',
  '/js/views/admin/loans.js',
  '/js/views/admin/accounts.js',
  '/js/views/admin/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/payroll')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
