import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {encode,decode,createFirestore} from '../worker/firestore.mjs';
import {createGoogle} from '../worker/google.mjs';
import {createRuntime} from '../worker/index.mjs';
import {framework} from '../worker/router.mjs';
test('Firestore REST preserva os tipos da aplicação',()=>{
 const value={null:null,string:'Maputo',integer:3,decimal:2.5,boolean:false,array:[1,'a'],nested:{record:{id:'x',valor:45}}};assert.deepEqual(decode(encode(value)),value);assert.throws(()=>encode(undefined));
});
test('conta de serviço assina JWT para Google, mantendo chave privada fora dos pedidos',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 let count=0;
 const google=createGoogle({FIREBASE_PROJECT_ID:'unit-project',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({type:'service_account',project_id:'unit-project',client_email:'test@unit-project.iam.gserviceaccount.com',private_key:privateKey,private_key_id:'unit-key'})},async(url,options)=>{
  count++;assert.equal(url,'https://oauth2.googleapis.com/token');assert(!String(options.body).includes(privateKey));const assertion=options.body.get('assertion');const [header,payload,signature]=assertion.split('.');
  assert(createVerify('RSA-SHA256').update(header+'.'+payload).verify(publicKey,Buffer.from(signature,'base64url')));assert.equal(JSON.parse(Buffer.from(payload,'base64url')).iss,'test@unit-project.iam.gserviceaccount.com');return Response.json({access_token:'test-only-token',expires_in:3600});
 });assert.equal(await google.accessToken(),'test-only-token');assert.equal(await google.accessToken(),'test-only-token');assert.equal(count,1);
});
test('token não é aceite só porque o JWT pode ser descodificado',async()=>{
 const token='header.'+Buffer.from(JSON.stringify({sub:'victim',aud:'project',iss:'https://securetoken.google.com/project',auth_time:Date.now()/1000,exp:Date.now()/1000+3600})).toString('base64url')+'.fake';
 const google=createGoogle({FIREBASE_PROJECT_ID:'project',FIREBASE_WEB_API_KEY:'public'},async()=>Response.json({error:{message:'INVALID_ID_TOKEN'}},{status:400}));await assert.rejects(google.verifyIdToken(token));
});
test('Firebase REST rejeita token revogado e de outro projeto',async()=>{
 const payload={sub:'owner',aud:'other',iss:'https://securetoken.google.com/other',auth_time:1,exp:Date.now()/1000+3600};
 const token='x.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.x';
 const google=createGoogle({FIREBASE_PROJECT_ID:'project',FIREBASE_WEB_API_KEY:'public'},async()=>Response.json({users:[{localId:'owner',emailVerified:true,validSince:'2'}]}));await assert.rejects(google.verifyIdToken(token));
});
test('credencial ausente ou de projeto diferente não dá acesso ao banco',async()=>{
 await assert.rejects(createGoogle({FIREBASE_PROJECT_ID:'p'}).accessToken(),error=>error.status===503);
 await assert.rejects(createGoogle({FIREBASE_PROJECT_ID:'p',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({type:'service_account',project_id:'other'})}).accessToken(),error=>error.status===503);
});
test('adaptador de rotas espera middleware assíncrono e mantém erros HTTP',async()=>{
 const app=framework();app.use(async(req,_res,next)=>{await Promise.resolve();req.owner='verified';next();});app.get('/api/:id',(req,res)=>res.json({id:req.params.id,owner:req.owner}));
 assert.deepEqual(await (await app.fetch(new Request('http://localhost/api/test'))).json(),{id:'test',owner:'verified'});
 const other=framework();other.use(framework.json({limit:'1mb'}));other.post('/x',(req,res)=>res.json(req.body));other.use((error,_req,res,_next)=>res.status(error.status).json({error:error.message}));assert.equal((await other.fetch(new Request('http://localhost/x',{method:'POST',body:'invalid'}))).status,400);
});
test('guardas de emuladores impedem usar projeto real como desenvolvimento',()=>{assert.throws(()=>createRuntime({USE_FIREBASE_EMULATORS:'true',FIREBASE_PROJECT_ID:'real-project'}));});
test('query com limit não interpreta resultados truncados como coleção completa',async()=>{
 const calls=[];const db=createFirestore({project:'demo-test',accessToken:async()=>'owner',fetcher:async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json([{document:{name:'projects/demo-test/databases/(default)/documents/businesses/a',fields:{ownerId:{stringValue:'a'}}}}]);}});
 assert.equal((await db.collection('businesses').limit(1).get()).size,1);assert.equal(calls[0].structuredQuery.limit,1);
});

test('falhas Firestore distinguem quota, permissões e indisponibilidade sem expor respostas',async()=>{
 for(const [reason,httpStatus,status,diagnosticCode] of [['RESOURCE_EXHAUSTED',429,429,'FIREBASE_QUOTA'],['PERMISSION_DENIED',403,503,'FIREBASE_ACCESS'],['UNAVAILABLE',503,503,'FIREBASE_UNAVAILABLE']]){
  const db=createFirestore({project:'demo-test',accessToken:async()=>'owner',fetcher:async()=>Response.json({error:{status:reason,message:'private-provider-details'}},{status:httpStatus})});
  await assert.rejects(db.doc('businesses/test').get(),error=>error.status===status && error.diagnosticCode===diagnosticCode && !error.message.includes('private-provider-details'));
 }
});

test('cache do estado reduz leituras e invalida por revisão sem misturar negócios',async()=>{
 const {createStore}=await import('../server/store.mjs');let reads=0;
 const db={doc:path=>({collection:name=>({get:async()=>{reads++;return {docs:[{data:()=>({record:{id:path+'/'+name},revision:reads})}]};}})})};
 const cache=new Map(),store=createStore(db,{stateCache:cache});
 const first=await store.state('a',1);const count=reads;first.vendas[0].id='changed';
 const again=await store.state('a',1);assert.equal(reads,count);assert.notEqual(again.vendas[0].id,'changed');
 await store.state('a',2);assert.equal(reads,count*2);assert(!cache.has('a:1'));
 await store.state('b',2);assert.equal(reads,count*3);
 for(const entry of cache.values())entry.expires=0;
 await store.state('a',2);assert.equal(reads,count*4);
});
