import {effectiveSales,captureSaleCost} from '../web/sales.mjs';
import {reconciledStatus} from '../server/status-audit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {orderSummary,sourceCounts,orderSeries} from '../web/order-reports.mjs';
const rows=[{id:'a1',shopifyOrderId:'1',fonte:'04.SHOPIFY',data:'2026-10-02',status:'concluido',panelConfirmed:true,valor:100},{id:'a2',shopifyOrderId:'1',fonte:'04.SHOPIFY',data:'2026-10-02',status:'concluido',panelConfirmed:true,valor:50},{id:'manual',fonte:'05.OUTRO',data:'2026-10-03',status:'remarcado',valor:80},{id:'cancel',fonte:'04.SHOPIFY',data:'2026-10-04',status:'cancelado',valor:200},{id:'legacy',shopifyOrderId:'2',fonte:'04.SHOPIFY',data:'2026-10-05',status:'concluido',valor:300}];
test('relatórios contam pedidos únicos por fonte e excluem receita não confirmada',()=>{
 assert.deepEqual(sourceCounts(rows),{'04.SHOPIFY':3,'05.OUTRO':1});
 assert.deepEqual(orderSummary(rows),{total:4,done:1,open:1,review:1,cancelled:1,rescheduled:1,revenue:150});
});
test('evolução diária inclui dias vazios sem acumular receita ou contar itens como pedidos',()=>{
 const series=orderSeries(rows,'2026-10-01','2026-10-05');assert.equal(series.unit,'dia');assert.deepEqual(series.labels,['01/10','02/10','03/10','04/10','05/10']);assert.deepEqual(series.orders,[0,1,1,1,1]);assert.deepEqual(series.done,[0,1,0,0,0]);assert.deepEqual(series.revenue,[0,150,0,0,0]);
 assert.equal(orderSeries(rows,'2026-10-03','2026-10-05').revenue.reduce((sum,value)=>sum+value,0),0);
});
test('períodos longos agrupam por semana ou mês preservando os totais',()=>{
 const weekly=orderSeries(rows,'2026-10-01','2027-01-01'),monthly=orderSeries(rows,'2026-01-01','2026-12-31');assert.equal(weekly.unit,'semana');assert.equal(monthly.unit,'mês');for(const series of [weekly,monthly]){assert.equal(series.orders.reduce((sum,value)=>sum+value,0),4);assert.equal(series.revenue.reduce((sum,value)=>sum+value,0),150);}
 assert.deepEqual(orderSeries([],null,null).labels,[]);
});

test('reconciliação mantém confirmações explícitas e reagendamentos, mas confirma processados e pagos antigos',()=>{
 const row={id:'legacy',status:'cancelado',data:'2026-01-01',valor:100,comissao:10};
 const paid={financial_status:'paid',fulfillment_status:'fulfilled',cancelled_at:null};assert.equal(reconciledStatus(row,paid).status,'concluido');assert.equal(reconciledStatus(row,{...paid,financial_status:'pending'}).status,'pendente');assert.equal(reconciledStatus({...row,status:'remarcado'},{...paid,fulfillment_status:'unfulfilled'}).status,'remarcado');assert.equal(reconciledStatus({...row,status:'concluido',panelConfirmed:true},{...paid,financial_status:'pending'}).status,'concluido');
 const cancelled=reconciledStatus({...row,panelConfirmed:true},{...paid,cancelled_at:'2026-10-13'});assert.equal(cancelled.status,'cancelado');assert.equal(cancelled.panelConfirmed,false);assert.equal(cancelled.comissao,10);assert.equal(cancelled.data,'2026-01-01');
});

test('importação canónica incompleta não substitui antecipadamente o resumo CSV',()=>{
 const legacy={id:'csv',shopifyOrderId:'9',valor:200,status:'concluido',panelConfirmed:true},one={id:'sh_9_1',shopifyOrderId:'9',shopifyLineItemId:'1',shopifyLineCount:2,valor:100,status:'pendente'},two={...one,id:'sh_9_2',shopifyLineItemId:'2'};
 assert.deepEqual(effectiveSales([legacy,one]),[legacy]);const complete=effectiveSales([legacy,one,two]);assert.equal(complete.length,2);assert(complete.every(row=>row.panelConfirmed && row.status==='concluido'));
});
test('custo capturado não muda ao editar o catálogo e não inventa custo desconhecido',()=>{
 const row={id:'x',produto:'Produto',status:'concluido'},cost=captureSaleCost(row,[{nome:'Produto',custo:20}]);assert.equal(cost.unitCost,20);assert.equal(captureSaleCost(cost,[{nome:'Produto',custo:100}]).unitCost,20);assert.equal(captureSaleCost(row,[{nome:'Produto',custo:0,costConfigured:false}]).unitCost,undefined);assert.equal(row.unitCost,undefined);
});
