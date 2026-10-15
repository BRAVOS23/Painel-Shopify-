import {createHash} from 'node:crypto';
import {PLAN_CATALOG,accountAccess,subscriptionChange,LEGAL_VERSION} from './access.mjs';
import {safeId,publicConnection} from './security.mjs';
import {page,pageOptions} from './paging.mjs';
const uid=value=>safeId(value);
export function installPlatformRoutes(app,{store,config}){
 const isAdmin=req=>(config.adminUids || []).includes(req.user.uid);
 const admin=(req,_res,next)=>{if(!isAdmin(req))throw Object.assign(new Error('Acesso reservado à administração.'),{status:403});next();};
 app.get('/api/account',async(req,res)=>res.json({uid:req.user.uid,email:req.user.email,access:accountAccess(req.business,config),admin:isAdmin(req),plans:PLAN_CATALOG,pricingConfigured:false,supportEmail:config.supportEmail || null,legalApproved:config.legalApproved===true,legalVersion:LEGAL_VERSION,activationRequestedAt:req.business.activationRequestedAt || null,accountStatus:req.business.accountStatus || null}));
 app.post('/api/account/access-request',async(req,res)=>{
  await store.db.runTransaction(async tx=>{const ref=store.business(req.user.uid),snap=await tx.get(ref);if(snap.data().activationRequestStatus==='pending')return;tx.update(ref,{activationRequestedAt:new Date().toISOString(),activationRequestStatus:'pending'});});res.json({ok:true,message:'Pedido de ativação guardado para a administração. Não foi efetuada nenhuma cobrança.'});
 });
 app.get('/api/admin/businesses',admin,async(req,res)=>{
  const options=pageOptions({...req.query,limit:req.query.limit || 10});if(options.limit>10)throw Object.assign(new Error('Máximo de 10 negócios por página.'),{status:400});
  const result=await page(store.db.collection('businesses'),id=>store.business(id),options);
  res.json({businesses:result.docs.map(doc=>{const value=doc.data();return {uid:doc.id,email:value.email || null,createdAt:value.createdAt || null,accountStatus:value.accountStatus || null,activationRequestStatus:value.activationRequestStatus || null,activationRequestedAt:value.activationRequestedAt || null,access:accountAccess(value,config),usage:value.usage || null};}),after:result.after});
 });
 app.post('/api/admin/businesses/:uid/subscription',admin,async(req,res)=>{
  const target=uid(req.params.uid),change=subscriptionChange(req.body),at=new Date().toISOString(),hash=createHash('sha256').update(JSON.stringify(change)).digest('hex');
  const log=store.db.doc('platformAudit/'+createHash('sha256').update(req.user.uid+':'+req.body.requestId).digest('hex'));
  const result=await store.db.runTransaction(async tx=>{
   const previousLog=await tx.get(log);if(previousLog.exists){if(previousLog.data().requestHash!==hash || previousLog.data().targetUid!==target)throw Object.assign(new Error('Esta referência de operação já foi utilizada.'),{status:409});return {replayed:true};}
   const ref=store.business(target),snap=await tx.get(ref);if(!snap.exists)throw Object.assign(new Error('Negócio não encontrado.'),{status:404});if(snap.data().accountStatus)throw Object.assign(new Error('Não é possível ativar uma conta em encerramento.'),{status:409});
   const previous=snap.data().subscription || {};if((previous.revision || 0)!==req.body.revision)throw Object.assign(new Error('O plano mudou entretanto. Atualiza a lista antes de guardar.'),{status:409});
   const subscription={...change,revision:req.body.revision+1,updatedAt:at,updatedBy:req.user.uid,paymentVerification:'manual_by_admin'};
   tx.update(ref,{subscription,activationRequestStatus:'resolved'});tx.create(log,{action:'subscription.changed',actorId:req.user.uid,targetUid:target,at,requestHash:hash,previous:{planId:previous.planId || null,status:previous.status || null,expiresAt:previous.expiresAt || null},next:change});return {subscription};
  });res.json({ok:true,...result});
 });
 app.get('/api/admin/audit',admin,async(req,res)=>{
  const result=await page(store.db.collection('platformAudit'),id=>store.db.doc('platformAudit/'+id),pageOptions({...req.query,limit:req.query.limit || 20}));
  res.json({events:result.docs.map(doc=>({id:doc.id,...doc.data()})),after:result.after});
 });
 app.get('/api/admin/businesses/:uid/health',admin,async(req,res)=>{
  const target=uid(req.params.uid),exists=await store.business(target).get();if(!exists.exists)throw Object.assign(new Error('Negócio não encontrado.'),{status:404});
  const [shop,meta]=await Promise.all(['shopify','meta'].map(provider=>store.connection(target,provider).get()));
  res.json({access:accountAccess(exists.data(),config),shopify:publicConnection(shop.data()),meta:publicConnection(meta.data())});
 });
 app.get('/api/admin/health',admin,async(_req,res)=>res.json({mode:config.requireSubscription?'commercial':'pilot',billingAutomated:false,pricingConfigured:false,adminConfigured:Boolean(config.adminUids?.length),legalApproved:config.legalApproved===true,supportConfigured:Boolean(config.supportEmail),firebaseConfigured:Boolean(config.projectId),shopifyConfigured:Boolean(config.shopifyId && config.shopifySecret && config.encryptionKey),metaConfigured:Boolean(config.metaId && config.metaSecret && config.encryptionKey)}));
}
