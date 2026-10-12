// Cache apenas da interface pública. Nunca guardar respostas autenticadas nem tokens.
const VERSION='painel-cloud-__BUILD_VERSION__';
const SHELL=['/','/manifest.json','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-512-maskable.png','/assets/app.js?v=__BUILD_VERSION__','/assets/dashboard.js?v=__BUILD_VERSION__'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(VERSION);
 await Promise.all(SHELL.map(async path=>{try{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response);}catch{}}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if((name.startsWith('painel-cloud-') || name.startsWith('painel-negocio-')) && name!==VERSION)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET' || url.origin!==self.location.origin || /^\/(api|oauth|webhooks|cdn-cgi)(\/|$)/.test(url.pathname))return;
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{try{return await fetch(event.request);}catch{return await caches.match('/') || new Response('Sem ligação. Ligue-se à internet para entrar e guardar dados.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}})());return;
 }
 if(!/^\/(assets|vendor\/fonts|icons)\//.test(url.pathname) && url.pathname!=='/manifest.json')return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION),cached=await cache.match(event.request);if(cached)return cached;
  const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;
 })());
});
