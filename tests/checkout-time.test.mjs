import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeDeliveryTime} from '../web/orders.mjs';
import {shopifyRecords} from '../server/model.mjs';
test('API Shopify lê hora do checkout em atributos REST e GraphQL',()=>{
 const order={id:1,currency:'MZN',created_at:'2026-11-09',line_items:[{id:2,title:'Produto',quantity:1,price:'100'}]};
 for(const attribute of [{name:'Hora da entrega',value:'15:00'},{key:'Horário da entrega',value:'23'}])assert.equal(shopifyRecords({...order,note_attributes:[attribute]})[0].horario,normalizeDeliveryTime(attribute.value));
 assert.equal(shopifyRecords({...order,note_attributes:[{name:'Hora da entrega',value:'88'}]})[0].horario,'');
});
test('reimportar CSV preenche todas as linhas sem hora e preserva horários e reagendamentos',()=>{
 const html=readFileSync(new URL('../painel-negocio-3.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('function importarCSVShopifyNativo(){'),html.indexOf('/* ---- Sincronização direta'));
 const header=['Id','Financial Status','Fulfillment Status','Cancelled at','Created at','Note Attributes'];
 const rows=[header,['123','pending','unfulfilled','','2026-11-08','Hora da entrega: 15:00']];
 const vendas=[{id:'a',horario:''},{id:'b',horario:''},{id:'c',horario:'12:00'},{id:'d',horario:'',reagendamentos:[{data:'2026-11-10'}]}].map(row=>({...row,shopifyOrderId:'123',status:'pendente'}));
 let saved=false,error=false;
 const context={document:{getElementById:()=>({files:[{}]})},FileReader:class{readAsText(){this.onload({target:{result:''}});}},parseCSV:()=>rows,produtosData:[],vendasData:vendas,loadShopifyFieldMap:()=>({horario:'hora da entrega'}),parseNoteAttributes:()=>({'hora da entrega':'15:00'}),normalizeHorario:normalizeDeliveryTime,window:{csvOrderStatus:()=> 'pendente'},showShopifyNativeMsg:(_message,isError)=>{error ||= !!isError;},saveVendas:()=>{saved=true;},renderVendasAll:()=>{}};
 vm.runInNewContext(code+'\nimportarCSVShopifyNativo();',context);
 assert.equal(error,false);assert.equal(saved,true);assert.deepEqual(Array.from(context.vendasData,row=>row.horario),['15:00','15:00','12:00','']);assert.equal(context.vendasData.length,4);
});
