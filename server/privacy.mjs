import {LEGAL_VERSION} from './access.mjs';
import {collections} from './model.mjs';
import {publicConnection} from './security.mjs';
export {LEGAL_VERSION};
const recent=user=>Number.isFinite(user.auth_time) && Date.now()/1000-user.auth_time<300;
export function createPrivacy(store,config){
 async function closure(uid,body,user){
  const businessRef=store.business(uid),jobRef=store.db.doc('accountClosures/'+uid);
  if(body.action==='start'){
   if(body.confirmation!=='ELIMINAR' || !recent(user))throw Object.assign(new Error('Confirma ELIMINAR e autentica-te novamente antes de eliminar a conta.'),{status:401,diagnosticCode:'RECENT_LOGIN_REQUIRED'});
   if((config.adminUids || []).includes(uid))throw Object.assign(new Error('Transfere a administração para outra conta antes de eliminar esta conta administrativa.'),{status:409});
   await store.db.runTransaction(async tx=>{const [business,job]=await tx.getAll(businessRef,jobRef);if(job.exists)return;if(business.data()?.accountStatus==='closed')return;tx.create(jobRef,{uid,status:'pending',stage:0,deleted:0,startedAt:new Date().toISOString()});tx.update(businessRef,{accountStatus:'deleting',dataVersion:(business.data().dataVersion || 0)+1});});
  }else if(body.action!=='step')throw Object.assign(new Error('Ação de encerramento inválida.'),{status:400});
  return step(uid);
 }
 async function step(uid){
  const release=await store.claim(uid,'account_closure');if(!release)return {busy:true};
  const businessRef=store.business(uid),jobRef=store.db.doc('accountClosures/'+uid);
  try{
   const job=(await jobRef.get()).data();if(!job)throw Object.assign(new Error('Não existe um encerramento confirmado.'),{status:404});if(job.status==='done')return {done:true,deleted:job.deleted};
   const stages=[...collections,'connections','leases','oauthStates','webhookQueue','platformAudit'];let stage=job.stage;
   if(stage<stages.length){
    const name=stages[stage];
    if(name==='connections'){
     const connection=(await store.connection(uid,'shopify').get()).data();if(connection?.shop){const link=store.db.doc('shopLinks/'+connection.shop),saved=await link.get();if(saved.data()?.ownerId===uid)await link.delete();}
    }
    let query=stage<7?businessRef.collection(name):store.db.collection(name).where(name==='platformAudit'?'targetUid':'ownerId','==',uid);
    // O lease do próprio encerramento é libertado pelo finally e não deve ser apagado aqui.
    const snapshot=await query.select('__name__').limit(25).get(),docs=snapshot.docs.filter(doc=>name!=='leases' || doc.id!=='account_closure');
    const batch=store.db.batch();for(const doc of docs)batch.delete(doc.ref);await batch.commit();
    if(snapshot.size<25)stage++;
    await jobRef.update({stage,deleted:job.deleted+docs.length,status:'pending'});
    return {done:false,deleted:job.deleted+docs.length,stage,totalStages:stages.length};
   }
   const business=(await businessRef.get()).data();await businessRef.set({ownerId:uid,accountStatus:'closed',closedAt:new Date().toISOString(),dataVersion:(business?.dataVersion || 0)+1});
   await jobRef.update({status:'done',completedAt:new Date().toISOString()});return {done:true,deleted:job.deleted};
  }finally{await release();}
 }
 return {closure,step};
}
export function installPrivacyRoutes(app,{store,config}){
 const privacy=createPrivacy(store,config);
 app.post('/api/account/closure',async(req,res)=>res.json(await privacy.closure(req.user.uid,req.body,req.user)));
 app.get('/api/account/closure',async(req,res)=>{const job=(await store.db.doc('accountClosures/'+req.user.uid).get()).data();res.json(job?{status:job.status,deleted:job.deleted,stage:job.stage}: {status:'none'});});
 app.get('/api/account/export',async(req,res)=>{
  const [shop,meta]=await Promise.all(['shopify','meta'].map(provider=>store.connection(req.user.uid,provider).get()));
  res.json({version:1,exportedAt:new Date().toISOString(),profile:{uid:req.user.uid,email:req.user.email || null,createdAt:req.business.createdAt || null,currency:req.business.currency || 'MZN',timezone:req.business.timezone || 'Africa/Maputo',legal:req.business.legal || null,subscription:req.business.subscription?{planId:req.business.subscription.planId,status:req.business.subscription.status,expiresAt:req.business.subscription.expiresAt,method:req.business.subscription.method,reference:req.business.subscription.reference || '',...(req.business.subscription.amount!==undefined?{amount:req.business.subscription.amount,currency:'MZN'}:{})}:null},connections:{shopify:publicConnection(shop.data()),meta:publicConnection(meta.data())}});
 });
 app.post('/api/account/legal',async(req,res)=>{
  if(!config.legalApproved || req.body.version!==LEGAL_VERSION || req.body.accept!==true)throw Object.assign(new Error('Os documentos ainda não estão publicados ou a versão mudou.'),{status:409});
  await store.business(req.user.uid).update({legal:{version:LEGAL_VERSION,acceptedAt:new Date().toISOString(),acceptedBy:req.user.uid}});res.json({ok:true});
 });
}
