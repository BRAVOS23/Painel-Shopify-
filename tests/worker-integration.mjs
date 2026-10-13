import {createCatalog} from '../server/catalog.mjs';
// Teste do runtime Workerd real (wrangler dev), Auth/Firestore locais e sync com provedores simulados.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createFirestore} from '../worker/firestore.mjs';
import {createStore} from '../server/store.mjs';
import {createFreeSync} from '../worker/sync.mjs';
import {encrypt} from '../server/security.mjs';
const root=process.env.WORKER_TEST_URL || 'http://127.0.0.1:8787';
const db=createFirestore({project:'demo-painel',emulator:true,accessToken:async()=>'owner'}),store=createStore(db),users=[];let checks=0;
const pass=name=>{checks++;console.log('PASS: '+name);};
async function signup(label){const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${label}-${randomBytes(6).toString('hex')}@example.test`,password:'worker-test-only-password',returnSecureToken:true})});const user=await response.json();assert(response.ok);users.push(user);return user;}
async function request(user,path,body,extraHeaders={}){const response=await fetch(root+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.idToken}:{}),...extraHeaders},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,etag:response.headers.get('ETag'),body:response.status===304?null:await response.json()};}
try{
 const health=await request(null,'/api/health');assert.equal(health.status,200);assert.equal(health.body.mode,'emulator');pass('Worker real responde nos emuladores');
 assert.equal((await request(null,'/api/state')).status,401);pass('Worker exige autenticação');
 const a=await signup('worker-owner-a'),b=await signup('worker-owner-b');let state=await request(a,'/api/state');assert.equal(state.status,200);assert.equal(state.body.fluxo.length,0);pass('login Firebase verificado pela API oficial do emulador');
 const etag=state.etag;assert(etag);assert.equal((await request(a,'/api/state',null,{'If-None-Match':etag})).status,304);pass('estado inalterado devolve 304 sem reler as coleções');
 const record={id:'worker_cash',data:'2026-10-12',tipo:'entrada',valor:75,descricao:'Worker saved',observacao:''};
 const saved=await request(a,'/api/data/fluxo',{changes:[{id:record.id,record,revision:0}]});assert.equal(saved.status,200);
 state=await request(a,'/api/state',null,{'If-None-Match':etag});assert.equal(state.status,200);assert.equal(state.body.fluxo[0].valor,75);assert.notEqual(state.etag,etag);pass('Firestore REST persiste alterações e invalida ETag');
 assert.equal((await request(b,'/api/state')).body.fluxo.length,0);pass('dois negócios isolados no Worker');
 assert.equal((await request(a,'/api/data/fluxo',{changes:[{id:record.id,record:{...record,valor:999},revision:0}]})).status,409);assert.equal((await request(a,'/api/state')).body.fluxo[0].valor,75);pass('transações REST recusam revisões obsoletas');
 const metrics=await request(a,'/api/metrics?start=2026-10-12&end=2026-10-12');assert.equal(metrics.status,200);pass('métricas do servidor funcionam sem Firebase Admin ou gRPC');
 const id=a.localId,key=randomBytes(32).toString('base64');
 await store.imported(id,'produtos',{id:'worker_product',nome:'Produto Worker',custo:10,foto:''});
 await store.connection(id,'shopify').set({shop:'fixture.myshopify.com',credentials:encrypt({token:'fixture'},key)});
 const order={id:'887',created_at:'2026-10-12T08:00:00Z',updated_at:'2026-10-12T10:00:00Z',currency:'MZN',shipping_address:{name:'Cliente de teste'},line_items:Array.from({length:8},(_,index)=>({id:String(index+1),title:'Produto Worker',quantity:1,price:'100',discount_allocations:[]}))};
 let lastAfter;
 const provider={shopifyOrdersPage:async(_shop,_token,_since,_until,after)=>{lastAfter=after;return {orders:[order],after:null};},shopifyOrder:async()=>order,metaInsightsPage:async(_account,_token,_since,_until,after)=>after?{rows:[{campaign_id:'9',campaign_name:'Sem produto',spend:'5',date_start:'2026-10-12'}],after:null}:{rows:Array.from({length:5},(_,i)=>({campaign_id:String(i+1),campaign_name:'Produto Worker',spend:'10',date_start:'2026-10-12'})),after:'next'}};
 const sync=createFreeSync(store,provider,{encryptionKey:key});
 let result=await sync.run(id,'shopify');assert(result.partial);assert.equal(result.count,5);assert.equal((await store.state(id)).vendas.length,5);
 result=await sync.run(id,'shopify');assert(!result.partial);assert.equal(result.count,3);assert.equal(lastAfter,null);assert.equal((await store.state(id)).vendas.length,8);pass('importação Shopify retomada em lotes sem perder itens');
 const before=(await store.records(id,'vendas').doc('sh_887_1').get()).data().revision;
 await sync.run(id,'shopify');await sync.run(id,'shopify');assert.equal((await store.state(id)).vendas.length,8);assert.equal((await store.records(id,'vendas').doc('sh_887_1').get()).data().revision,before);pass('reimportação idêntica não duplica nem volta a gravar itens');
 await store.connection(id,'meta').set({accountId:'act_777',currency:'MZN',credentials:encrypt({token:'fixture'},key)});
 result=await sync.run(id,'meta');assert(result.partial);assert.equal((await store.state(id)).ads.length,5);
 result=await sync.run(id,'meta');assert(!result.partial);assert.equal((await store.state(id)).ads.length,6);assert.deepEqual(result.unmatched,['Sem produto']);pass('paginação Meta retoma o cursor e mantém campanhas não correspondentes');
 const job=db.doc('webhookQueue/worker-'+id);await job.set({ownerId:id,shop:'fixture.myshopify.com',orderId:'887',status:'pending',attempts:0});
 assert((await sync.processWebhook(await job.get())).partial);assert.equal((await job.get()).data().status,'pending');assert(!(await sync.processWebhook(await job.get())).partial);assert.equal((await job.get()).data().status,'done');pass('fila de webhooks retoma lote e marca concluído apenas no fim');
 const productBefore=(await store.records(id,'produtos').doc('worker_product').get()).data();
 await store.patch(id,'produtos',[{id:'worker_product',revision:productBefore.revision,record:{...productBefore.record,locais:[{id:'maputo',local:'Maputo',quantidade:6}]}}]);
 let catalogTitle='Produto da loja';const catalog=createCatalog(store,{shopifyProductsByIds:async()=>[{id:'456',title:catalogTitle}]},{encryptionKey:key});
 const binding=await catalog.bind(id,[{shopifyProductId:'456',productId:'worker_product',revision:productBefore.revision+1}]);assert.equal(binding.count,1);
 catalogTitle='Produto da loja atualizado';await catalog.refresh(id,(await store.connection(id,'shopify').get()).data());
 const linkedProduct=(await store.records(id,'produtos').doc('worker_product').get()).data().record;assert.equal(linkedProduct.nome,catalogTitle);assert.equal(linkedProduct.custo,10);assert.equal(linkedProduct.locais[0].quantidade,6);assert(linkedProduct.aliases.includes('Produto Worker'));pass('catálogo por ID e nomes atualizado via Firestore REST preserva stock/custo local');
 // O scheduler Workerd sem ligações reais não faz chamadas às plataformas.
 await store.connection(id,'shopify').delete();await store.connection(id,'meta').delete();await job.delete();
 const scheduled=await fetch(root+'/__scheduled?cron=*+*+*+*+*');assert.equal(scheduled.status,200);pass('Cron Trigger invocado no runtime Cloudflare local');
 console.log(`${checks} verificações Worker passaram; nenhuma plataforma real foi alterada.`);
}finally{
 for(const user of users){
  for(const name of ['fluxo','vendas','produtos','ads','operacional','connections','leases']){const items=await db.collection(`businesses/${user.localId}/${name}`).get();for(const item of items.docs)await item.ref.delete();}
  await db.doc(`businesses/${user.localId}`).delete();await db.doc('webhookQueue/worker-'+user.localId).delete();
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:user.idToken})});
 }
}
