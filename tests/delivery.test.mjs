import test from 'node:test';
import assert from 'node:assert/strict';
import {captureDelivery,deliveryAllocations} from '../web/delivery.mjs';
import {calculateMetrics} from '../server/model.mjs';
const base={data:'2026-11-06',status:'concluido',shopifyOrderId:'10',shopifyFinancialStatus:'paid',shopifyFulfillmentStatus:'fulfilled',quantidade:1};
const rows=[{...base,id:'a',produto:'A',valor:100},{...base,id:'b',produto:'B',valor:200}];
const policy={enabled:true,amount:150,updatedAt:'2026-11-06T08:00:00Z'};
test('taxa padrão é única por pedido e repartida nos filtros por produto',()=>{
 const sales=rows.map(row=>captureDelivery(row,policy));const fees=deliveryAllocations(sales);assert.equal(fees.get('a'),50);assert.equal(fees.get('b'),100);
 const state={vendas:sales,produtos:[],ads:[],operacional:[]};assert.equal(calculateMetrics(state,'2026-11-06','2026-11-06').delivery,150);assert.equal(calculateMetrics(state,'2026-11-06','2026-11-06','A').delivery,50);assert.equal(calculateMetrics(state,'2026-11-06','2026-11-06','B').delivery,100);
});
test('alterações de taxa mantêm conclusões antigas e pendentes só capturam ao concluir',()=>{
 const saved=captureDelivery(rows[0],policy);assert.equal(captureDelivery(saved,{...policy,amount:200},saved).deliveryFee,150);
 const {deliveryFee,deliveryFeeMode,deliveryFeeCapturedAt,...oldClient}=saved;assert.equal(captureDelivery(oldClient,{...policy,amount:200},saved).deliveryFee,150);
 assert.deepEqual(captureDelivery(saved,{...policy,amount:200}),saved);
 const pending={...rows[0],status:'pendente'};assert.equal(captureDelivery(pending,policy).deliveryFee,undefined);assert.equal(captureDelivery(rows[0],policy,pending).deliveryFee,150);
 const legacy={...rows[0],data:'2026-10-01',comissao:80};assert.equal(captureDelivery(legacy,policy,legacy).deliveryFee,undefined);assert.equal(deliveryAllocations([legacy]).get('a'),80);
 assert.equal(captureDelivery({...rows[0],data:'2026-10-01'},policy).deliveryFee,0);
 assert.equal(captureDelivery(rows[0],{enabled:false}).deliveryFee,0);
});
test('valor específico pode ser zero; cancelados não geram custo e cêntimos fecham',()=>{
 const manual=rows.map(row=>({...row,deliveryFeeMode:'manual',deliveryFee:0,comissao:99}));assert.equal([...deliveryAllocations(manual).values()].reduce((a,b)=>a+b,0),0);
 assert.equal(deliveryAllocations([{...rows[0],status:'cancelado',deliveryFee:150}]).size,0);
 const thirds=Array.from({length:3},(_,index)=>({...rows[0],id:'r'+index,deliveryFee:1}));assert.equal([...deliveryAllocations(thirds).values()].reduce((a,b)=>a+b,0),1);
 const late={...rows[1],deliveryFee:200,deliveryFeeCapturedAt:'2026-11-07T10:00:00Z'},early={...rows[0],deliveryFee:150,deliveryFeeCapturedAt:'2026-11-06T10:00:00Z'};assert.equal([...deliveryAllocations([late,early]).values()].reduce((a,b)=>a+b,0),150);
});
