import test from 'node:test';
import assert from 'node:assert/strict';
import {accountAccess,assertWritable,subscriptionChange,expiryForDay,commercialConfig,LEGAL_VERSION} from '../server/access.mjs';
test('modo piloto não bloqueia contas existentes; modo comercial expira no servidor',()=>{
 const now=Date.parse('2026-10-15T12:00:00Z'),business={subscription:{planId:'standard',status:'active',expiresAt:'2026-10-14T22:00:00Z'}};
 assert(accountAccess(business,{},now).canWrite);const expired=accountAccess(business,{requireSubscription:true},now);assert(!expired.canWrite);assert(expired.canExport);assert.equal(expired.status,'expired');assert.throws(()=>assertWritable(business,{requireSubscription:true}),error=>error.status===402);
 assert.equal(accountAccess({subscription:{...business.subscription,expiresAt:'2090-01-01T00:00:00Z'}},{requireSubscription:true},now).status,'active');assert.equal(accountAccess({subscription:{...business.subscription,status:'suspended'}},{requireSubscription:true},now).status,'suspended');
});
test('termos não aprovados não são impostos; versão publicada é exigida para editar',()=>{
 assert(accountAccess({},{}).canWrite);assert(!accountAccess({},{legalApproved:true}).canWrite);assert(accountAccess({legal:{version:LEGAL_VERSION}},{legalApproved:true}).canWrite);assert.throws(()=>assertWritable({},{legalApproved:true}),error=>error.diagnosticCode==='LEGAL_ACCEPTANCE_REQUIRED');
 const config=commercialConfig({LEGAL_DOCUMENTS_APPROVED:'true'});assert(!config.legalApproved);assert(commercialConfig({LEGAL_DOCUMENTS_APPROVED:'true',OPERATOR_NAME:'Operador',SUPPORT_EMAIL:'support@example.test'}).legalApproved);
});
test('validade respeita fim do dia de Maputo; ativações rejeitam campos e valores inventados',()=>{
 assert.equal(expiryForDay('2026-10-15'),'2026-10-15T21:59:59.999Z');assert.throws(()=>expiryForDay('2026-02-30'));
 const body={planId:'standard',status:'active',expiresOn:'2026-11-15',method:'manual',revision:0,requestId:'test-request-001'};
 assert.equal(subscriptionChange(body,Date.parse('2026-10-15')).planId,'standard');assert.throws(()=>subscriptionChange({...body,admin:true}));assert.throws(()=>subscriptionChange({...body,amount:-1}));assert.throws(()=>subscriptionChange({...body,expiresOn:'2020-01-01'}));assert.throws(()=>subscriptionChange({...body,planId:'not-a-plan'}));
});
