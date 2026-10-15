import {readAll,page as readPage,pageOptions} from './paging.mjs';
import { collections, validateRecord } from './model.mjs';
import { safeId } from './security.mjs';
export function createStore(db,{stateCache=null}={}) {
  const business = uid => db.doc(`businesses/${uid}`);
  const records = (uid, name) => business(uid).collection(name);
  const connection = (uid, provider) => business(uid).collection('connections').doc(provider);
  async function ensureBusiness(uid, email) {
    const existing=await business(uid).get();
    if(existing.exists){if(existing.data().ownerId!==uid)throw new Error('Acesso ao negócio recusado.');return existing.data();}
    return db.runTransaction(async tx => {
      const ref=business(uid), snapshot=await tx.get(ref);
      if (!snapshot.exists) {const value={ownerId:uid,email:email || '',currency:'MZN',timezone:'Africa/Maputo',createdAt:new Date().toISOString(),dataVersion:0,usage:{counts:Object.fromEntries(collections.map(name=>[name,0])),updatedAt:new Date().toISOString()}};tx.create(ref,value);return value;}
      if(snapshot.data().ownerId!==uid)throw new Error('Acesso ao negócio recusado.');return snapshot.data();
    });
  }
  async function state(uid,version,{financial=false}={}) {
    const key=uid+':'+version+(financial?':metrics':''),cacheable=stateCache && Number.isSafeInteger(version);
    const cached=cacheable?stateCache.get(key):null;
    if(cached && cached.expires>Date.now())return structuredClone(cached.value);
    const budget={pages:0,maxPages:28};
    const groups = await Promise.all(collections.map(name => readAll(records(uid,name),{budget,select:financial && name==='produtos'?['record.id','record.nome','record.aliases','record.custo','record.costConfigured']:[]})));
    if(groups.reduce((sum,group)=>sum+group.size,0)>10000)throw Object.assign(new Error('O negócio excede a capacidade de cálculo de 10.000 registos desta instalação. Os dados podem ser exportados por páginas.'),{status:422,diagnosticCode:'PROCESSING_LIMIT'});
    const value=Object.fromEntries(collections.map((name,index) => [name,groups[index].docs.map(doc => ({ ...doc.data().record, _revision:doc.data().revision }))]));
    if(cacheable){
      for(const [oldKey,entry] of stateCache)if(oldKey.startsWith(uid+':') || entry.expires<=Date.now())stateCache.delete(oldKey);
      const bytes=JSON.stringify(value).length*2;
      if(bytes<=2000000){while(stateCache.size && ([...stateCache.values()].reduce((sum,entry)=>sum+entry.bytes,0)+bytes>8000000 || stateCache.size>=20))stateCache.delete(stateCache.keys().next().value);stateCache.set(key,{value:structuredClone(value),bytes,expires:Date.now()+300000});}
    }
    return value;
  }
  async function statePage(uid,name,options){
    if(!collections.includes(name))throw Object.assign(new Error('Coleção inválida.'),{status:400});
    const result=await readPage(records(uid,name),id=>records(uid,name).doc(id),pageOptions(options));
    return {records:result.docs.map(doc=>({...doc.data().record,_revision:doc.data().revision})),after:result.after};
  }
  async function patch(uid, name, changes) {
    if (!collections.includes(name) || !Array.isArray(changes) || changes.length < 1 || changes.length > 100) throw Object.assign(new Error('Alteração inválida (máximo de 100 registos por pedido).'),{ status:400 });
    if (new Set(changes.map(c => c.id)).size !== changes.length) throw Object.assign(new Error('Registos repetidos.'),{status:400});
    for (const change of changes) {
      safeId(change.id);
      if (!Number.isInteger(change.revision) || change.revision < 0) throw Object.assign(new Error('Revisão inválida.'),{status:400});
      if (change.record !== null) {
        try { validateRecord(name,change.record); } catch (error) { error.status=400; throw error; }
        if (change.record.id !== change.id) throw Object.assign(new Error('Identificador divergente.'),{status:400});
      }
    }
    return db.runTransaction(async tx => {
      const refs=changes.map(c => records(uid,name).doc(c.id));
      const owner=await tx.get(business(uid));if(owner.data()?.accountStatus)throw Object.assign(new Error('A conta está em encerramento.'),{status:423});
      const snapshots=await tx.getAll(...refs);
      for (let i=0;i<changes.length;i++) {
        const actual=snapshots[i].exists ? snapshots[i].data().revision : 0;
        if (actual !== changes[i].revision) throw Object.assign(new Error('Este registo foi alterado noutro aparelho ou pela integração. Recarregue para conciliar os dados.'),{status:409});
      }
      const usage=owner.data()?.usage;if(usage?.counts){const delta=changes.reduce((sum,change,index)=>sum+(change.record===null?(snapshots[index].exists?-1:0):snapshots[index].exists?0:1),0);const counts={...usage.counts,[name]:Math.max(0,(usage.counts[name] || 0)+delta)};if(Object.values(counts).reduce((sum,value)=>sum+value,0)>10000)throw Object.assign(new Error('Esta instalação suporta até 10.000 registos por negócio. Exporta os dados e contacta o suporte antes de ampliar.'),{status:422,diagnosticCode:'PROCESSING_LIMIT'});tx.update(business(uid),{usage:{counts,updatedAt:new Date().toISOString()},dataVersion:(owner.data()?.dataVersion || 0)+1});}else tx.update(business(uid),{dataVersion:(owner.data()?.dataVersion || 0)+1});
      return changes.map((change,index) => {
        if (change.record === null) tx.delete(refs[index]);
        else tx.set(refs[index],{record:change.record,revision:change.revision+1,updatedAt:new Date().toISOString()});
        return {id:change.id, revision:change.revision+1};
      });
    });
  }
  const recordEqual=(a,b)=>JSON.stringify(Object.keys(a).sort().map(key=>[key,a[key]]))===JSON.stringify(Object.keys(b).sort().map(key=>[key,b[key]]));
  async function importedMany(uid,name,incoming){
    if(incoming.length>100)throw new Error('Lote de importação demasiado grande.');
    if(!incoming.length)return;
    if(new Set(incoming.map(item=>item.record.id)).size!==incoming.length)throw new Error('IDs repetidos no lote de importação.');
    return db.runTransaction(async tx=>{
      const owner=await tx.get(business(uid));if(owner.data()?.accountStatus)throw Object.assign(new Error('A conta está em encerramento.'),{status:423});
      const refs=incoming.map(item=>records(uid,name).doc(safeId(item.record.id)));
      const snapshots=await tx.getAll(...refs);let changed=false;const updated=snapshots.map(snap=>snap.exists?{...snap.data().record,_revision:snap.data().revision}:null);
      for(let i=0;i<incoming.length;i++){
        const {record:source,sourceUpdatedAt,statusOnly}=incoming[i],old=snapshots[i].data();
        if(sourceUpdatedAt && old?.sourceUpdatedAt && sourceUpdatedAt<old.sourceUpdatedAt)continue;
        const record=statusOnly && old?{...old.record,status:source.status,panelConfirmed:source.panelConfirmed===true,...Object.fromEntries(['shopifyFinancialStatus','shopifyFulfillmentStatus','unitCost','costCapturedAt'].filter(key=>source[key]!==undefined).map(key=>[key,source[key]]))}:name==='vendas' && old ? {...source,...Object.fromEntries(['unitCost','costCapturedAt','horario','delivery','comissao','semana','mes','descricao','data','dataPedido','reagendamentos'].filter(key=>old.record[key]!==undefined).map(key=>[key,old.record[key]])),panelConfirmed:source.status==='cancelado'?false:old.record.panelConfirmed===true,status:source.status==='pendente'?(old.record.panelConfirmed===true?'concluido':old.record.status==='remarcado'?'remarcado':'pendente'):source.status} : source;
        validateRecord(name,record);
        if(old && recordEqual(old.record,record) && (!sourceUpdatedAt || sourceUpdatedAt===old.sourceUpdatedAt))continue;
        updated[i]={...record,_revision:(old?.revision || 0)+1};
        tx.set(refs[i],{record,revision:(old?.revision || 0)+1,updatedAt:new Date().toISOString(),...(sourceUpdatedAt?{sourceUpdatedAt}:{})});changed=true;
      }
      if(changed){const usage=owner.data()?.usage;const extra=usage?.counts?{usage:{counts:{...usage.counts,[name]:(usage.counts[name] || 0)+snapshots.filter(snap=>!snap.exists).length},updatedAt:new Date().toISOString()}}:{};if(extra.usage && Object.values(extra.usage.counts).reduce((sum,value)=>sum+value,0)>10000)throw Object.assign(new Error('Foi atingido o limite técnico de registos desta instalação. A sincronização foi pausada sem truncar os dados.'),{status:422,diagnosticCode:'PROCESSING_LIMIT'});tx.update(business(uid),{...extra,dataVersion:(owner.data()?.dataVersion || 0)+1});}
      return updated.filter(Boolean);
    });
  }
  async function imported(uid,name,record,sourceUpdatedAt=null){await importedMany(uid,name,[{record,sourceUpdatedAt}]);}
  async function claim(uid, provider) {
    const ref=business(uid).collection('leases').doc(provider), token=crypto.randomUUID();
    const claimed=await db.runTransaction(async tx => {
      const snap=await tx.get(ref);
      if (snap.exists && snap.data().until>Date.now()) return false;
      tx.set(ref,{ token, until:Date.now()+10*60*1000 }); return true;
    });
    return claimed ? async () => db.runTransaction(async tx => {
      const snap=await tx.get(ref);
      if (snap.data()?.token === token) tx.delete(ref);
    }) : null;
  }
  return { db,business,records,connection,ensureBusiness,state,statePage,patch,imported,importedMany,claim };
}
