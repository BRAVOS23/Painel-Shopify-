import {safeId} from './security.mjs';
export const PAGE_SIZE=250;
export function pageOptions(input={}){
 const limit=input.limit===undefined?PAGE_SIZE:Number(input.limit);if(!Number.isInteger(limit) || limit<1 || limit>PAGE_SIZE)throw Object.assign(new Error('Tamanho de página inválido.'),{status:400});
 const after=input.after || null;if(after)safeId(after);return {limit,after};
}
export async function page(query,reference,{limit=PAGE_SIZE,after=null}={}){
 let selected=query.orderBy('__name__').limit(limit+1);if(after)selected=selected.startAfter(reference(after));
 const result=await selected.get(),docs=result.docs.slice(0,limit);
 return {docs,after:result.size>limit?docs.at(-1).id:null};
}
export async function readAll(query,{maxRecords=10000,budget={pages:0,maxPages:28},select=[]}={}){
 let selected=select.length?query.select(...select):query,after=null;const docs=[];
 if(selected.orderBy)selected=selected.orderBy('__name__');
 do{
  if(++budget.pages>budget.maxPages)throw Object.assign(new Error('O conjunto excede o limite de processamento desta instalação. Exporta os dados por páginas e contacta o suporte para ampliar a capacidade.'),{status:422,diagnosticCode:'PROCESSING_LIMIT'});
  let current=selected.limit(500);if(after)current=current.startAfter(after);
  const result=await current.get();docs.push(...result.docs);
  if(docs.length>maxRecords)throw Object.assign(new Error('O histórico excede a capacidade de cálculo desta instalação. Nenhum registo foi truncado.'),{status:422,diagnosticCode:'PROCESSING_LIMIT'});
  after=result.size===500?result.docs.at(-1).ref:null;
 }while(after);
 return {docs,size:docs.length,empty:!docs.length};
}
