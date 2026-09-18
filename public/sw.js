// Service worker do Painel do Negócio — cacheia o essencial (HTML, ícones, e as duas bibliotecas
// externas de gráfico/PDF) na primeira visita, pra depois abrir e funcionar mesmo sem internet.
// Suba o número da versão sempre que publicar uma alteração no index.html, senão o telemóvel
// continua a mostrar a versão antiga guardada em cache.
const CACHE_VERSION = 'painel-negocio-v4';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { mode: url.startsWith('http') ? 'no-cors' : 'same-origin' })
            .then((resp) => cache.put(url, resp))
            .catch(() => {}) // uma biblioteca externa falhar aqui não deve impedir a instalação
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // guarda uma cópia pra próxima vez ficar disponível offline também
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return resp;
      }).catch(() => cached);
    })
  );
});
