// A Meta pode devolver mais linhas que o limite pedido. O lote de escrita
// continua pequeno e retoma a mesma página antes de avançar o cursor.
export function metaBatch(page,progress={}){
 if(!Array.isArray(page?.rows) || (page.after!=null && (typeof page.after!=='string' || !page.after)))throw Object.assign(new Error('A Meta devolveu uma página de gastos inválida. Tenta sincronizar novamente.'),{status:502,diagnosticCode:'META_INVALID_RESPONSE'});
 if(page.rows.length>1000)throw Object.assign(new Error('A página de gastos Meta excede a capacidade deste lote. A importação foi parada sem descartar registos.'),{status:503,diagnosticCode:'META_PAGE_LIMIT'});
 const key=JSON.stringify(page.rows.map(row=>[row?.campaign_id,row?.date_start]));
 const start=progress.metaPageKey===key && Number.isSafeInteger(progress.offset) && progress.offset>=0 && progress.offset<page.rows.length?progress.offset:0;
 const rows=page.rows.slice(start,start+5),offset=start+rows.length,pending=offset<page.rows.length;
 return {rows,after:pending?(progress.after || null):(page.after || null),more:pending || Boolean(page.after),offset:pending?offset:0,metaPageKey:pending?key:null};
}
export function metaSyncFailure(error,stage){
 if(error.status)return error;
 const descriptions={PREPARE:'preparar a importação',READ_TOKEN:'ler a autorização guardada',READ_CATALOG:'consultar o catálogo do painel',FETCH:'consultar os gastos na Meta',NORMALIZE:'validar os gastos devolvidos pela Meta',WRITE:'guardar os gastos no painel',PROGRESS:'guardar o progresso da importação'};
 return Object.assign(new Error('Não foi possível '+(descriptions[stage] || descriptions.PREPARE)+'. A ligação foi mantida. Tenta sincronizar novamente.'),{status:502,diagnosticCode:'META_SYNC_'+(descriptions[stage]?stage:'PREPARE')});
}
