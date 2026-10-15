import {validDay} from './orders.mjs';
const safeId=id=>{if(!/^[A-Za-z0-9_-]{1,180}$/.test(String(id)))throw new Error('Identificador inválido.');};
export function validateRecord(collection, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Registo inválido.');
  safeId(record.id);
  if (JSON.stringify(record).length > 600_000) throw new Error('Registo demasiado grande. Reduza a fotografia.');
  if (Object.keys(record).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Campo inválido.');
  const known = {
    fluxo: ['id','data','tipo','valor','descricao','observacao'],
    vendas: ['id','data','horario','fonte','contacto','local','descricao','produto','quantidade','valor','delivery','comissao','status','semana','mes','shopifyOrderId','shopifyLineItemId','sourceCurrency','dataPedido','reagendamentos','panelConfirmed','shopifyFinancialStatus','shopifyFulfillmentStatus','shopifyLineCount','unitCost','costCapturedAt'],
    produtos: ['id','nome','custo','foto','locais','aliases','shopifyProductId','shopifyShop','costConfigured'],
    ads: ['id','data','dataFim','nome','tipo','produto','valor','source','campaignId','campaignName','accountId','sourceCurrency','sourceValue','conversionRate','unitCost','shopifyLineCount'],
    operacional: ['id','nome','valor','data','recorrente']
  }[collection];
  if (!known || Object.keys(record).some(key => !known.includes(key))) throw new Error('Campo de registo não permitido.');
  for (const field of ['valor','custo','comissao','quantidade','sourceValue','conversionRate','unitCost','shopifyLineCount']) {
    if (field in record && (typeof record[field] !== 'number' || !Number.isFinite(record[field]) || record[field] < 0)) throw new Error('Valor numérico inválido.');
  }
  for (const field of ['data','dataFim','dataPedido','mes']) if (record[field] && !validDay(field==='mes'?record[field]+'-01':record[field])) throw new Error('Data inválida.');
  if(record.dataFim && record.dataFim<record.data)throw new Error('O fim do período não pode ser anterior ao início.');
  if (collection === 'vendas' && !['pendente','concluido','cancelado','remarcado'].includes(record.status)) throw new Error('Estado inválido.');
  if (collection === 'fluxo' && !['entrada','saida'].includes(record.tipo)) throw new Error('Movimento inválido.');
  if (collection === 'ads' && !['ads','outros'].includes(record.tipo)) throw new Error('Tipo de gasto inválido.');
  if (record.foto && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(record.foto)) throw new Error('Fotografia inválida.');
  for (const [key,value] of Object.entries(record)) {
    if (['valor','custo','comissao','quantidade','sourceValue','conversionRate','unitCost','shopifyLineCount'].includes(key)) continue;
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
    if(key==='aliases'){if(collection!=='produtos' || !Array.isArray(value) || value.length>50 || value.some(name=>typeof name!=='string' || !name.trim() || name.length>4000))throw new Error('Nomes associados inválidos.');continue;}
    if(key==='locais'){
      if(collection!=='produtos' || !Array.isArray(value) || value.length>50)throw new Error('Locais de stock inválidos.');
      const ids=new Set();
      for(const location of value){if(!location || Object.keys(location).some(field=>!['id','local','quantidade'].includes(field)))throw new Error('Local de stock inválido.');safeId(location.id);if(ids.has(location.id))throw new Error('Local de stock repetido.');ids.add(location.id);if(typeof location.local!=='string' || location.local.length>4000 || !Number.isInteger(location.quantidade) || location.quantidade<0)throw new Error('Quantidade/local de stock inválido.');}
      continue;
    }
    if(key==='panelConfirmed'){if(collection!=='vendas' || typeof value!=='boolean')throw new Error('Confirmação de venda inválida.');continue;}
    if(key==='costConfigured'){if(collection!=='produtos' || typeof value!=='boolean')throw new Error('Estado de custo inválido.');continue;}
    if (key === 'recorrente') { if (typeof value !== 'boolean') throw new Error('Recorrência inválida.'); continue; }
    if (typeof value !== 'string' || value.length > (key === 'foto' ? 550_000 : 4000)) throw new Error('Texto inválido.');
  }
  return record;
}
