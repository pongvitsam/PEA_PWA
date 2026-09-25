/* PEA PWA — HTML/JS ดึงจากเน็ตก่อน (ให้มือถือตรงกับเว็บ) แคชไว้ตอนออฟไลน์ */
const CACHE = 'pea-pwa-shell-v4';
const PRECACHE = [
  './',
  './index.html',
  './app.html',
  './manifest.webmanifest',
  './js/config.js',
  './js/pwa-gas-api.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE.map(function (u) {
        return new Request(u, { cache: 'reload' });
      })).catch(function () { /* ignore partial failures */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isShellAsset_(url) {
  const p = url.pathname || '';
  return p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.webmanifest') ||
    p.endsWith('/') || p.indexOf('/icons/') >= 0;
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ไม่แคช API ของ Google Apps Script
  if (url.hostname.indexOf('script.google') >= 0 || url.hostname.indexOf('googleusercontent') >= 0) {
    return;
  }
  // same-origin shell only
  if (url.origin !== self.location.origin) return;

  const isHtmlJs = url.pathname.endsWith('.html') || url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('/');

  event.respondWith(
    (isHtmlJs
      ? fetch(req).then(function (res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match('./app.html') || caches.match('./index.html');
          });
        })
      : caches.match(req).then(function (cached) {
          const network = fetch(req).then(function (res) {
            if (res && res.ok && isShellAsset_(url)) {
              const copy = res.clone();
              caches.open(CACHE).then(function (c) { c.put(req, copy); });
            }
            return res;
          }).catch(function () {
            return cached || caches.match('./index.html');
          });
          return cached || network;
        })
    )
  );
});
