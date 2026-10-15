export const LEGAL_VERSION='2026-10-15';
import {validDay} from '../web/orders.mjs';
export const PLAN_CATALOG=[{id:'pilot',name:'Piloto',price:null},{id:'standard',name:'Essencial',price:null},{id:'business',name:'Profissional',price:null}];
export function commercialConfig(env){return {adminUids:String(env.PLATFORM_ADMIN_UIDS || '').split(',').map(id=>id.trim()).filter(Boolean),requireSubscription:env.SUBSCRIPTION_ENFORCEMENT==='true',operatorName:String(env.OPERATOR_NAME || '').slice(0,160),legalApproved:env.LEGAL_DOCUMENTS_APPROVED==='true' && Boolean(env.OPERATOR_NAME) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || ''),supportEmail:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || '')?env.SUPPORT_EMAIL:null};}
export function accountAccess(business,config,now=Date.now()){
 const subscription=business.subscription || {},expiry=Date.parse(subscription.expiresAt || ''),enforced=config.requireSubscription===true;
 const status=!enforced?'pilot':!['active','trial','suspended'].includes(subscription.status)?'pending':subscription.status==='suspended'?'suspended':!Number.isFinite(expiry) || expiry<=now?'expired':subscription.status;
 const legalRequired=config.legalApproved===true && business.legal?.version!==LEGAL_VERSION;
 const canWrite=!business.accountStatus && !legalRequired && (!enforced || ['active','trial'].includes(status));
 return {legalRequired,mode:enforced?'commercial':'pilot',status,canRead:business.accountStatus!=='closed',canWrite,canExport:business.accountStatus!=='closed',planId:subscription.planId || 'pilot',expiresAt:subscription.expiresAt || null,revision:subscription.revision || 0};
}
export function assertWritable(business,config){if(!business)throw Object.assign(new Error('Negócio não encontrado.'),{status:404});if(accountAccess(business,config).legalRequired)throw Object.assign(new Error('Lê e aceita os termos e a privacidade publicados no menu de conta antes de continuar.'),{status:428,diagnosticCode:'LEGAL_ACCEPTANCE_REQUIRED'});if(!accountAccess(business,config).canWrite)throw Object.assign(new Error(business.accountStatus?'A conta está a ser encerrada.':'O acesso está apenas para consulta. A exportação continua disponível; pede a ativação ou renovação do plano.'),{status:402,diagnosticCode:'SUBSCRIPTION_REQUIRED'});}
export function expiryForDay(day){if(!validDay(day))throw Object.assign(new Error('Data de validade inválida.'),{status:400});return new Date(day+'T23:59:59.999+02:00').toISOString();}
export function subscriptionChange(body,now=Date.now()){
 if(!body || Object.keys(body).some(key=>!['planId','status','expiresOn','method','reference','amount','revision','requestId'].includes(key)))throw Object.assign(new Error('Campos de ativação inválidos.'),{status:400});
 if(!PLAN_CATALOG.some(plan=>plan.id===body.planId) || !['active','trial','suspended'].includes(body.status) || !['manual','mpesa','emola','bank'].includes(body.method) || !Number.isInteger(body.revision) || body.revision<0 || !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId || ''))throw Object.assign(new Error('Plano, estado ou revisão inválidos.'),{status:400});
 const expiresAt=body.status==='suspended' && !body.expiresOn?null:expiryForDay(body.expiresOn);
 if(expiresAt && (Date.parse(expiresAt)<=now || Date.parse(expiresAt)>now+3*366*86400000))throw Object.assign(new Error('Escolhe uma validade futura até três anos.'),{status:400});
 if(body.reference!==undefined && (typeof body.reference!=='string' || body.reference.length>120))throw Object.assign(new Error('Referência inválida.'),{status:400});
 if(body.amount!==undefined && (!Number.isFinite(body.amount) || body.amount<0))throw Object.assign(new Error('Valor recebido inválido.'),{status:400});
 return {planId:body.planId,status:body.status,expiresAt,method:body.method,reference:body.reference || '',...(body.amount!==undefined?{amount:body.amount,currency:'MZN'}:{})};
}
