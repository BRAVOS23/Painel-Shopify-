import { safeId } from './security.mjs';
export const collections = ['fluxo', 'vendas', 'produtos', 'ads', 'operacional'];
export const normalName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
export function validateRecord(collection, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Registo inválido.');
  safeId(record.id);
  if (JSON.stringify(record).length > 600_000) throw new Error('Registo demasiado grande. Reduza a fotografia.');
  if (Object.keys(record).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Campo inválido.');
  const known = {
    fluxo: ['id','data','tipo','valor','descricao','observacao'],
    vendas: ['id','data','horario','fonte','contacto','local','descricao','produto','quantidade','valor','delivery','comissao','status','semana','mes','shopifyOrderId','shopifyLineItemId','sourceCurrency','dataPedido','reagendamentos'],
    produtos: ['id','nome','custo','foto','locais'],
    ads: ['id','data','dataFim','nome','tipo','produto','valor','source','campaignId','campaignName','accountId','sourceCurrency','sourceValue','conversionRate'],
    operacional: ['id','nome','valor','data','recorrente']
  }[collection];
  if (!known || Object.keys(record).some(key => !known.includes(key))) throw new Error('Campo de registo não permitido.');
  for (const field of ['valor','custo','comissao','quantidade','sourceValue','conversionRate']) {
    if (field in record && (typeof record[field] !== 'number' || !Number.isFinite(record[field]) || record[field] < 0)) throw new Error('Valor numérico inválido.');
  }
  for (const field of ['data','dataFim','dataPedido','mes']) if (record[field] && !new RegExp(field !== 'mes' ? '^\\d{4}-\\d{2}-\\d{2}$' : '^\\d{4}-\\d{2}$').test(record[field])) throw new Error('Data inválida.');
  if(record.dataFim && record.dataFim<record.data)throw new Error('O fim do período não pode ser anterior ao início.');
  if (collection === 'vendas' && !['pendente','concluido','cancelado','remarcado'].includes(record.status)) throw new Error('Estado inválido.');
  if (collection === 'fluxo' && !['entrada','saida'].includes(record.tipo)) throw new Error('Movimento inválido.');
  if (collection === 'ads' && !['ads','outros'].includes(record.tipo)) throw new Error('Tipo de gasto inválido.');
  if (record.foto && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(record.foto)) throw new Error('Fotografia inválida.');
  for (const [key,value] of Object.entries(record)) {
    if (['valor','custo','comissao','quantidade','sourceValue','conversionRate'].includes(key)) continue;
    if(key==='reagendamentos'){
      if(collection!=='vendas' || !Array.isArray(value) || value.length>20)throw new Error('Histórico de reagendamentos inválido.');
      for(const item of value){
        if(!item || Object.keys(item).some(field=>!['de','para','semanaAnterior','semanaNova','horario','alteradoEm'].includes(field)))throw new Error('Reagendamento inválido.');
        for(const field of ['de','para'])if(!/^\d{4}-\d{2}-\d{2}$/.test(item[field] || '') || !Number.isFinite(Date.parse(item[field]+'T12:00:00Z')) || new Date(item[field]+'T12:00:00Z').toISOString().slice(0,10)!==item[field])throw new Error('Data de reagendamento inválida.');
        for(const field of ['semanaAnterior','semanaNova'])if(!['semana1','semana2','semana3','semana4','remarketing','provincias'].includes(item[field]))throw new Error('Grupo de reagendamento inválido.');
        if(typeof item.horario!=='string' || (item.horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.horario)) || typeof item.alteradoEm!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(item.alteradoEm) || !Number.isFinite(Date.parse(item.alteradoEm)))throw new Error('Horário de reagendamento inválido.');
      }
      continue;
    }
    if(key==='locais'){
      if(collection!=='produtos' || !Array.isArray(value) || value.length>50)throw new Error('Locais de stock inválidos.');
      const ids=new Set();
      for(const location of value){if(!location || Object.keys(location).some(field=>!['id','local','quantidade'].includes(field)))throw new Error('Local de stock inválido.');safeId(location.id);if(ids.has(location.id))throw new Error('Local de stock repetido.');ids.add(location.id);if(typeof location.local!=='string' || location.local.length>4000 || !Number.isInteger(location.quantidade) || location.quantidade<0)throw new Error('Quantidade/local de stock inválido.');}
      continue;
    }
    if (key === 'recorrente') { if (typeof value !== 'boolean') throw new Error('Recorrência inválida.'); continue; }
    if (typeof value !== 'string' || value.length > (key === 'foto' ? 550_000 : 4000)) throw new Error('Texto inválido.');
  }
  return record;
}
export function weekFor(date) {
  return `semana${Math.min(4, Math.ceil(Number(date.slice(8,10))/7))}`;
}
export function shopifyRecords(order, products = [], currency = 'MZN') {
  if (order.currency !== currency) throw new Error(`A loja usa ${order.currency}; o negócio usa ${currency}. Configure a conversão antes de importar.`);
  const date = order.created_at.slice(0,10);
  const names = new Map(products.map(p => [normalName(p.nome), p.nome]));
  const status = order.cancelled_at ? 'cancelado' : order.fulfillment_status === 'fulfilled' ? 'concluido' : 'pendente';
  return (order.line_items || []).map(item => {
    const quantity = Number(item.quantity);
    const gross = Number(item.price) * quantity;
    const discounts = (item.discount_allocations || []).reduce((sum, d) => sum + Number(d.amount), 0);
    if (![gross,discounts,quantity].every(Number.isFinite)) throw new Error('Valores inválidos no pedido Shopify.');
    const address = order.shipping_address || {};
    return { id:`sh_${order.id}_${item.id}`, shopifyOrderId:String(order.id), shopifyLineItemId:String(item.id),
      data:date, mes:date.slice(0,7), semana:weekFor(date), horario:'', fonte:'04.SHOPIFY',
      contacto:[address.name || [order.customer?.first_name,order.customer?.last_name].filter(Boolean).join(' '),address.phone || order.phone].filter(Boolean).join(' '),
      local:[address.address1,address.city].filter(Boolean).join(', '), descricao:order.note || '',
      produto:names.get(normalName(item.title)) || item.title, quantidade:quantity,
      valor:Math.max(0,gross-discounts), delivery:'', comissao:0, status, sourceCurrency:currency };
  });
}
function campaignProductName(value){
 const text=String(value || '').trim();
 // Apenas uma data final: não remover números do produto nem nomes de outros produtos.
 const match=text.match(/^(.*?)\s+(?:[-–—|]\s*)?[([]?((?:\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2}))|(?:\d{4}-\d{2}-\d{2}))[)\]]?$/);
 if(!match)return text;
 const parts=match[2].split(/[/.\-]/).map(Number);
 let [day,month,year]=parts;if(parts[0]>999)[year,month,day]=parts;else if(year<100)year+=2000;
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day)return text;
 return match[1].trim();
}
export function metaRecords(rows, products, accountId, sourceCurrency, currency = 'MZN', conversionRate = 1) {
  if (sourceCurrency !== currency && !(conversionRate > 0)) throw new Error('Configure uma taxa de câmbio para a conta de anúncios.');
  const rate = sourceCurrency === currency ? 1 : conversionRate;
  const names=new Map();
  for(const product of products){const key=normalName(product.nome);if(!names.has(key))names.set(key,new Set());names.get(key).add(product.nome);}
  const unique=key=>names.get(key)?.size===1?[...names.get(key)][0]:'';
  const unmatched = new Set();
  const records = rows.map(row => {
    const name=unique(normalName(row.campaign_name)) || unique(normalName(campaignProductName(row.campaign_name))) || '';
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
  const match = p => !product || normalName(p) === normalName(product);
  const sales = state.vendas.filter(v => v.status === 'concluido' && v.data >= start && v.data <= end && match(v.produto));
  const expenses=state.ads.filter(a=>(a.dataFim || a.data)>=start && a.data<=end && match(a.produto));
  const days=(first,last)=>Math.round((Date.parse(last+'T00:00:00Z')-Date.parse(first+'T00:00:00Z'))/86400000)+1;
  const allocated=expense=>expense.valor*days(expense.data>start?expense.data:start,(expense.dataFim || expense.data)<end?(expense.dataFim || expense.data):end)/days(expense.data,expense.dataFim || expense.data);
  const costs = new Map(state.produtos.map(p => [normalName(p.nome), p.custo]));
  const acquisition = sales.reduce((s,v) => s+(costs.get(normalName(v.produto)) || 0)*(v.quantidade || 1),0);
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
  return { acquisition, delivery, ads, other, operational, total, revenue, orders, profit:revenue-total, missingProductCount:sales.filter(sale=>sale.produto && !costs.has(normalName(sale.produto))).length,
    cpa:orders ? ads/orders : null, roas:ads ? revenue/ads : null, roi:total ? (revenue-total)/total*100 : null };
}
