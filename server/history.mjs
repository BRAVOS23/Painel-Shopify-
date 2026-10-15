import {validDay} from '../web/orders.mjs';
import {assertWritable} from './access.mjs';
import {decrypt} from './security.mjs';
import {readAll} from './paging.mjs';
import {shopifyRecords} from './model.mjs';
export function createHistoryImport(store,providers,config){
 async function run(uid,body={action:'step'}){
  const release=await store.claim(uid,'shopify');if(!release)return {busy:true};const ref=store.connection(uid,'shopify');
  try{
   const business=(await store.business(uid).get()).data();assertWritable(business,config);const connection=(await ref.get()).data();if(!connection)throw Object.assign(new Error('Liga a Shopify primeiro.'),{status:400});
   const {token}=decrypt(connection.credentials,config.encryptionKey);let job=connection.historyImport;
   if(body.action==='cancel'){await ref.update({historyImport:null});return {cancelled:true};}
   if(body.action==='start'){
    if(!validDay(body.start) || !validDay(body.end) || body.start>body.end || Date.parse(body.end)-Date.parse(body.start)>366*86400000 || Date.parse(body.start)>Date.now())throw Object.assign(new Error('Escolhe um período passado ou atual, até 366 dias.'),{status:400});
    if(job && !job.completedAt && (job.start!==body.start || job.end!==body.end))throw Object.assign(new Error('Existe uma importação histórica em curso. Retoma-a ou cancela-a antes de escolher outro período.'),{status:409});
    if(Date.parse(body.start)<Date.now()-59*86400000 && !(await providers.shopifyScopes(connection.shop,token)).includes('read_all_orders')){await ref.update({historyReadRequired:true});throw Object.assign(new Error('Para importar esse período, reautoriza a Shopify em Integrações com acesso read_all_orders a pedidos antigos.'),{status:409,diagnosticCode:'READ_ALL_ORDERS_REQUIRED'});}
    if(!job || job.completedAt)job={start:body.start,end:body.end,since:body.start+'T00:00:00Z',until:body.end+'T23:59:59Z',after:null,offset:0,checkedOrders:0,importedLines:0,startedAt:new Date().toISOString(),completedAt:null};
   }else if(body.action!=='step')throw Object.assign(new Error('Ação de importação inválida.'),{status:400});
   if(!job)throw Object.assign(new Error('Não existe importação histórica pendente.'),{status:404});if(job.completedAt)return {partial:false,...summary(job)};
   const products=(await readAll(store.records(uid,'produtos'),{select:['record.id','record.nome','record.aliases','record.custo','record.costConfigured'],budget:{pages:0,maxPages:6}})).docs.map(doc=>doc.data().record);
   const page=job.orderId?{orders:[await providers.shopifyOrder(connection.shop,token,job.orderId)],after:job.orderNextAfter}:await providers.shopifyHistoryPage(connection.shop,token,job.since,job.until,job.after);
   const order=page.orders[0],records=page.orders.flatMap(order=>shopifyRecords(order,products,business.currency).map(record=>({record,sourceUpdatedAt:order.updated_at})));
   const offset=job.orderId && job.orderUpdatedAt!==order?.updated_at?0:job.offset || 0,chunk=records.slice(offset,offset+5);await store.importedMany(uid,'vendas',chunk);
   const remaining=offset+chunk.length<records.length;
   job={...job,importedLines:job.importedLines+chunk.length,...(remaining?{offset:offset+chunk.length,orderId:String(order.id),orderUpdatedAt:order.updated_at,orderNextAfter:page.after}:{offset:0,orderId:null,orderUpdatedAt:null,orderNextAfter:null,after:page.after,checkedOrders:job.checkedOrders+page.orders.length})};
   const partial=remaining || Boolean(page.after);if(!partial)job.completedAt=new Date().toISOString();
   await ref.update({historyImport:job,historyReadRequired:false,lastError:null});return {partial,...summary(job)};
  }catch(error){if((await ref.get()).exists)await ref.update({lastError:error.message});throw error;}
  finally{await release();}
 }
 function summary(job){return {start:job.start,end:job.end,checkedOrders:job.checkedOrders,importedLines:job.importedLines,completedAt:job.completedAt || null};}
 return {run};
}
