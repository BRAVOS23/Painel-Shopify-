// Só emuladores e provedores simulados. Não executa cobranças nem altera plataformas reais.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {randomBytes,createHmac} from 'node:crypto';
import {createStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {LEGAL_VERSION} from '../server/access.mjs';
import {encrypt} from '../server/security.mjs';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const firebase=initializeApp({projectId:'demo-painel'},'commercial-tests'),db=getFirestore(firebase),store=createStore(db),users=[];
const config={emulators:true,projectId:'demo-painel',webApiKey:'demo-key',encryptionKey:randomBytes(32).toString('base64'),baseUrl:'https://test.example',shopifyId:'fixture',shopifySecret:'fixture-secret',adminUids:[],requireSubscription:true};
let remoteWrites=0,checks=0;
const providers={shopifyStatus:async()=>{remoteWrites++;},exchangeShopify:async()=>{remoteWrites++;return {access_token:'never-needed'};}},sync={run:async()=>{remoteWrites++;}};
const server=createApp({store,auth:getAuth(firebase),config,providers,sync}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root='http://127.0.0.1:'+server.address().port;
async function signup(){const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'commercial-'+randomBytes(7).toString('hex')+'@example.test',password:'commercial-test-only-password',returnSecureToken:true})});const user=await response.json();assert(response.ok);users.push(user);return user;}
async function call(user,path,body,method=body?'POST':'GET',headers={}){const response=await fetch(root+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.idToken}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:response.status===304?null:await response.json(),etag:response.headers.get('ETag')};}
const pass=label=>{checks++;console.log('PASS: '+label);};
const expiresOn=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
try{
 const admin=await signup(),customer=await signup(),closed=await signup();config.adminUids.push(admin.localId);
 for(const user of users)assert.equal((await call(user,'/api/account')).status,200);
 assert.equal((await call(null,'/api/admin/businesses')).status,401);assert.equal((await call(customer,'/api/admin/businesses')).status,403);
 const sale={id:'manual_sale',data:'2026-10-15',mes:'2026-10',semana:'semana3',status:'concluido',produto:'Produto',quantidade:1,valor:100,unitCost:10};
 assert.equal((await call(customer,'/api/data/vendas',{changes:[{id:sale.id,revision:0,record:sale}]})).status,402);assert.equal((await call(customer,'/api/shopify/orders/1/status',{status:'concluido'})).status,402);assert.equal((await call(customer,'/api/sync/shopify',{})).status,402);assert.equal(remoteWrites,0);pass('cliente sem plano não grava nem provoca mutações remotas; administração é isolada');
 assert.equal((await call(customer,'/api/account/access-request',{})).status,200);await call(customer,'/api/account/access-request',{});assert.equal((await store.business(customer.localId).get()).data().activationRequestStatus,'pending');
 const grant={requestId:'grant-'+randomBytes(8).toString('hex'),revision:0,planId:'standard',status:'active',expiresOn,method:'manual'};
 assert.equal((await call(customer,'/api/admin/businesses/'+customer.localId+'/subscription',grant)).status,403);
 assert.equal((await call(admin,'/api/admin/businesses/'+customer.localId+'/subscription',grant)).status,200);assert((await call(admin,'/api/admin/businesses/'+customer.localId+'/subscription',grant)).body.replayed);
 assert.equal((await call(admin,'/api/admin/businesses/'+customer.localId+'/subscription',{...grant,amount:99})).status,409);assert.equal((await call(admin,'/api/admin/businesses/'+customer.localId+'/subscription',{...grant,requestId:'different-request-001'})).status,409);
 assert.equal((await call(customer,'/api/data/vendas',{changes:[{id:sale.id,revision:0,record:sale}]})).status,200);pass('ativação manual tem revisão, idempotência e registo administrativo sem cobrar');
 const audit=(await call(admin,'/api/admin/audit')).body;assert.equal(audit.events.length,1);assert.equal(audit.events[0].actorId,admin.localId);assert(!JSON.stringify(audit).includes(config.encryptionKey));
 const firstPage=(await call(admin,'/api/admin/businesses?limit=1')).body;assert(firstPage.after);const second=(await call(admin,'/api/admin/businesses?limit=1&after='+firstPage.after)).body;assert.notEqual(firstPage.businesses[0].uid,second.businesses[0].uid);pass('lista administrativa é paginada e não expõe credenciais');
 // 601 linhas comprovam a remoção da barreira de 500 no caminho real da API.
 for(let start=0;start<600;start+=300){const batch=db.batch();for(let index=start;index<start+300;index++){const record={...sale,id:'paged_'+String(index).padStart(4,'0')};batch.set(store.records(customer.localId,'vendas').doc(record.id),{record,revision:1});}await batch.commit();}
 await store.business(customer.localId).update({dataVersion:10,usage:{counts:{vendas:601,produtos:0,ads:0,operacional:0,fluxo:0}}});
 const manifest=await call(customer,'/api/state?manifest=1');assert.equal(manifest.body.ownerId,customer.localId);assert.equal((await call(customer,'/api/state?manifest=1',null,'GET',{'If-None-Match':manifest.etag})).status,304);
 let after=null,ids=[];do{const result=await call(customer,'/api/state/vendas?version=10'+(after?'&after='+after:''));assert.equal(result.status,200);ids.push(...result.body.records.map(row=>row.id));after=result.body.after;}while(after);assert.equal(ids.length,601);assert.equal(new Set(ids).size,601);
 assert.equal((await call(customer,'/api/state')).body.vendas.length,601);const metrics=(await call(customer,'/api/metrics?start=2026-10-15&end=2026-10-15')).body;assert.equal(metrics.orders,601);assert.equal(metrics.revenue,60100);assert.equal(metrics.acquisition,6010);
 assert.equal((await call(admin,'/api/state/vendas?version=0')).body.records.length,0);assert.equal((await call(customer,'/api/state/connections?version=10')).status,400);pass('mais de 500 registos carregam e calculam sem truncar ou misturar negócios');
 const extra={...sale,id:'changed_page'};await call(customer,'/api/data/vendas',{changes:[{id:extra.id,revision:0,record:extra}]});assert.equal((await call(customer,'/api/state/vendas?version=10')).status,409);pass('paginação rejeita mistura de versões quando o negócio muda');
 const subscription=(await store.business(customer.localId).get()).data().subscription;await store.business(customer.localId).update({subscription:{...subscription,expiresAt:new Date(Date.now()-1000).toISOString()}});
 assert.equal((await call(customer,'/api/account')).body.access.status,'expired');assert.equal((await call(customer,'/api/data/vendas',{changes:[{id:'forbidden',revision:0,record:{...sale,id:'forbidden'}}]})).status,402);assert.equal((await call(customer,'/api/state')).status,200);assert.equal((await call(customer,'/api/account/export')).status,200);assert.equal((await call(customer,'/api/metrics?start=2026-10-15&end=2026-10-15')).status,200);pass('validade expirada bloqueia edição mas preserva consulta e exportação');
 await store.business(customer.localId).update({subscription});config.legalApproved=true;config.operatorName='Operador de teste';config.supportEmail='support@example.test';assert.equal((await call(customer,'/api/data/vendas',{changes:[{id:'legal_record',revision:0,record:{...sale,id:'legal_record'}}]})).status,428);assert.equal((await call(customer,'/api/account/legal',{version:'old',accept:true})).status,409);assert.equal((await call(customer,'/api/account/legal',{version:LEGAL_VERSION,accept:true})).status,200);assert.equal((await call(customer,'/api/data/vendas',{changes:[{id:'legal_record',revision:0,record:{...sale,id:'legal_record'}}]})).status,200);config.legalApproved=false;pass('aceitação de documentos publicados é registada no servidor e respeita a versão');
 // OAuth iniciado enquanto ativo não pode gravar credenciais após suspensão.
 const oauth=await call(customer,'/api/oauth/shopify',{shop:'fixture.myshopify.com'});assert.equal(oauth.status,200);await store.business(customer.localId).update({subscription:{...subscription,status:'suspended'}});
 const params=new URLSearchParams({state:new URL(oauth.body.url).searchParams.get('state'),shop:'fixture.myshopify.com',code:'fixture'});params.set('hmac',createHmac('sha256',config.shopifySecret).update([...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('&')).digest('hex'));
 assert.equal((await call(null,'/oauth/shopify/callback?'+params)).status,402);assert.equal(remoteWrites,0);pass('callback OAuth também respeita suspensão antes de trocar códigos');
 await store.imported(closed.localId,'vendas',{...sale,id:'private_close'});await store.connection(closed.localId,'shopify').set({shop:'closure.myshopify.com',credentials:encrypt({token:'fixture-private-token'},config.encryptionKey)});await db.doc('shopLinks/closure.myshopify.com').set({ownerId:closed.localId});
 assert(!JSON.stringify((await call(closed,'/api/account/export')).body).includes('fixture-private-token'));
 assert.equal((await call(admin,'/api/account/closure',{action:'start',confirmation:'ELIMINAR'})).status,409);assert.equal((await call(closed,'/api/account/closure',{action:'start',confirmation:'wrong'})).status,401);
 let closure=await call(closed,'/api/account/closure',{action:'start',confirmation:'ELIMINAR'});assert.equal(closure.status,200);assert.equal((await call(closed,'/api/state')).status,423);
 for(let attempt=0;!closure.body.done && attempt<30;attempt++)closure=await call(closed,'/api/account/closure',{action:'step'});
 assert(closure.body.done);assert.equal((await store.business(closed.localId).get()).data().accountStatus,'closed');assert.equal((await store.records(closed.localId,'vendas').get()).size,0);assert(!(await db.doc('shopLinks/closure.myshopify.com').get()).exists);assert.equal((await store.records(customer.localId,'vendas').get()).size,603);pass('eliminação exige confirmação e sessão recente, é retomável e não toca noutro negócio');
 console.log(`${checks} verificações comerciais passaram; apenas emuladores foram alterados.`);
}finally{
 server.close();for(const user of users){for(const name of ['fluxo','vendas','produtos','ads','operacional','connections','leases']){const result=await store.business(user.localId).collection(name).get();for(let offset=0;offset<result.size;offset+=400){const batch=db.batch();for(const doc of result.docs.slice(offset,offset+400))batch.delete(doc.ref);await batch.commit();}}for(const name of ['oauthStates','webhookQueue','platformAudit']){const field=name==='platformAudit'?'targetUid':'ownerId';for(const doc of (await db.collection(name).where(field,'==',user.localId).get()).docs)await doc.ref.delete();}await store.business(user.localId).delete();await db.doc('accountClosures/'+user.localId).delete();await getAuth(firebase).deleteUser(user.localId);}await db.doc('shopLinks/closure.myshopify.com').delete();await deleteApp(firebase);
}
