import { collections, validateRecord } from './model.mjs';
import { safeId } from './security.mjs';
export function createStore(db) {
  const business = uid => db.doc(`businesses/${uid}`);
  const records = (uid, name) => business(uid).collection(name);
  const connection = (uid, provider) => business(uid).collection('connections').doc(provider);
  async function ensureBusiness(uid, email) {
    const existing=await business(uid).get();
    if(existing.exists){if(existing.data().ownerId!==uid)throw new Error('Acesso ao negócio recusado.');return existing.data();}
    return db.runTransaction(async tx => {
      const ref=business(uid), snapshot=await tx.get(ref);
      if (!snapshot.exists) {const value={ownerId:uid,email:email || '',currency:'MZN',timezone:'Africa/Maputo',createdAt:new Date().toISOString(),dataVersion:0};tx.create(ref,value);return value;}
      if(snapshot.data().ownerId!==uid)throw new Error('Acesso ao negócio recusado.');return snapshot.data();
    });
  }
  async function state(uid) {
    const groups = await Promise.all(collections.map(name => records(uid,name).get()));
    return Object.fromEntries(collections.map((name,index) => [name,groups[index].docs.map(doc => ({ ...doc.data().record, _revision:doc.data().revision }))]));
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
      const owner=await tx.get(business(uid));
      const snapshots=await tx.getAll(...refs);
      for (let i=0;i<changes.length;i++) {
        const actual=snapshots[i].exists ? snapshots[i].data().revision : 0;
        if (actual !== changes[i].revision) throw Object.assign(new Error('Este registo foi alterado noutro aparelho ou pela integração. Recarregue para conciliar os dados.'),{status:409});
      }
      tx.update(business(uid),{dataVersion:(owner.data()?.dataVersion || 0)+1});
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
      const owner=await tx.get(business(uid));
      const refs=incoming.map(item=>records(uid,name).doc(safeId(item.record.id)));
      const snapshots=await tx.getAll(...refs);let changed=false;const updated=snapshots.map(snap=>snap.exists?{...snap.data().record,_revision:snap.data().revision}:null);
      for(let i=0;i<incoming.length;i++){
        const {record:source,sourceUpdatedAt}=incoming[i],old=snapshots[i].data();
        if(sourceUpdatedAt && old?.sourceUpdatedAt && sourceUpdatedAt<old.sourceUpdatedAt)continue;
        const record=name==='vendas' && old ? {...source,...Object.fromEntries(['horario','delivery','comissao','semana','mes','descricao'].filter(key=>old.record[key]!==undefined).map(key=>[key,old.record[key]])),status:source.status==='pendente'?old.record.status:source.status} : source;
        validateRecord(name,record);
        if(old && recordEqual(old.record,record) && (!sourceUpdatedAt || sourceUpdatedAt===old.sourceUpdatedAt))continue;
        updated[i]={...record,_revision:(old?.revision || 0)+1};
        tx.set(refs[i],{record,revision:(old?.revision || 0)+1,updatedAt:new Date().toISOString(),...(sourceUpdatedAt?{sourceUpdatedAt}:{})});changed=true;
      }
      if(changed)tx.update(business(uid),{dataVersion:(owner.data()?.dataVersion || 0)+1});
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
  return { db,business,records,connection,ensureBusiness,state,patch,imported,importedMany,claim };
}
