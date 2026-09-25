// Service worker do Painel do Negócio — cacheia o essencial (HTML, ícones, e as duas bibliotecas
// de gráfico/PDF, agora servidas pelo próprio Hosting em vez de uma CDN externa) na primeira
// visita, pra depois abrir e funcionar mesmo sem internet. Suba o número da versão sempre que
// publicar uma alteração no index.html, senão o telemóvel continua a mostrar a versão antiga.
const CACHE_VERSION = 'painel-negocio-v12';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './vendor/chart.umd.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/fonts/space-grotesk-latin-500-normal.woff2',
  './vendor/fonts/space-grotesk-latin-600-normal.woff2',
  './vendor/fonts/space-grotesk-latin-700-normal.woff2',
  './vendor/fonts/inter-latin-400-normal.woff2',
  './vendor/fonts/inter-latin-500-normal.woff2',
  './vendor/fonts/inter-latin-600-normal.woff2',
  './vendor/fonts/inter-latin-700-normal.woff2',
  './vendor/fonts/ibm-plex-mono-latin-500-normal.woff2',
  './vendor/fonts/ibm-plex-mono-latin-600-normal.woff2',
  './vendor/fonts/ibm-plex-mono-latin-700-normal.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url)
            .then((resp) => cache.put(url, resp))
            .catch(() => {}) // um ficheiro falhar aqui não deve impedir a instalação dos outros
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

  // a própria página (navegação/index.html) usa "rede primeiro": sempre tenta buscar a versão
  // mais recente quando há internet, e só cai no cache guardado se estiver mesmo offline. Com
  // "cache primeiro" (como estava antes) o telemóvel ficava preso numa versão antiga da página
  // pra sempre, mesmo online, mesmo depois de eu publicar uma correção — só o cache dos ficheiros
  // que raramente mudam (ícones, bibliotecas) continua "cache primeiro", que é seguro pra esses.
  const isNavegacao = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isNavegacao) {
    event.respondWith(
      fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // guarda uma cópia pra próxima vez ficar disponível offline também
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return resp;
      });
    })
  );
});
