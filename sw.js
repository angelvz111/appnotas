// Permite usar la app sin internet: al instalarse guarda la app, los diccionarios, las tipografías
// (versión latina) y los lectores de PDF, para que todo funcione aunque nunca se hayan usado con wifi.
const CACHE = 'freenotas-v5';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'js/main.js', 'js/util.js', 'js/db.js', 'js/paper.js', 'js/ink.js', 'js/assets.js', 'js/model.js', 'js/dict.js',
  'js/handwriting.js', 'js/materials.js', 'js/stickerize.js', 'js/trainer.js', 'js/editor.js', 'js/assistant.js', 'js/library.js',
  'js/pdf.js', 'js/summary.js', 'js/theme.js', 'dict/es.txt', 'dict/en.txt',
];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
];
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
const cacheIfMissing = (cache, u) => cache.match(u).then((hit) => hit || fetch(u).then((r) => r.ok && cache.put(u, r)));

// Descarga la hoja de Google Fonts que usa index.html y todas sus tipografías (latín y latín extendido)
async function cacheFonts(cache) {
  const html = await (await fetch('index.html', { cache: 'no-cache' })).text();
  const href = /href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
  if (!href) return;
  const res = await fetch(href);
  if (!res.ok) return;
  await cache.put(href, res.clone());
  const css = await res.text();
  const urls = [];
  for (const block of css.split('/*').slice(1)) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (subset !== 'latin' && subset !== 'latin-ext') continue;
    const m = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(block);
    if (m) urls.push(m[1]);
  }
  await Promise.allSettled([...new Set(urls)].map((u) => cacheIfMissing(cache, u)));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    // Lo opcional no detiene la instalación si en ese momento no hay internet
    await Promise.allSettled([cacheFonts(cache), ...LIBS.map((u) => cacheIfMissing(cache, u))]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Pasa las tipografías y librerías ya guardadas en versiones anteriores, para no descargarlas otra vez
    const cache = await caches.open(CACHE);
    for (const k of await caches.keys()) {
      if (k === CACHE) continue;
      const old = await caches.open(k);
      for (const req of await old.keys()) {
        if (CDN.includes(new URL(req.url).hostname) && !(await cache.match(req))) {
          const r = await old.match(req);
          if (r) await cache.put(req, r);
        }
      }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
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
  // App: red primero para recibir mejoras; si no hay conexión, lo guardado
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
