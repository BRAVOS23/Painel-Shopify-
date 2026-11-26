export function validDay(value){
 return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
export function deliveryGroup(group,date){
 if(group!=='provincias')return group;
 return 'semana'+Math.min(4,Math.ceil((Number(date?.slice(8,10)) || 1)/7));
}
export function scheduleOrder(record,{date,time=record.horario || '',group},now=new Date().toISOString()){
 if(!['pendente','remarcado'].includes(record.status))throw new Error('Só podes reagendar pedidos pendentes ou remarcados.');
 if(!validDay(date))throw new Error('Escolhe uma data válida para a entrega.');
 if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Escolhe um horário válido.');
 const week=group || 'semana'+Math.min(4,Math.ceil(Number(date.slice(8))/7));
 if(!['semana1','semana2','semana3','semana4','remarketing','provincias','aguarda_sinal'].includes(week))throw new Error('Escolhe um grupo válido.');
 const history=[...(record.reagendamentos || []),{de:record.data,para:date,semanaAnterior:record.semana || 'semana1',semanaNova:week,horario:time,alteradoEm:now}].slice(-20);
 return {...record,dataPedido:record.dataPedido || record.data,data:date,mes:date.slice(0,7),semana:week,horario:time,status:'remarcado',reagendamentos:history};
}

export function normalizeDeliveryTime(raw){
 const value=String(raw ?? '').trim();
 const match=/^(\d{1,2})(?:\s*[:.h]\s*(\d{2})(?::[0-5]\d)?|\s*h)?\s*(am|pm)?$/i.exec(value);
 if(!match)return '';
 const [,hour,minute='00',period]=match;
 const hours=Number(hour);
 if(Number(minute)>59 || (period?(hours<1 || hours>12):hours>23))return '';
 return String(period?hours%12+(period.toLowerCase()==='pm'?12:0):hours).padStart(2,'0')+':'+minute;
}

export function deliveryTimeFields(raw){
 const value=String(raw ?? '');
 const horario=normalizeDeliveryTime(value);
 return {horario,horarioPreferencia:horario || !value.trim()?'':value.slice(0,4000)};
}

export function shopifyDeliveryTime(attributes=[]){
 let preference='';

 const labels=new Set(['hora da entrega','horario da entrega','horario de entrega','hora de entrega','horario','hora preferida','horario preferido','preferencia de entrega','data e hora da entrega','data e horario de entrega','data e hora de entrega','data e horario da entrega','dia e hora de entrega','hora','delivery time','preferred delivery time','delivery date and time']);
 for(const attribute of attributes){
  const label=String(attribute.name || attribute.key || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
  if(labels.has(label)){
   const fields=deliveryTimeFields(attribute.value);
   if(fields.horario)return fields;
   preference ||= fields.horarioPreferencia;
  }
 }
 return deliveryTimeFields(preference);
}

export function appendAlternateContact(contact,alternative){
 const current=String(contact || '').trim(),extra=String(alternative || '').trim();
 const digits=extra.replace(/\D/g,'');
 if(digits.length<7 || digits.length>15)return current;
 const key=digits.slice(-9);
 const existing=current.match(/\+?\d[\d ()-]{5,}\d/g) || [];
 if(existing.some(phone=>phone.replace(/\D/g,'').slice(-9)===key))return current;
 return [current,extra].filter(Boolean).join(' / ');
}

// A operação é por pedido, mesmo quando a Shopify o divide por produtos.
export const orderKey=row=>String(row.shopifyOrderId || row.id);
export function uniqueOrders(rows){return [...new Map(rows.map(row=>[orderKey(row),row])).values()];}
export function rescheduleOrders(rows,ids,options,now=new Date().toISOString()){
 if(!ids.length || ids.some(id=>!rows.some(row=>row.id===id)))throw new Error('Um pedido mudou entretanto. Fecha e abre novamente o reagendamento.');
 const selected=rows.filter(row=>ids.includes(row.id));
 if(selected.some(row=>!['pendente','remarcado'].includes(row.status)))throw new Error('Só podes reagendar pedidos pendentes ou remarcados.');
 const keys=new Set(selected.map(orderKey));
 return rows.map(row=>keys.has(orderKey(row)) && ['pendente','remarcado'].includes(row.status)?scheduleOrder(row,options,now):row);
}

export function todayDeliveryScope(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
 return {month:parts.year+'-'+parts.month,week:'semana'+Math.min(4,Math.ceil(Number(parts.day)/7))};
}
