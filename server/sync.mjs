import { decrypt } from './security.mjs';
import { shopifyRecords, metaRecords } from './model.mjs';
export function createSync(store,providers,config) {
  async function run(uid,provider) {
    const release=await store.claim(uid,provider);
    if (!release) return {busy:true};
    const ref=store.connection(uid,provider);
    try {
      const snap=await ref.get();
      if(!snap.exists) throw Object.assign(new Error('Integração não conectada.'),{status:400});
      const connection=snap.data(), auth=decrypt(connection.credentials,config.encryptionKey);
      const business=(await store.business(uid).get()).data(), state=await store.state(uid);
      let count=0, unmatched=[];
      if(provider==='shopify') {
        const since=connection.salesPolicyVersion===2 && connection.lastSync ? new Date(Date.parse(connection.lastSync)-24*60*60*1000).toISOString() : new Date(Date.now()-59*24*60*60*1000).toISOString();
        const orders=await providers.shopifyOrders(connection.shop,auth.token,since);
        for(const order of orders) for(const record of shopifyRecords(order,state.produtos,business.currency)) {
          await store.imported(uid,'vendas',record,order.updated_at); count++;
        }
      } else {
        if(!connection.accountId) throw new Error('Selecione a conta de anúncios antes de sincronizar.');
        const until=new Date().toISOString().slice(0,10), since=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
        if(connection.currency!==business.currency && !connection.conversionRate) throw new Error(`A conta Meta usa ${connection.currency}; configure a taxa de câmbio para ${business.currency}.`);
        const rows=await providers.metaInsights(connection.accountId,auth.token,since,until);
        const normalized=metaRecords(rows,state.produtos,connection.accountId,connection.currency,business.currency,connection.conversionRate || 1);
        unmatched=normalized.unmatched;
        for(const record of normalized.records) { await store.imported(uid,'ads',record); count++; }
      }
      await ref.update({lastSync:new Date().toISOString(),...(provider==='shopify'?{salesPolicyVersion:2}:{}),lastError:null,unmatchedCampaigns:unmatched});
      return {count,unmatched};
    } catch(error) {
      if ((await ref.get()).exists) await ref.update({lastError:error.message});
      throw error;
    } finally { await release(); }
  }
  async function tick() {
    const businesses=await store.db.collection('businesses').get();
    for(const business of businesses.docs) for(const provider of ['shopify','meta']) {
      const connection=await store.connection(business.id,provider).get();
      if(!connection.exists || (provider==='meta' && !connection.data().accountId)) continue;
      try { await run(business.id,provider); } catch(error) { console.error(`Sincronização ${provider}: ${error.message}`); }
    }
  }
  return {run,tick};
}
