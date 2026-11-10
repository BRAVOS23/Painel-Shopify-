import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMetrics,validateRecord} from '../server/model.mjs';
import {cancellationAllocations,cancellationRows,deliveryAllocations} from '../web/delivery.mjs';
const base={data:'2026-11-08',mes:'2026-11',semana:'semana2',status:'cancelado',shopifyOrderId:'10',quantidade:1,cancellationCost:90,cancellationCostDate:'2026-11-10'};
const rows=[{...base,id:'sh_10_1',shopifyLineItemId:'1',produto:'A',valor:100},{...base,id:'sh_10_2',shopifyLineItemId:'2',produto:'B',valor:200}];
const state={vendas:rows,produtos:[],ads:[],operacional:[]};
test('cancelamento não gera venda e o gasto entra uma vez em Outros na data em que ocorreu',()=>{
 const metrics=calculateMetrics(state,'2026-11-10','2026-11-10');assert.equal(metrics.orders,0);assert.equal(metrics.revenue,0);assert.equal(metrics.delivery,0);assert.equal(metrics.acquisition,0);assert.equal(metrics.other,90);assert.equal(metrics.cancellation,90);assert.equal(metrics.profit,-90);
 assert.equal(calculateMetrics(state,'2026-11-08','2026-11-08').total,0);
 assert.equal(calculateMetrics(state,'2026-11-10','2026-11-10','A').other,30);assert.equal(calculateMetrics(state,'2026-11-10','2026-11-10','B').other,60);
 assert.equal(deliveryAllocations(rows).size,0);
});
test('gasto zero, pendentes e concluídos não lançam gasto de cancelamento',()=>{
 for(const patch of [{cancellationCost:0},{status:'pendente'},{status:'concluido',panelConfirmed:true}])assert.equal(calculateMetrics({...state,vendas:rows.map(row=>({...row,...patch}))},'2026-11-10','2026-11-10').cancellation,0);
});
test('deduplicação CSV/API preserva o gasto local sem contar duas vezes',()=>{
 const legacy={...base,id:'old_csv',produto:'A',valor:300};const canonical=rows.map(({cancellationCost,cancellationCostDate,...row})=>row);
 const all=[legacy,...canonical];assert.equal(cancellationRows(all).length,2);assert.equal([...cancellationAllocations(all).values()].reduce((a,b)=>a+b,0),90);
 assert.equal(calculateMetrics({...state,vendas:all},'2026-11-10','2026-11-10').other,90);
});
test('gasto de cancelamento valida valor, precisão e data; backup mantém os campos',()=>{
 validateRecord('vendas',rows[0]);validateRecord('vendas',JSON.parse(JSON.stringify(rows[0])));
 for(const patch of [{cancellationCost:-1},{cancellationCost:1.234},{cancellationCost:1000001},{cancellationCostDate:'2026-02-30'},{cancellationCostDate:undefined}])assert.throws(()=>validateRecord('vendas',{...rows[0],...patch}));
});
