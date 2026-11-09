import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviders} from '../server/providers.mjs';
const config={metaVersion:'v24.0',metaSecret:'fixture-only'};
test('Meta: permissão, token expirado e limite têm diagnóstico sem dados sensíveis',async()=>{
 for(const [code,expected,status] of [[190,'META_AUTH_EXPIRED',401],[200,'META_ADS_PERMISSION',403],[10,'META_ADS_PERMISSION',403],[4,'META_RATE_LIMIT',429],[100,'META_REQUEST_REJECTED',502]]){
  const providers=createProviders(config,async()=>Response.json({error:{code,message:'private-token-or-url'}},{status:400}));
  await assert.rejects(()=>providers.metaAccounts('fixture-token'),error=>error.diagnosticCode===expected && error.status===status && !error.message.includes('private-token-or-url'));
 }
});
test('Meta: falhas de rede e respostas incompletas deixam de gerar TypeError/500',async()=>{
 for(const [fetcher,code] of [[async()=>{throw new TypeError('private request URL');},'META_UNAVAILABLE'],[async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'});},'META_TIMEOUT'],[async()=>Response.json({unexpected:true}),'META_INVALID_RESPONSE']]){
  await assert.rejects(()=>createProviders(config,fetcher).metaAccounts('fixture'),error=>error.diagnosticCode===code && error.status>=502 && !error.message.includes('private request URL'));
 }
});
test('Meta: contas vazias são um resultado válido e não uma falha de autorização',async()=>{
 assert.deepEqual(await createProviders(config,async()=>Response.json({data:[]})).metaAccounts('fixture'),[]);
});
