import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleOrder} from '../web/orders.mjs';
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
