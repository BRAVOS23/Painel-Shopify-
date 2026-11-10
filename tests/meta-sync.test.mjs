import test from 'node:test';
import assert from 'node:assert/strict';
import {metaBatch,metaSyncFailure} from '../server/meta-sync.mjs';
import {metaRecords} from '../server/model.mjs';
const rows=Array.from({length:12},(_,i)=>({campaign_id:String(i+1),campaign_name:'Produto',spend:'10',date_start:'2026-11-10'}));
test('página Meta grande retoma os cinco registos seguintes antes de avançar o cursor',()=>{
 const page={rows,after:'next'},a=metaBatch(page,{after:'current'}),b=metaBatch(page,{after:a.after,offset:a.offset,metaPageKey:a.metaPageKey}),c=metaBatch(page,{after:b.after,offset:b.offset,metaPageKey:b.metaPageKey});
 assert.deepEqual([a.rows.length,b.rows.length,c.rows.length],[5,5,2]);assert.equal(a.after,'current');assert.equal(b.after,'current');assert.equal(c.after,'next');assert.equal(c.offset,0);assert.deepEqual([...a.rows,...b.rows,...c.rows],rows);
 const empty=metaBatch({rows:[],after:null});assert.equal(empty.more,false);assert.equal(empty.rows.length,0);
 const last=metaBatch({rows,after:null});assert.equal(last.more,true);
});
test('mudança das linhas da página reinicia o lote sem saltar registos',()=>{
 const a=metaBatch({rows,after:null});const changed=[{...rows[0],campaign_id:'999'},...rows.slice(1)];assert.equal(metaBatch({rows:changed,after:null},a).rows[0].campaign_id,'999');
 for(const page of [{},{rows:null},{rows,after:42},{rows:Array(1001).fill(rows[0])}])assert.throws(()=>metaBatch(page),error=>error.status>=502 && error.diagnosticCode.startsWith('META_'));
});
test('falhas de sincronização identificam a etapa sem expor erro privado e mantêm diagnósticos conhecidos',()=>{
 const error=metaSyncFailure(new Error('secret-token-and-url'),'WRITE');assert.equal(error.diagnosticCode,'META_SYNC_WRITE');assert.equal(error.status,502);assert(!error.message.includes('secret-token'));
 const known=Object.assign(new Error('Firebase indisponível'),{status:503,diagnosticCode:'FIREBASE_UNAVAILABLE'});assert.equal(metaSyncFailure(known,'WRITE'),known);
});
test('gastos Meta inválidos não passam como zeros nem provocam HTTP 500 sem código',()=>{
 for(const patch of [{spend:null},{spend:false},{spend:''},{spend:'invalid'},{spend:'-1'},{date_start:'2026-02-30'},{campaign_id:''},{campaign_name:undefined}])assert.throws(()=>metaRecords([{...rows[0],...patch}],[],'act_1','USD','MZN',65),error=>error.status===502 && error.diagnosticCode==='META_INVALID_RECORD');
 assert.equal(metaRecords([{...rows[0],spend:'0'}],[],'act_1','USD','MZN',65).records[0].valor,0);
});
