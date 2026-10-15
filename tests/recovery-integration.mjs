// Backup, recuperação e histórico exclusivamente em emuladores e provedores simulados.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {encrypt} from '../server/security.mjs';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const firebase=initializeApp({projectId:'demo-painel'},'recovery-tests'),db=getFirestore(firebase),store=createStore(db),users=[],folder=await mkdtemp(join(tmpdir(),'painel-recovery-'));
const config={emulators:true,projectId:'demo-painel',webApiKey:'demo-key',encryptionKey:randomBytes(32).toString('base64'),adminUids:[],baseUrl:'https://test.example'};
let scopes=['read_orders'],remoteCalls=0;
const order={id:'99112',created_at:'2026-01-12T10:00:00Z',updated_at:'2026-01-14T10:00:00Z',currency:'MZN',financial_status:'paid',fulfillment_status:'fulfilled',line_items:Array.from({length:8},(_,i)=>({id:String(i+1),title:'Produto teste',quantity:1,price:'100',discount_allocations:[]}))};
const providers={shopifyScopes:async()=>scopes,shopifyHistoryPage:async(_shop,_token,since,until,after)=>{remoteCalls++;assert.equal(since,'2026-01-01T00:00:00Z');assert.equal(until,'2026-01-31T23:59:59Z');assert.equal(after,null);return {orders:[order],after:null};},shopifyOrder:async()=>{remoteCalls++;return order;}};
const server=createApp({store,auth:getAuth(firebase),config,providers,sync:{}}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root='http://127.0.0.1:'+server.address().port;
async function signup(){const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'recovery-'+randomBytes(6).toString('hex')+'@example.test',password:'recovery-test-only-password',returnSecureToken:true})});const user=await response.json();assert(response.ok);users.push(user);await call(user,'/api/account');return user;}
async function call(user,path,body){const response=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.idToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
async function cli(script,user,args,expected=0){const child=spawn(process.execPath,['scripts/'+script,'--url',root,...args],{env:{...process.env,PAINEL_ID_TOKEN:user.idToken},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,expected,output);return output;}
try{
 const source=await signup(),destination=await signup();await store.imported(source.localId,'produtos',{id:'product_test',nome:'Produto teste',custo:20,costConfigured:true,locais:[{id:'local',local:'Maputo',quantidade:5}]});await store.connection(source.localId,'shopify').set({shop:'fixture.myshopify.com',credentials:encrypt({token:'secret-fixture-token'},config.encryptionKey)});
 let result=await call(source,'/api/shopify/history',{action:'start',start:'2026-01-01',end:'2026-01-31'});assert.equal(result.status,409);assert.equal(remoteCalls,0);scopes.push('read_all_orders');
 result=await call(source,'/api/shopify/history',{action:'start',start:'2026-01-01',end:'2026-01-31'});assert.equal(result.status,200);assert(result.body.partial);assert.equal((await store.state(source.localId)).vendas.length,5);
 assert.equal((await call(source,'/api/shopify/history',{action:'start',start:'2026-02-01',end:'2026-02-28'})).status,409);
 result=await call(source,'/api/shopify/history',{action:'step'});assert.equal(result.body.partial,false);assert.equal(result.body.checkedOrders,1);assert.equal(result.body.importedLines,8);assert.equal((await store.state(source.localId)).vendas.length,8);assert.equal((await store.state(source.localId)).vendas[0].unitCost,20);
 assert.equal((await call(source,'/api/shopify/history',{action:'step'})).body.importedLines,8);console.log('PASS: histórico exige escopo, retoma oito itens e não duplica nem altera a Shopify');
 const file=join(folder,'account.painel-backup.json');await cli('backup-account.mjs',source,['--out',file]);const content=await readFile(file,'utf8');assert(!content.includes('secret-fixture-token'));assert.equal((await stat(file)).mode & 0o777,0o600);assert.equal(JSON.parse(content).records.vendas.length,8);
 await cli('restore-account.mjs',destination,['--file',file],1);assert.equal((await store.state(destination.localId)).vendas.length,0);
 await cli('restore-account.mjs',destination,['--file',file,'--allow-new-account']);assert.equal((await store.state(destination.localId)).vendas.length,0);
 await cli('restore-account.mjs',destination,['--file',file,'--allow-new-account','--apply']);assert.equal((await store.state(destination.localId)).vendas.length,8);assert.equal((await store.state(destination.localId)).produtos[0].locais[0].quantidade,5);
 await cli('restore-account.mjs',destination,['--file',file,'--allow-new-account','--resume','--apply']);assert.equal((await store.state(destination.localId)).vendas.length,8);
 const product=(await store.records(destination.localId,'produtos').doc('product_test').get()).data();await store.patch(destination.localId,'produtos',[{id:'product_test',revision:product.revision,record:{...product.record,custo:99}}]);await cli('restore-account.mjs',destination,['--file',file,'--allow-new-account','--resume','--apply'],1);assert.equal((await store.state(destination.localId)).produtos[0].custo,99);
 console.log('PASS: backup privado e restauro com prévia, identidade, repetição segura e recusa de conflito');
}finally{server.close();for(const user of users){for(const name of ['fluxo','vendas','produtos','ads','operacional','connections','leases']){for(const doc of (await store.business(user.localId).collection(name).get()).docs)await doc.ref.delete();}await store.business(user.localId).delete();await getAuth(firebase).deleteUser(user.localId);}await deleteApp(firebase);await rm(folder,{recursive:true,force:true});}
