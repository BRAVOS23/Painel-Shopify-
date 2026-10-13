import {csvOrderStatus,completedSale,countOrders} from '../web/sales.mjs';
import {productResolver,metaProductResolver,effectiveExpenseProduct} from '../web/catalog.mjs';
export const collections = ['fluxo', 'vendas', 'produtos', 'ads', 'operacional'];
export const normalName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
export {validateRecord} from '../web/record-schema.mjs';
export function weekFor(date) {
  return `semana${Math.min(4, Math.ceil(Number(date.slice(8,10))/7))}`;
}
export function shopifyRecords(order, products = [], currency = 'MZN') {
  if (order.currency !== currency) throw new Error(`A loja usa ${order.currency}; o negócio usa ${currency}. Configure a conversão antes de importar.`);
  const date = order.created_at.slice(0,10);
  const names = new Map(products.map(p => [normalName(p.nome), p.nome]));
  const financial=String(order.financial_status || '').toLowerCase(),fulfillment=String(order.fulfillment_status || 'unfulfilled').toLowerCase();
  const status=csvOrderStatus(financial,fulfillment,order.cancelled_at);
  return (order.line_items || []).map(item => {
    const quantity = Number(item.quantity);
    const gross = Number(item.price) * quantity;
    const discounts = (item.discount_allocations || []).reduce((sum, d) => sum + Number(d.amount), 0);
    if (![gross,discounts,quantity].every(Number.isFinite)) throw new Error('Valores inválidos no pedido Shopify.');
    const address = order.shipping_address || {};
    return { id:`sh_${order.id}_${item.id}`, shopifyOrderId:String(order.id), shopifyLineItemId:String(item.id),panelConfirmed:false,shopifyFinancialStatus:financial,shopifyFulfillmentStatus:fulfillment,
      data:date, mes:date.slice(0,7), semana:weekFor(date), horario:'', fonte:'04.SHOPIFY',
      contacto:[address.name || [order.customer?.first_name,order.customer?.last_name].filter(Boolean).join(' '),address.phone || order.phone].filter(Boolean).join(' '),
      local:[address.address1,address.city].filter(Boolean).join(', '), descricao:order.note || '',
      produto:productResolver(products)(item.title), quantidade:quantity,
      valor:Math.max(0,gross-discounts), delivery:'', comissao:0, status, sourceCurrency:currency };
  });
}
export function metaRecords(rows, products, accountId, sourceCurrency, currency = 'MZN', conversionRate = 1) {
  if (sourceCurrency !== currency && !(conversionRate > 0)) throw new Error('Configure uma taxa de câmbio para a conta de anúncios.');
  const rate = sourceCurrency === currency ? 1 : conversionRate;
  const resolveCampaign=metaProductResolver(products);
  const unmatched = new Set();
  const records = rows.map(row => {
    const name=resolveCampaign(row.campaign_name);
    if (!name) unmatched.add(row.campaign_name);
    const amount = Number(row.spend);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Gasto inválido devolvido pelo Meta Ads.');
    return { id:`meta_${accountId}_${row.campaign_id}_${row.date_start}`, data:row.date_start, tipo:'ads', produto:name,
      valor:Math.round(amount*rate*100)/100, source:'meta', campaignId:String(row.campaign_id),
      campaignName:row.campaign_name, accountId, sourceCurrency, sourceValue:amount, conversionRate:rate };
  });
  return { records, unmatched:[...unmatched] };
}
export function calculateMetrics(state, start, end, product = '') {
  const resolve=productResolver(state.produtos);
  const key=value=>normalName(resolve(value));
  const match = p => !product || key(p)===key(product);
  const sales = state.vendas.filter(v => completedSale(v) && v.data >= start && v.data <= end && match(v.produto));
  const expenses=state.ads.filter(a=>(a.dataFim || a.data)>=start && a.data<=end && match(effectiveExpenseProduct(a,state.produtos)));
  const days=(first,last)=>Math.round((Date.parse(last+'T00:00:00Z')-Date.parse(first+'T00:00:00Z'))/86400000)+1;
  const allocated=expense=>expense.valor*days(expense.data>start?expense.data:start,(expense.dataFim || expense.data)<end?(expense.dataFim || expense.data):end)/days(expense.data,expense.dataFim || expense.data);
  const costs = new Map(state.produtos.map(p => [normalName(p.nome), p.custo]));
  const acquisition = sales.reduce((s,v) => s+(costs.get(key(v.produto)) || 0)*(v.quantidade || 1),0);
  const delivery = sales.reduce((s,v) => s+(v.comissao || 0),0);
  const ads = expenses.filter(a => a.tipo === 'ads').reduce((s,a) => s+allocated(a),0);
  const other = expenses.filter(a => a.tipo === 'outros').reduce((s,a) => s+allocated(a),0);
  let operational = 0;
  if (!product) for (const expense of state.operacional) {
    if (!expense.recorrente) { if (expense.data >= start && expense.data <= end) operational += expense.valor; continue; }
    for (let date=new Date(`${start}T00:00:00Z`); date<=new Date(`${end}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1)) {
      if (date.toISOString().slice(0,10)>=expense.data) operational += expense.valor/new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    }
  }
  const revenue = sales.reduce((s,v) => s+v.valor,0), total=acquisition+delivery+ads+other+operational;
  const orders = new Set(sales.map(v => v.shopifyOrderId || v.id)).size;
  const statusReviewOrders=countOrders(state.vendas.filter(v=>v.shopifyOrderId && v.status==='concluido' && !v.panelConfirmed && !v.shopifyFinancialStatus && v.data>=start && v.data<=end && match(v.produto)));
  return {statusReviewOrders, acquisition, delivery, ads, other, operational, total, revenue, orders, profit:revenue-total, missingProductCount:sales.filter(sale=>sale.produto && (!costs.has(key(sale.produto)) || state.produtos.some(p=>normalName(p.nome)===key(sale.produto) && p.costConfigured===false))).length,
    cpa:orders ? ads/orders : null, roas:ads ? revenue/ads : null, roi:total ? (revenue-total)/total*100 : null };
}
