// Apenas emuladores locais e respostas simuladas dos provedores. Nenhuma loja real é alterada.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {randomBytes,createHmac} from 'node:crypto';
import {createStore} from '../server/store.mjs';
import {createSync} from '../server/sync.mjs';
import {createApp} from '../server/app.mjs';
import {encrypt} from '../server/security.mjs';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const firebase=initializeApp({projectId:'demo-painel'},'integration'),db=getFirestore(firebase),store=createStore(db);
const config={emulators:true,projectId:'demo-painel',webApiKey:'demo-key',authDomain:'demo-painel.firebaseapp.com',encryptionKey:randomBytes(32).toString('base64'),shopifyId:'fixture-client',shopifySecret:'fixture-secret',baseUrl:'https://test.example',metaSecret:'fixture-meta'};
let order={id:'991',created_at:'2026-10-12T08:00:00Z',updated_at:'2026-10-12T09:00:00Z',currency:'MZN',shipping_address:{name:'Integration'},line_items:[{id:'1',title:'Produto A',quantity:2,price:'100',discount_allocations:[]}]};
const providers={exchangeShopify:async()=>({access_token:'fixture'}),shopifyIdentity:async shop=>({id:shop==='different.myshopify.com'?'gid://shopify/Shop/2':'gid://shopify/Shop/1',myshopifyDomain:'fixture.myshopify.com'}),registerWebhooks:async()=>{},shopifyOrders:async()=>[order],shopifyOrder:async()=>order,shopifyStatus:async(_shop,_token,_id,status)=>{order={...order,updated_at:new Date().toISOString(),...(status==='cancelado'?{cancelled_at:new Date().toISOString()}:{fulfillment_status:'fulfilled'})};return order;},metaInsights:async()=>[{campaign_id:'7',campaign_name:'Produto A',spend:'50',date_start:'2026-10-12'},{campaign_id:'8',campaign_name:'Sem produto',spend:'5',date_start:'2026-10-12'}]};
const sync=createSync(store,providers,config),server=createApp({store,auth:getAuth(firebase),providers,sync,config}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}`;
const users=[];let checks=0;
async function signup(label){
 const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${label}-${Date.now()}@example.test`,password:'test-only-password',returnSecureToken:true})});
 const body=await response.json();assert(response.ok,JSON.stringify(body));users.push(body);return body;
}
async function request(user,path,body,method=body ? 'POST' : 'GET'){
 const response=await fetch(root+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.idToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
}
function pass(label){checks++;console.log('PASS: '+label);}
try{
 const a=await signup('owner-a'),b=await signup('owner-b');
 assert.equal((await request(null,'/api/state')).status,401);pass('API exige autenticação');
 const badShop=await request(a,'/api/oauth/shopify',{shop:'https://fixture.myshopify.com/admin'});assert.equal(badShop.status,400);assert.match(badShop.body.error,/myshopify/);
 const key=config.encryptionKey;config.encryptionKey='invalid';const badKey=await request(a,'/api/oauth/shopify',{shop:'fixture.myshopify.com'});assert.equal(badKey.status,503);assert.match(badKey.body.error,/INTEGRATION_ENCRYPTION_KEY/);config.encryptionKey=key;
 const oauth=await request(a,'/api/oauth/shopify',{shop:'fixture.myshopify.com'});assert.equal(oauth.status,200);assert.equal(new URL(oauth.body.url).hostname,'fixture.myshopify.com');pass('OAuth distingue domínio inválido, chave inválida e autorização utilizável');
 async function callback(stateValue,shop){const params=new URLSearchParams({state:stateValue,shop,code:'fixture-code'});const signed=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('&');params.set('hmac',createHmac('sha256',config.shopifySecret).update(signed).digest('hex'));return request(null,'/oauth/shopify/callback?'+params);}
 const oauthState=new URL(oauth.body.url).searchParams.get('state');
 assert.match((await callback(oauthState,'different.myshopify.com')).body.error,/mesma loja/);
 assert(!(await store.connection(a.localId,'shopify').get()).exists);
 await db.doc('oauthStates/'+oauthState).set({ownerId:a.localId,provider:'shopify',shop:'fixture.myshopify.com',expiresAt:Date.now()-1000});
 assert.match((await callback(oauthState,'fixture.myshopify.com')).body.error,/expirou/);
 assert.match((await callback('a'.repeat(64),'fixture.myshopify.com')).body.error,/já foi usada/);
 pass('callback distingue domínio diferente, expiração e tentativa inexistente sem ignorar verificações');
 const aliasAttempt=await request(b,'/api/oauth/shopify',{shop:'alias.myshopify.com'});
 const aliasState=new URL(aliasAttempt.body.url).searchParams.get('state');
 // Inspecionar redirecionamento sem seguir a página HTML autenticada.
 const params=new URLSearchParams({state:aliasState,shop:'fixture.myshopify.com',code:'fixture-code'});
 params.set('hmac',createHmac('sha256',config.shopifySecret).update([...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('&')).digest('hex'));
 const aliasResponse=await fetch(root+'/oauth/shopify/callback?'+params,{redirect:'manual'});
 assert.equal(aliasResponse.status,302);assert.equal((await store.connection(b.localId,'shopify').get()).data().shop,'fixture.myshopify.com');
 await store.connection(b.localId,'shopify').delete();await db.doc('shopLinks/fixture.myshopify.com').delete();
 // A importação da ligação de teste não deve afetar o restante teste de isolamento.
 for(const doc of (await db.collection('businesses/'+b.localId+'/vendas').get()).docs)await doc.ref.delete();
 pass('aliases Shopify exigem identidade da mesma loja e guardam domínio canónico');


 const stateA=await request(a,'/api/state'),stateB=await request(b,'/api/state');assert.equal(stateA.status,200);assert.equal(stateB.status,200);
 const record={id:'manual1',data:'2026-10-12',tipo:'entrada',valor:123.45,descricao:'Negócio A',observacao:''};
 const saved=await request(a,'/api/data/fluxo',{changes:[{id:record.id,revision:0,record}]});assert.equal(saved.status,200);assert.equal(saved.body.revisions[0].revision,1);
 assert.equal((await request(b,'/api/state')).body.fluxo.length,0);assert.equal((await request(a,'/api/state')).body.fluxo[0].valor,123.45);pass('dados persistidos e isolados entre negócios');
 assert.equal((await request(a,'/api/data/fluxo',{changes:[{id:record.id,revision:0,record:{...record,valor:900}}]})).status,409);assert.equal((await request(a,'/api/state')).body.fluxo[0].valor,123.45);pass('gravação obsoleta não apaga alterações de outro aparelho');
 assert.equal((await request(a,'/api/data/connections',{changes:[]})).status,400);
 assert.equal((await request(a,'/api/data/fluxo',{changes:[{id:'bad',revision:0,record:{...record,id:'bad',valor:-1}}]})).status,400);pass('coleções privadas e valores inválidos recusados');
 const owner=a.localId;
 await store.connection(owner,'shopify').set({shop:'fixture.myshopify.com',credentials:encrypt({token:'fixture'},config.encryptionKey)});
 await store.connection(owner,'meta').set({accountId:'act_1',currency:'MZN',credentials:encrypt({token:'fixture'},config.encryptionKey)});
 await store.imported(owner,'produtos',{id:'product1',nome:'Produto A',custo:20,foto:''});
 await sync.run(owner,'shopify');await sync.run(owner,'shopify');
 let current=await store.state(owner);assert.equal(current.vendas.length,1);assert.equal(current.vendas[0].valor,200);pass('sincronização repetida Shopify não duplica pedidos');
 const first=current.vendas[0],{_revision,...withoutRevision}=first;
 await store.patch(owner,'vendas',[{id:first.id,revision:_revision,record:{...withoutRevision,delivery:'Entregador',comissao:30,semana:'semana3'}}]);
 order={...order,updated_at:'2026-10-12T10:00:00Z',fulfillment_status:'fulfilled'};await sync.run(owner,'shopify');current=await store.state(owner);
 assert.equal(current.vendas[0].delivery,'Entregador');assert.equal(current.vendas[0].comissao,30);assert.equal(current.vendas[0].semana,'semana3');assert.equal(current.vendas[0].status,'concluido');pass('atualização Shopify preserva dados operacionais e reconcilia estado');
 await sync.run(owner,'meta');await sync.run(owner,'meta');current=await store.state(owner);assert.equal(current.ads.length,2);assert.equal(current.ads.reduce((s,a)=>s+a.valor,0),55);pass('Meta não duplica gastos e inclui campanhas sem produto no total');
 const metrics=await request(a,'/api/metrics?start=2026-10-12&end=2026-10-12');assert.equal(metrics.body.delivery,30);assert.equal(metrics.body.total,125);assert.equal(metrics.body.orders,1);pass('métricas executadas no servidor incluem entregador');
 const refused=await request(b,'/api/shopify/orders/991/status',{status:'cancelado'});assert.equal(refused.status,404);assert(!order.cancelled_at);pass('outro negócio não pode cancelar o pedido Shopify');
 const remote=await request(a,'/api/shopify/orders/991/status',{status:'cancelado'});assert.equal(remote.status,200);assert.equal((await store.state(owner)).vendas[0].status,'cancelado');pass('cancelamento Shopify simulado confirmado antes de mudar o estado local');
 const connections=await request(a,'/api/connections');assert(!JSON.stringify(connections.body).includes('credentials'));assert(!JSON.stringify(connections.body).includes('fixture-secret'));pass('tokens não aparecem na resposta ao navegador');
 await db.doc('shopLinks/fixture.myshopify.com').set({ownerId:owner});
 const payload=JSON.stringify({id:991}),signature=createHmac('sha256',config.shopifySecret).update(payload).digest('base64');
 const headers={'Content-Type':'application/json','X-Shopify-Shop-Domain':'fixture.myshopify.com','X-Shopify-Topic':'orders/updated','X-Shopify-Webhook-Id':'test-'+owner,'X-Shopify-Hmac-Sha256':signature};
 assert.equal((await fetch(root+'/webhooks/shopify',{method:'POST',headers:{...headers,'X-Shopify-Hmac-Sha256':'wrong'},body:payload})).status,401);
 assert.equal((await fetch(root+'/webhooks/shopify',{method:'POST',headers,body:payload})).status,200);assert.equal((await fetch(root+'/webhooks/shopify',{method:'POST',headers,body:payload})).status,200);
 const queue=await db.collection('webhookQueue').where('ownerId','==',owner).get();assert.equal(queue.size,1);pass('webhooks assinados persistidos e entregas duplicadas deduplicadas');
 // Testar as regras reais do emulador com o token do utilizador, sem Admin SDK.
 const direct=await fetch(`http://127.0.0.1:8080/v1/projects/demo-painel/databases/(default)/documents/businesses/${owner}/connections/shopify`,{headers:{Authorization:'Bearer '+a.idToken}});
 assert.equal(direct.status,403);pass('acesso direto do navegador a credenciais Firestore bloqueado');
 console.log(`${checks} verificações de integração passaram (emuladores + provedores simulados).`);
}finally{
 for(const user of users){await db.recursiveDelete(store.business(user.localId));await getAuth(firebase).deleteUser(user.localId);}
 const links=await db.collection('shopLinks').where('ownerId','in',users.map(u=>u.localId)).get();for(const doc of links.docs)await doc.ref.delete();
 const queue=await db.collection('webhookQueue').where('ownerId','in',users.map(u=>u.localId)).get();for(const doc of queue.docs)await doc.ref.delete();
 await new Promise(resolve=>server.close(resolve));await deleteApp(firebase);
}
