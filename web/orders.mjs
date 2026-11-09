export function validDay(value){
 return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
export function scheduleOrder(record,{date,time=record.horario || '',group},now=new Date().toISOString()){
 if(!['pendente','remarcado'].includes(record.status))throw new Error('Só podes reagendar pedidos pendentes ou remarcados.');
 if(!validDay(date))throw new Error('Escolhe uma data válida para a entrega.');
 if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Escolhe um horário válido.');
 const week=group || 'semana'+Math.min(4,Math.ceil(Number(date.slice(8))/7));
 if(!['semana1','semana2','semana3','semana4','remarketing','provincias'].includes(week))throw new Error('Escolhe um grupo válido.');
 const history=[...(record.reagendamentos || []),{de:record.data,para:date,semanaAnterior:record.semana || 'semana1',semanaNova:week,horario:time,alteradoEm:now}].slice(-20);
 return {...record,dataPedido:record.dataPedido || record.data,data:date,mes:date.slice(0,7),semana:week,horario:time,status:'remarcado',reagendamentos:history};
}

export function normalizeDeliveryTime(raw){
 const value=String(raw ?? '').trim();
 const match=/^(\d{1,2})(?::(\d{2}))?$/.exec(value);
 if(!match || Number(match[1])>23 || Number(match[2] || 0)>59)return '';
 return match[1].padStart(2,'0')+':'+(match[2] || '00');
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
