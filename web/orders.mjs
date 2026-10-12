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
