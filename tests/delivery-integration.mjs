import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {randomBytes} from 'node:crypto';
import {createStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const firebase=initializeApp({projectId:'demo-painel'},'delivery-tests'),db=getFirestore(firebase),store=createStore(db),users=[];
const config={emulators:true,projectId:'demo-painel',webApiKey:'demo-key',adminUids:[]};
const server=createApp({store,auth:getAuth(firebase),config,providers:{},sync:{}}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root='http://127.0.0.1:'+server.address().port;
async function call(user,path,body){const response=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.idToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
async function signup(){const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'delivery-'+randomBytes(6).toString('hex')+'@example.test',password:'delivery-test-only-password',returnSecureToken:true})});const user=await response.json();assert(response.ok);users.push(user);await call(user,'/api/account');return user;}
const day=new Date(Date.now()+7200000).toISOString().slice(0,10),metrics='/api/metrics?start='+day+'&end='+day;
async function patch(user,rows){const saved=(await call(user,'/api/state')).body.vendas;return call(user,'/api/data/vendas',{changes:rows.map(record=>({id:record.id,revision:saved.find(row=>row.id===record.id)?._revision || 0,record}))});}
try{
 const owner=await signup(),other=await signup();assert.equal((await call(owner,'/api/delivery-policy',{enabled:true,amount:-1,revision:0})).status,400);assert.equal((await call(owner,'/api/delivery-policy',{enabled:true,amount:150,revision:0})).status,200);
 assert.equal((await call(owner,'/api/delivery-policy',{enabled:true,amount:200,revision:0})).status,409);assert.equal((await call(other,'/api/account')).body.deliveryPolicy,null);
 const base={data:day,mes:day.slice(0,7),semana:'semana1',status:'pendente',quantidade:1,shopifyOrderId:'43',panelConfirmed:false};
 const pending=[{...base,id:'line_a',produto:'A',valor:100},{...base,id:'line_b',produto:'B',valor:200}];assert.equal((await patch(owner,pending)).status,200);assert.equal((await call(owner,metrics)).body.delivery,0);
 const done=pending.map(row=>({...row,status:'concluido',panelConfirmed:true}));const result=await patch(owner,done);assert.equal(result.status,200);assert(result.body.revisions.every(row=>row.record.deliveryFee===150));assert.equal((await call(owner,metrics)).body.delivery,150);assert.equal((await call(owner,metrics+'&product=A')).body.delivery,50);
 assert.equal((await call(owner,'/api/delivery-policy',{enabled:true,amount:200,revision:1})).status,200);assert.equal((await call(owner,metrics)).body.delivery,150);
 // O caminho das integrações também captura na transição e conserva as conclusões.
 for(const row of done)await store.imported(owner.localId,'vendas',row);assert.equal((await call(owner,metrics)).body.delivery,150);
 const autoSaved=(await call(owner,'/api/state')).body.vendas;const manual=autoSaved.map(({_revision,...row})=>({...row,deliveryFeeMode:'manual',deliveryFee:0}));assert.equal((await patch(owner,manual)).status,200);assert.equal((await call(owner,metrics)).body.delivery,0);
 for(const row of done)await store.imported(owner.localId,'vendas',row);assert.equal((await call(owner,metrics)).body.delivery,0);
 const single={id:'new_delivery',deliveryFeeMode:'auto',data:day,mes:day.slice(0,7),status:'concluido',produto:'A',quantidade:1,valor:400};assert.equal((await patch(owner,[single])).status,200);assert.equal((await call(owner,metrics)).body.delivery,200);
 const exported=(await call(owner,'/api/account/export')).body;assert.equal(exported.profile.deliveryPolicy.amount,200);config.requireSubscription=true;assert.equal((await call(owner,'/api/delivery-policy',{enabled:false,amount:0,revision:2})).status,402);
 console.log('PASS: taxa por negócio, isolamento, revisão, conclusão de vários itens, conservação após alteração/sync, valor zero e exportação');
}finally{server.close();for(const user of users){for(const name of ['fluxo','vendas','produtos','ads','operacional','connections','leases'])for(const doc of (await store.business(user.localId).collection(name).get()).docs)await doc.ref.delete();await store.business(user.localId).delete();await getAuth(firebase).deleteUser(user.localId);}await deleteApp(firebase);}
