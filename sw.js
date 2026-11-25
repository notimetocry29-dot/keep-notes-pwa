// رقم النسخة: لازم يتطابق مع VER في app.js — تغييره هنا هو اللي بيخلّي المتصفح يلاقي النسخة الجديدة
const BUILD = '2';
const C = 'keeplite-v' + BUILD;
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './app.css',
  './theme.js',
  './splash.js',
  './backup.js',
  './app.js',
  './icons/icon.svg',
  './icons/favicon-48.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './fonts/figtree.woff2',
  './fonts/readex-400.woff2',
  './fonts/readex-600.woff2',
  './fonts/ruqaa.woff2',
  './sfx/ui.mp3',
  './sfx/open.mp3',
  './sfx/close.mp3',
  './sfx/on.mp3',
  './sfx/off.mp3',
  './sfx/pick.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(C).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('keeplite-v') && k !== C).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(
      caches.open(C)
        .then((c) => c.match(r, { ignoreSearch: true }).then((h) => h || (new URL(r.url).pathname.endsWith('/') ? c.match('./index.html') : null)))
        .then((h) => h || fetch(r).catch(() => caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.open(C)
      .then((c) => c.match(r, { ignoreSearch: true }))
      .then((h) => h || fetch(r))
  );
});
