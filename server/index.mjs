import {config} from './config.mjs';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createStore} from './store.mjs';
import {createProviders} from './providers.mjs';
import {createSync} from './sync.mjs';
import {createApp} from './app.mjs';
initializeApp({projectId:config.projectId});
const store=createStore(getFirestore()),providers=createProviders(config),sync=createSync(store,providers,config);
const app=createApp({store,providers,sync,auth:getAuth(),config});
const server=app.listen(config.port,'0.0.0.0',()=>console.log(`Painel iniciado na porta ${config.port} (${config.emulators ? 'emuladores' : 'produção'}).`));
let working=false;
async function work() {
  if(working) return; working=true;
  try {
    const queue=await store.db.collection('webhookQueue').where('status','==','pending').limit(100).get();
    for(const job of queue.docs) {
      const value=job.data(),release=await store.claim(value.ownerId,'shopify');
      if(!release) continue;
      try {
        const connection=(await store.connection(value.ownerId,'shopify').get()).data();
        if(!connection || connection.shop!==value.shop) {await job.ref.update({status:'ignored'});continue;}
        const {decrypt}=await import('./security.mjs'),{shopifyRecords}=await import('./model.mjs');
        const {token}=decrypt(connection.credentials,config.encryptionKey);
        const order=await providers.shopifyOrder(connection.shop,token,value.orderId),state=await store.state(value.ownerId);
        for(const record of shopifyRecords(order,state.produtos)) await store.imported(value.ownerId,'vendas',record,order.updated_at);
        await job.ref.update({status:'done',completedAt:new Date().toISOString()});
        await store.connection(value.ownerId,'shopify').update({lastSync:new Date().toISOString(),lastError:null});
      } catch(error) {
        await job.ref.update({attempts:value.attempts+1,lastError:error.message,...(value.attempts>=9 ? {status:'failed'} : {})});
        if((await store.connection(value.ownerId,'shopify').get()).exists) await store.connection(value.ownerId,'shopify').update({lastError:error.message});
      } finally {await release();}
    }
  } catch {console.error('Fila de webhooks indisponível. Nova tentativa no próximo ciclo.');}
  finally {working=false;}
}
const queueTimer=setInterval(work,5000);
let syncing=false;
const timer=setInterval(async()=>{if(syncing)return; syncing=true;try{await sync.tick();}catch{console.error('Sincronização agendada indisponível.');}finally{syncing=false;}},config.syncInterval);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{clearInterval(queueTimer);clearInterval(timer);server.close(()=>process.exit(0));});
