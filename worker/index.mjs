import {commercialConfig} from '../server/access.mjs';
import {createApi} from '../server/api.mjs';
import {createStore} from '../server/store.mjs';
import {createProviders} from '../server/providers.mjs';
import {framework} from './router.mjs';
import {createGoogle} from './google.mjs';
import {createFirestore} from './firestore.mjs';
import {createFreeSync} from './sync.mjs';
const limits=new Map();
const stateCaches=new Map();
export function createRuntime(env,fetcher=fetch){
 let calls=0;
 const boundedFetch=(url,options)=>{if(++calls>40)throw Object.assign(new Error('O lote atingiu o limite de chamadas da versão gratuita. Aguarde a próxima execução.'),{status:503});return fetcher(url,options);};
 const emulators=env.USE_FIREBASE_EMULATORS==='true';
 if(emulators && !env.FIREBASE_PROJECT_ID?.startsWith('demo-'))throw new Error('Emuladores exigem projeto demo-.');
 const config={...commercialConfig(env),emulators,projectId:env.FIREBASE_PROJECT_ID,webApiKey:env.FIREBASE_WEB_API_KEY,authDomain:env.FIREBASE_AUTH_DOMAIN,
  baseUrl:(env.APP_BASE_URL || '').replace(/\/$/,''),encryptionKey:env.INTEGRATION_ENCRYPTION_KEY || '',
  shopifyId:env.SHOPIFY_CLIENT_ID || '',shopifySecret:env.SHOPIFY_CLIENT_SECRET || '',shopifyVersion:env.SHOPIFY_API_VERSION || '2026-07',
  metaId:env.META_APP_ID || '',metaSecret:env.META_APP_SECRET || '',metaVersion:env.META_API_VERSION || 'v24.0'};
 const google=createGoogle(env,boundedFetch),db=createFirestore({project:config.projectId,accessToken:google.accessToken,emulator:emulators,fetcher:boundedFetch});
 const cacheKey=config.projectId+':'+emulators;
 if(!stateCaches.has(cacheKey))stateCaches.set(cacheKey,new Map());
 const store=createStore(db,{stateCache:stateCaches.get(cacheKey)}),providers=createProviders(config,boundedFetch),sync=createFreeSync(store,providers,config);
 return {api:createApi({store,auth:google,providers,sync,config,framework,limits}),sync,store,config};
}
function localOnly(env,url){if(env.USE_FIREBASE_EMULATORS==='true' && !['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Os emuladores só podem ser usados localmente.');}
function headers(response){const result=new Response(response.body,response);result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('Referrer-Policy','no-referrer');result.headers.set('X-Frame-Options','DENY');result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com http://127.0.0.1:9099 http://localhost:9099; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");return result;}
export default {
 async fetch(request,env){
  try{
   localOnly(env,request.url);const path=new URL(request.url).pathname;
   if(path.startsWith('/api/') || path.startsWith('/oauth/') || path.startsWith('/webhooks/'))return createRuntime(env).api.fetch(request);
   if(path==='/painel-negocio-3.html')return Response.redirect(new URL('/',request.url),302);
   return headers(await env.ASSETS.fetch(request));
  }catch{ return headers(Response.json({error:'Não foi possível iniciar o serviço. Verifique a configuração do servidor.'},{status:503})); }
 },
 async scheduled(_event,env,ctx){
  if(env.USE_FIREBASE_EMULATORS!=='true' && !env.FIREBASE_SERVICE_ACCOUNT){console.warn('Agendamento pendente: ligação Firebase não configurada.');return;}
  ctx.waitUntil(createRuntime(env).sync.tick().catch(()=>console.error('Lote automático falhou; será verificado no próximo ciclo.')));
 }
};
