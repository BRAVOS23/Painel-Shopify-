import {createCatalog} from '../server/catalog.mjs';
import {decrypt} from '../server/security.mjs';
import {shopifyRecords,metaRecords} from '../server/model.mjs';
export function createFreeSync(store,providers,config){
 async function run(uid,provider){
  const release=await store.claim(uid,provider);if(!release)return {busy:true};
  const ref=store.connection(uid,provider);
  try{
   const snapshot=await ref.get();if(!snapshot.exists)throw Object.assign(new Error('Integração não conectada.'),{status:400});
   const connection=snapshot.data(),{token}=decrypt(connection.credentials,config.encryptionKey);
   const business=(await store.business(uid).get()).data();
   const productSnapshot=await store.records(uid,'produtos').select('record.id','record.nome','record.aliases').get(),products=productSnapshot.docs.map(doc=>doc.data().record);
   const until=new Date().toISOString();
   const audit=provider==='shopify' && connection.salesPolicyVersion!==2;
   const progress=(!audit || connection.progress?.salesPolicyVersion===2?connection.progress:null) || {since:provider==='shopify'?(!audit && connection.lastSync?new Date(Date.parse(connection.lastSync)-5*60000).toISOString():new Date(Date.now()-59*86400000).toISOString()):new Date(Date.now()-30*86400000).toISOString().slice(0,10),until:provider==='shopify'?until:until.slice(0,10),after:null,offset:0,unmatched:[],salesPolicyVersion:2};
   let items,nextAfter,offset=0,more=false,orderProgress={},unmatched=progress.unmatched || [];
   if(provider==='shopify'){
    const page=progress.orderId?{orders:[await providers.shopifyOrder(connection.shop,token,progress.orderId)],after:progress.orderNextAfter}:await providers.shopifyOrdersPage(connection.shop,token,progress.since,progress.until,progress.after);
    const order=page.orders[0];
    const records=page.orders.flatMap(order=>shopifyRecords(order,products,business.currency).map(record=>({record,sourceUpdatedAt:order.updated_at})));
    const start=progress.orderId && progress.orderUpdatedAt!==order?.updated_at?0:progress.offset;
    items=records.slice(start,start+5);offset=start+items.length;
    if(offset<records.length){nextAfter=progress.after;more=true;orderProgress={orderId:String(order.id),orderUpdatedAt:order.updated_at,orderNextAfter:page.after};}else{nextAfter=page.after;offset=0;more=Boolean(nextAfter);orderProgress={orderId:null,orderUpdatedAt:null,orderNextAfter:null};}
   }else{
    if(!connection.accountId)throw new Error('Selecione a conta de anúncios antes de sincronizar.');
    if(connection.currency!==business.currency && !connection.conversionRate)throw new Error('Configure a taxa de câmbio da conta Meta.');
    const page=await providers.metaInsightsPage(connection.accountId,token,progress.since,progress.until,progress.after);
    if(page.rows.length>5)throw new Error('O Meta devolveu um lote superior ao solicitado.');
    const result=metaRecords(page.rows,products,connection.accountId,connection.currency,business.currency,connection.conversionRate || 1);
    items=result.records.map(record=>({record}));nextAfter=page.after;more=Boolean(nextAfter);unmatched=[...new Set([...unmatched,...result.unmatched])].slice(0,100);
   }
   await store.importedMany(uid,provider==='shopify'?'vendas':'ads',items);
   await ref.update({progress:more?{...progress,...orderProgress,after:nextAfter,offset,unmatched}:null,...(!more?{lastSync:provider==='shopify'?progress.until:new Date().toISOString(),...(provider==='shopify'?{salesPolicyVersion:2}:{})}:{}),lastError:null,unmatchedCampaigns:unmatched});
   return {count:items.length,unmatched,partial:more,message:more?'Importação iniciada. Os próximos lotes serão processados automaticamente.':null};
  }catch(error){if((await ref.get()).exists)await ref.update({lastError:error.message});throw error;}
  finally{await release();}
 }
 async function processWebhook(job){
  const value=job.data(),release=await store.claim(value.ownerId,'shopify');if(!release)return {busy:true};
  try{
   const connection=(await store.connection(value.ownerId,'shopify').get()).data();
   if(!connection || connection.shop!==value.shop){await job.ref.update({status:'ignored'});return {ignored:true};}
   const {token}=decrypt(connection.credentials,config.encryptionKey),order=await providers.shopifyOrder(connection.shop,token,value.orderId);
   const business=(await store.business(value.ownerId).get()).data(),snapshot=await store.records(value.ownerId,'produtos').select('record.id','record.nome','record.aliases').get();
   const records=shopifyRecords(order,snapshot.docs.map(doc=>doc.data().record),business.currency);
   const offset=value.sourceUpdatedAt===order.updated_at?(value.offset || 0):0,chunk=records.slice(offset,offset+5);
   await store.importedMany(value.ownerId,'vendas',chunk.map(record=>({record,sourceUpdatedAt:order.updated_at})));
   const complete=offset+chunk.length>=records.length;
   await job.ref.update({offset:offset+chunk.length,sourceUpdatedAt:order.updated_at,...(complete?{status:'done',completedAt:new Date().toISOString()}:{}),lastError:null});
   return {count:chunk.length,partial:!complete};
  }catch(error){await job.ref.update({attempts:(value.attempts || 0)+1,lastError:error.message,...(value.attempts>=9?{status:'failed'}:{})});throw error;}
  finally{await release();}
 }
 async function tick(){
  const pending=await store.db.collection('webhookQueue').where('status','==','pending').limit(1).get();
  if(!pending.empty)return processWebhook(pending.docs[0]);
  const ref=store.db.doc('system/freeScheduler'),scheduler=(await ref.get()).data() || {};
  let businesses=store.db.collection('businesses').limit(1);
  if(scheduler.after)businesses=businesses.startAfter(store.business(scheduler.after));
  let selected=await businesses.get();
  if(selected.empty && scheduler.after){selected=await store.db.collection('businesses').limit(1).get();}
  if(selected.empty)return {idle:true};
  const owner=selected.docs[0].id,provider=scheduler.provider || 'shopify';
  // O negócio atual volta no ciclo Meta; depois avança para o seguinte.
  const state=provider==='shopify'?{after:scheduler.after || null,provider:'meta'}:{after:owner,provider:'shopify'};
  await ref.set(state);
  const connection=(await store.connection(owner,provider).get()).data();
  if(!connection || (provider==='meta' && !connection.accountId))return {idle:true};
  if(provider==='shopify' && connection.catalogEnabled && (connection.catalogAfter || !connection.catalogLastSync || Date.now()-Date.parse(connection.catalogLastSync)>86400000)){try{await createCatalog(store,providers,config).refresh(owner,connection);}catch(error){await store.connection(owner,'shopify').update({catalogAfter:null,catalogLastSync:new Date().toISOString(),catalogLastError:error.message});}return {catalog:true};}
  if(!connection.progress && connection.lastSync && Date.now()-Date.parse(connection.lastSync)<15*60000)return {idle:true};
  return run(owner,provider);
 }
 return {run,tick,processWebhook};
}
