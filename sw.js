// Permite usar la app sin internet: guarda la app, las tipografías y el generador de PDF.
const CACHE = 'freenotas-v4';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.json', 'icon.svg',
  'js/main.js', 'js/util.js', 'js/db.js', 'js/paper.js', 'js/ink.js', 'js/assets.js', 'js/model.js', 'js/dict.js',
  'js/handwriting.js', 'js/materials.js', 'js/stickerize.js', 'js/trainer.js', 'js/editor.js', 'js/assistant.js', 'js/library.js',
  'js/pdf.js', 'js/summary.js', 'js/theme.js', 'dict/es.txt', 'dict/en.txt',
];
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (CDN.includes(url.hostname)) {
    // Tipografías y PDF: de la caché primero (no cambian)
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // App: red primero para recibir mejoras, caché si no hay conexión
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
