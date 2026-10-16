// Browser real, API Node e Firebase locais. Sem credenciais de produção.
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const app=initializeApp({projectId:'demo-painel'},'browser-tests'),db=getFirestore(app),store=createStore(db),users=[],password='browser-test-only-password';let server;
try{
 for(const role of ['admin','customer']){const user=await getAuth(app).createUser({email:role+'-'+randomBytes(6).toString('hex')+'@example.test',password});users.push(user);await store.ensureBusiness(user.uid,user.email);}
 const [admin,customer]=users;await store.business(admin.uid).update({subscription:{status:'active',planId:'standard',revision:1,expiresAt:new Date(Date.now()+30*86400000).toISOString()}});
 const date=new Date().toISOString().slice(0,10),previous=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-2,15)).toISOString().slice(0,10);
 await store.imported(customer.uid,'produtos',{id:'nav_product',nome:'Produto de navegação',custo:20,costConfigured:true,locais:[{id:'maputo',local:'Maputo',quantidade:4}]});
 for(const [id,day,status] of [['nav_current',date,'pendente'],['nav_old',previous,'concluido']])await store.imported(customer.uid,'vendas',{id,data:day,mes:day.slice(0,7),semana:'semana3',contacto:id==='nav_old'?'Cliente antigo':'Cliente atual',produto:'Produto de navegação',quantidade:1,valor:100,status});
 const config={emulators:true,projectId:'demo-painel',webApiKey:'demo-key',authDomain:'demo-painel.firebaseapp.com',baseUrl:'http://127.0.0.1',encryptionKey:randomBytes(32).toString('base64'),adminUids:[admin.uid],requireSubscription:true};
 server=createApp({store,auth:getAuth(app),config,providers:{},sync:{}}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const child=spawn('python',['tests/browser-commercial.py'],{env:{...process.env,PAINEL_BROWSER_FIXTURE:JSON.stringify({url:'http://127.0.0.1:'+server.address().port,admin:admin.email,customer:customer.email,customerUid:customer.uid,password,expiresOn:new Date(Date.now()+20*86400000).toISOString().slice(0,10)})},stdio:'inherit'});const code=await new Promise(resolve=>child.once('exit',resolve));if(code)throw new Error('Falhou a verificação do navegador.');
}finally{server?.close();for(const user of users){for(const name of ['fluxo','vendas','produtos','ads','operacional','connections','leases'])for(const doc of (await store.business(user.uid).collection(name).get()).docs)await doc.ref.delete();for(const name of ['platformAudit','oauthStates','webhookQueue'])for(const doc of (await db.collection(name).where(name==='platformAudit'?'targetUid':'ownerId','==',user.uid).get()).docs)await doc.ref.delete();await store.business(user.uid).delete();await db.doc('accountClosures/'+user.uid).delete();await getAuth(app).deleteUser(user.uid).catch(error=>{if(error.code!=='auth/user-not-found')throw error;});}await deleteApp(app);}
