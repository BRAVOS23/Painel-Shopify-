// REST Firestore e API nos emuladores; não utiliza credenciais ou contas reais.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {createFirestore} from '../worker/firestore.mjs';
import {createStore} from '../server/store.mjs';
import {createFreeSync} from '../worker/sync.mjs';
import {createApp} from '../server/app.mjs';
import {encrypt} from '../server/security.mjs';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const app=initializeApp({projectId:'demo-painel'},'meta-sync-tests'),auth=getAuth(app),store=createStore(createFirestore({project:'demo-painel',emulator:true,accessToken:async()=>'owner'}));
const config={emulators:true,projectId:'demo-painel',webApiKey:'demo-key',encryptionKey:randomBytes(32).toString('base64')};
const rows=Array.from({length:12},(_,i)=>({campaign_id:String(200+i),campaign_name:'Produto sem associação',spend:'10',date_start:'2026-11-10'}));
const requested=[],providers={metaInsightsPage:async(_account,_token,_since,_until,after)=>{requested.push(after);return after?{rows:[{...rows[0],campaign_id:'999'}],after:null}:{rows,after:'next'};}};
const sync=createFreeSync(store,providers,config),server=createApp({store,auth,providers,sync,config}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
let user;
try{
 const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'meta-sync-'+randomBytes(6).toString('hex')+'@example.test',password:'fixture-meta-sync-only',returnSecureToken:true})});assert(signup.ok);user=await signup.json();await store.ensureBusiness(user.localId);
 const call=async()=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/sync/meta',{method:'POST',headers:{Authorization:'Bearer '+user.idToken,'Content-Type':'application/json'},body:'{}'});return {status:response.status,body:await response.json()};};
 await store.connection(user.localId,'meta').set({currency:'USD',conversionRate:65,credentials:encrypt({token:'fixture-token'},config.encryptionKey)});
 const missing=await call();assert.equal(missing.status,400);assert.equal(missing.body.code,'META_ACCOUNT_REQUIRED');
 await store.connection(user.localId,'meta').update({accountId:'act_123',conversionRate:0});
 const noRate=await call();assert.equal(noRate.status,400);assert.equal(noRate.body.code,'META_RATE_REQUIRED');
 await store.connection(user.localId,'meta').update({conversionRate:65});
 for(let round=0;round<2;round++){
  const results=[];for(let n=0;n<4;n++)results.push(await call());
  assert(results.every(result=>result.status===200));assert.deepEqual(results.map(result=>result.body.count),[5,5,2,1]);assert.deepEqual(results.map(result=>result.body.partial),[true,true,true,false]);
  const state=await store.state(user.localId);assert.equal(state.ads.length,13);assert(state.ads.every(row=>row.valor===650 && row.conversionRate===65));
 }
 assert.deepEqual(requested.slice(0,4),[null,null,null,'next']);
 const connection=(await store.connection(user.localId,'meta').get()).data();assert.equal(connection.progress,null);assert(connection.lastSync);
 const imported=store.importedMany;store.importedMany=async()=>{throw new Error('private request token');};
 const failure=await call();assert.equal(failure.status,502);assert.equal(failure.body.code,'META_SYNC_WRITE');assert(!failure.body.error.includes('private request'));assert.deepEqual((await store.connection(user.localId,'meta').get()).data().credentials,connection.credentials);store.importedMany=imported;
 assert.equal((await call()).status,200);
 console.log('PASS: Meta com 13 linhas em páginas maiores que cinco retoma 5/5/2/1, converte USD, não duplica e mantém credenciais e diagnóstico após falha de gravação — Firestore REST emulado.');
}finally{
 server.close();if(user){for(const name of ['fluxo','vendas','produtos','ads','operacional','connections','leases'])for(const doc of (await store.records(user.localId,name).get()).docs)await doc.ref.delete();for(const doc of (await store.business(user.localId).collection('connections').get()).docs)await doc.ref.delete();for(const doc of (await store.business(user.localId).collection('leases').get()).docs)await doc.ref.delete();await store.business(user.localId).delete();await auth.deleteUser(user.localId);}await deleteApp(app);
}
