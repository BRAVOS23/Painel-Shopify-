import {completedSale,effectiveSales} from './sales.mjs';
// Cada linha guarda o valor do pedido; o cálculo reparte esse valor uma única vez.
export function captureDelivery(row,policy,previous=null){
 if(!completedSale(row) || row.deliveryFeeMode==='manual')return row;
 if(!previous && row.deliveryFeeMode==='auto' && Number.isFinite(row.deliveryFee) && row.deliveryFeeCapturedAt)return row;
 if(previous && completedSale(previous) && (row.deliveryFeeMode===undefined || row.deliveryFeeMode===previous.deliveryFeeMode))return {...row,...Object.fromEntries(['deliveryFee','deliveryFeeMode','deliveryFeeCapturedAt'].filter(key=>previous[key]!==undefined).map(key=>[key,previous[key]]))};
 const day=policy?.updatedAt?new Date(Date.parse(policy.updatedAt)+7200000).toISOString().slice(0,10):'';
 const eligible=policy?.enabled && (previous || (day && (row.dataPedido || row.data)>=day));
 return {...row,deliveryFeeMode:'auto',deliveryFee:eligible?policy.amount:0,deliveryFeeCapturedAt:new Date().toISOString()};
}
export function deliveryAllocations(input){
 const groups=new Map(),result=new Map();
 for(const row of effectiveSales(input).filter(completedSale)){const key=row.shopifyOrderId || row.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 for(const rows of groups.values()){
  rows.sort((a,b)=>a.id.localeCompare(b.id));const manual=rows.find(row=>row.deliveryFeeMode==='manual' && Number.isFinite(row.deliveryFee));
  if(!manual && rows.some(row=>row.comissao>0)){for(const row of rows)result.set(row.id,row.comissao || 0);continue;}
  const fee=manual?.deliveryFee ?? [...rows].filter(row=>Number.isFinite(row.deliveryFee)).sort((a,b)=>(Date.parse(a.deliveryFeeCapturedAt) || Infinity)-(Date.parse(b.deliveryFeeCapturedAt) || Infinity) || a.id.localeCompare(b.id))[0]?.deliveryFee ?? 0;
  const cents=Math.round(fee*100),revenue=rows.reduce((sum,row)=>sum+Math.max(0,row.valor || 0),0),weights=rows.map(row=>revenue?Math.max(0,row.valor || 0):row.quantidade || 1),total=weights.reduce((sum,value)=>sum+value,0);
  const shares=weights.map((weight,index)=>{const exact=cents*weight/total;return {index,cents:Math.floor(exact),fraction:exact-Math.floor(exact)};});
  let remainder=cents-shares.reduce((sum,share)=>sum+share.cents,0);for(const share of [...shares].sort((a,b)=>b.fraction-a.fraction || a.index-b.index)){if(remainder--<=0)break;share.cents++;}
  for(const share of shares)result.set(rows[share.index].id,share.cents/100);
 }
 return result;
}

export function needsDeliveryAmount(row,rows,policy){
 const group=rows.filter(item=>item.id===row.id || (row.shopifyOrderId && item.shopifyOrderId===row.shopifyOrderId));
 return !policy?.enabled && !group.some(item=>(item.deliveryFeeMode==='manual' && Number.isFinite(item.deliveryFee)) || (Number.isFinite(item.deliveryFee) && item.deliveryFeeCapturedAt) || Number(item.comissao)>0);
}

// Gasto real num cancelamento: não depende da taxa padrão e nunca conta como venda.
export function cancellationRows(input){
 const costs=new Map();for(const row of input){const key=row.shopifyOrderId || row.id;if(Number.isFinite(row.cancellationCost) && !costs.has(key))costs.set(key,{cancellationCost:row.cancellationCost,cancellationCostDate:row.cancellationCostDate});}
 return effectiveSales(input).filter(row=>row.status==='cancelado').map(row=>row.cancellationCost!==undefined?row:{...row,...costs.get(row.shopifyOrderId || row.id)});
}
export function cancellationAllocations(input){
 const rows=cancellationRows(input).filter(row=>Number.isFinite(row.cancellationCost));
 return deliveryAllocations(rows.map(row=>({...row,status:'concluido',panelConfirmed:true,deliveryFeeMode:'manual',deliveryFee:row.cancellationCost,comissao:0})));
}
