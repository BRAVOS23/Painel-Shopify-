export const countOrders=rows=>new Set(rows.map(row=>row.shopifyOrderId || row.id)).size;
export function csvOrderStatus(financial,fulfillment,cancelled){
 if(cancelled || ['voided','refunded'].includes(String(financial || '').trim().toLowerCase()))return 'cancelado';
 return String(financial || '').trim().toLowerCase()==='paid' && String(fulfillment || '').trim().toLowerCase()==='fulfilled'?'concluido':'pendente';
}
export function completedSale(row){return row.status==='concluido' && (!row.shopifyOrderId || row.panelConfirmed===true || (row.shopifyFinancialStatus==='paid' && row.shopifyFulfillmentStatus==='fulfilled'));}
