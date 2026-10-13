import {decrypt} from './security.mjs';
import {csvOrderStatus} from '../web/sales.mjs';
export function reconciledStatus(row,remote){
 const incoming=csvOrderStatus(remote.financial_status,remote.fulfillment_status,remote.cancelled_at);
 const confirmed=incoming!=='cancelado' && row.panelConfirmed===true;
 return {...row,status:incoming==='pendente'?(confirmed?'concluido':row.status==='remarcado'?'remarcado':'pendente'):incoming,panelConfirmed:confirmed,shopifyFinancialStatus:remote.financial_status,shopifyFulfillmentStatus:remote.fulfillment_status};
}
export function createStatusAudit(store,providers,config){
 async function run(uid,{restart=false}={}){
  const release=await store.claim(uid,'shopify');if(!release)return {busy:true};
  const ref=store.connection(uid,'shopify');
  try{
   const connection=(await ref.get()).data();if(!connection)throw Object.assign(new Error('Ligue a Shopify antes de verificar os pedidos.'),{status:400});
   let audit=connection.statusAudit;
   if(!audit || restart){
    const saved=await store.records(uid,'vendas').select('record.shopifyOrderId').get();
    const {token}=decrypt(connection.credentials,config.encryptionKey),hasAllOrders=providers.shopifyScopes?(await providers.shopifyScopes(connection.shop,token)).includes('read_all_orders'):null;
    const ids=[...new Set(saved.docs.map(doc=>doc.data().record?.shopifyOrderId).filter(id=>/^\d+$/.test(id || '')))];
    audit={version:1,ids,hasAllOrders,cursor:0,rowOffset:0,checked:0,unavailable:0,startedAt:new Date().toISOString(),completedAt:null};
   }
   if(audit.completedAt && !restart)return {partial:false,checked:audit.checked,total:audit.ids.length,unavailable:audit.unavailable,requiresAllOrders:audit.unavailable>0 && audit.hasAllOrders===false};
   const ids=audit.ids.slice(audit.cursor,audit.cursor+5),{token}=decrypt(connection.credentials,config.encryptionKey);
   if(ids.length){
    const states=await providers.shopifyOrderStatuses(connection.shop,token,ids),byId=new Map(states.map(order=>[String(order.id),order]));
    const owned=await store.records(uid,'vendas').where('record.shopifyOrderId','in',ids).get();
    const stamp=JSON.stringify(states.map(order=>[order.id,order.updated_at,order.financial_status,order.fulfillment_status,order.cancelled_at]).sort());
    const offset=audit.rowStamp===stamp?(audit.rowOffset || 0):0;
    const items=owned.docs.filter(doc=>byId.has(doc.data().record.shopifyOrderId)).sort((a,b)=>a.id.localeCompare(b.id)).map(doc=>{const row=doc.data().record,remote=byId.get(row.shopifyOrderId);return {record:reconciledStatus(row,remote),sourceUpdatedAt:remote.updated_at,statusOnly:true};});
    const chunk=items.slice(offset,offset+10);await store.importedMany(uid,'vendas',chunk);
    if(offset+chunk.length<items.length){audit={...audit,rowOffset:offset+chunk.length,rowStamp:stamp};}
    else audit={...audit,cursor:audit.cursor+ids.length,checked:audit.checked+states.length,unavailable:audit.unavailable+ids.filter(id=>!byId.has(id)).length,rowOffset:0,rowStamp:null};
   }
   const partial=audit.cursor<audit.ids.length;if(!partial)audit.completedAt=new Date().toISOString();
   await ref.update({statusAudit:audit,lastError:null});
   return {partial,checked:audit.checked,total:audit.ids.length,unavailable:audit.unavailable,requiresAllOrders:audit.unavailable>0 && audit.hasAllOrders===false,message:partial?'A verificar os estados dos pedidos guardados na Shopify…':audit.unavailable?(audit.hasAllOrders===false?'Alguns pedidos antigos não puderam ser consultados. Reautoriza a Shopify em Integrações para pedir o acesso read_all_orders a pedidos com mais de 60 dias.':'Alguns pedidos não estão disponíveis na Shopify. Os seus dados no painel foram preservados.'):null};
  }catch(error){if((await ref.get()).exists)await ref.update({lastError:error.message});throw error;}
  finally{await release();}
 }
 return {run};
}
