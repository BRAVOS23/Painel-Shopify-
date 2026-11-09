import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleOrder,rescheduleOrders,uniqueOrders} from '../web/orders.mjs';
import {validateRecord} from '../server/model.mjs';
const row={id:'legacy_order',data:'2026-09-29',mes:'2026-09',semana:'semana4',status:'remarcado',horario:'12:00',contacto:'Cliente',valor:100,quantidade:1};
test('reagendamento entre meses mantém ID e data original e calcula nova semana',()=>{
 const next=scheduleOrder(row,{date:'2026-10-03',time:'15:30'},'2026-10-01T12:00:00Z');
 assert.equal(next.id,row.id);assert.equal(next.dataPedido,'2026-09-29');assert.equal(next.mes,'2026-10');assert.equal(next.semana,'semana1');assert.equal(next.reagendamentos[0].de,row.data);assert.equal(row.mes,'2026-09');validateRecord('vendas',next);
 const again=scheduleOrder(next,{date:'2027-01-31',group:'provincias'});assert.equal(again.dataPedido,'2026-09-29');assert.equal(again.reagendamentos.length,2);assert.equal(again.horario,'15:30');
});
test('reagendamento rejeita datas impossíveis e pedidos já concluídos',()=>{
 assert.throws(()=>scheduleOrder(row,{date:'2026-02-30'}),/data válida/);assert.throws(()=>scheduleOrder({...row,status:'concluido'},{date:'2026-10-03'}),/Só podes/);assert.throws(()=>scheduleOrder(row,{date:'2026-10-03',group:'invalid'}),/grupo válido/);
 const next=scheduleOrder(row,{date:'2026-10-03'});assert.throws(()=>validateRecord('vendas',{...next,reagendamentos:[{...next.reagendamentos[0],para:'2026-02-30'}]}),/Data/);
});

test('horários de checkout aceitam hora simples e rejeitam respostas inválidas',async()=>{
 const {normalizeDeliveryTime}=await import('../web/orders.mjs');
 for(const [raw,expected] of [['23','23:00'],['15:00','15:00'],['9:30','09:30'],['0','00:00'],['88',''],['24:00',''],['12:60',''],['TESTE - NAO ENTREGAR',''],['','']])assert.equal(normalizeDeliveryTime(raw),expected);
});

test('reagendar uma linha move o pedido inteiro e mantém outros pedidos intactos',()=>{
 const rows=[{...row,id:'a',shopifyOrderId:'10'},{...row,id:'b',shopifyOrderId:'10',produto:'Outro'},{...row,id:'c',shopifyOrderId:'20'}];
 const next=rescheduleOrders(rows,['a'],{date:'2026-11-15',time:'16:00'});
 assert.deepEqual(next.slice(0,2).map(item=>[item.mes,item.horario,item.status]),[['2026-11','16:00','remarcado'],['2026-11','16:00','remarcado']]);
 assert.deepEqual(next[2],rows[2]);assert.equal(uniqueOrders(rows).length,2);
 assert.equal(next[0].reagendamentos[0].alteradoEm,next[1].reagendamentos[0].alteradoEm);
 assert.throws(()=>rescheduleOrders(rows,['missing'],{date:'2026-11-15'}),/mudou/);
});
test('reagendamento em lote rejeita concluídos e preserva originais em erro',()=>{
 const rows=[row,{...row,id:'done',status:'concluido'}];
 assert.throws(()=>rescheduleOrders(rows,['legacy_order','done'],{date:'2026-11-15'}),/Só podes/);
 assert.equal(rows[0].data,'2026-09-29');
 const next=rescheduleOrders([row,{...row,id:'manual'}],['legacy_order'],{date:'2026-11-15'});
 assert.equal(next[1].data,row.data);
});
