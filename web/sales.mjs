import {productResolver} from './catalog.mjs';
export const countOrders=rows=>new Set(rows.map(row=>row.shopifyOrderId || row.id)).size;
export function csvOrderStatus(financial,fulfillment,cancelled){
 if(cancelled || ['voided','refunded'].includes(String(financial || '').trim().toLowerCase()))return 'cancelado';
 return String(financial || '').trim().toLowerCase()==='paid' && String(fulfillment || '').trim().toLowerCase()==='fulfilled'?'concluido':'pendente';
}
export function completedSale(row){return row.status==='concluido' && (!row.shopifyOrderId || row.panelConfirmed===true || (row.shopifyFinancialStatus==='paid' && row.shopifyFulfillmentStatus==='fulfilled'));}

// Prefere as linhas canónicas da API a resumos CSV antigos do mesmo pedido.
// Não altera nem apaga os registos brutos; as cópias continuam nos backups.
export function effectiveSales(rows){
 const groups=new Map();for(const row of rows){if(!row.shopifyOrderId)continue;const key=String(row.shopifyOrderId);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const selected=new Map();
 for(const [id,items] of groups){
  const canonical=items.filter(row=>row.shopifyLineItemId && row.id===`sh_${id}_${row.shopifyLineItemId}`);
  if(!canonical.length)continue;
  const expected=Math.max(...canonical.map(row=>row.shopifyLineCount || 0));
  // Durante uma primeira importação incompleta, o resumo legado permanece como referência.
  if(expected>canonical.length){const legacy=items.filter(row=>!canonical.includes(row));if(legacy.length)selected.set(id,legacy);continue;}
  const confirmed=items.some(row=>row.panelConfirmed===true),cancelled=canonical.some(row=>row.status==='cancelado');
  selected.set(id,confirmed && !cancelled?canonical.map(row=>row.status==='pendente'?{...row,status:'concluido',panelConfirmed:true}:row):canonical);
 }
 const emitted=new Set(),result=[];
 for(const row of rows){const id=String(row.shopifyOrderId || '');if(!selected.has(id)){result.push(row);continue;}if(!emitted.has(id)){result.push(...selected.get(id));emitted.add(id);}}
 return result;
}
export function saleCost(row,products){
 if(Number.isFinite(row.unitCost))return row.unitCost;
 const resolve=productResolver(products),name=resolve(row.produto).toLowerCase(),product=products.find(item=>String(item.nome).trim().toLowerCase()===name);
 return product && product.costConfigured!==false && Number.isFinite(product.custo)?product.custo:null;
}
export function captureSaleCost(row,products,{force=false}={}){
 if(row.status!=='concluido')return row;
 const next={...row};if(force){delete next.unitCost;delete next.costCapturedAt;}
 const cost=saleCost(next,products);if(next.unitCost===undefined && cost!==null){next.unitCost=cost;next.costCapturedAt=new Date().toISOString();}
 return next;
}
