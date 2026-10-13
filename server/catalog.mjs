import {decrypt,safeId} from './security.mjs';
import {normalName} from './model.mjs';
export function linkedProduct(previous,remote,shop){
 const aliases=[...new Set([...(previous?.aliases || []),...(previous?.nome && previous.nome!==remote.title?[previous.nome]:[])])];
 if(aliases.length>50)throw Object.assign(new Error('O produto atingiu 50 nomes associados. Reveja as associações antes de atualizar.'),{status:422});
 return {...(previous || {id:'sp_'+remote.id,custo:0,foto:'',locais:[],costConfigured:false}),nome:remote.title,aliases,shopifyProductId:remote.id,shopifyShop:shop};
}
export function createCatalog(store,providers,config){
 async function connection(uid){const snap=await store.connection(uid,'shopify').get();if(!snap.exists)throw Object.assign(new Error('Liga a Shopify primeiro.'),{status:400});const value=snap.data();return {...value,token:decrypt(value.credentials,config.encryptionKey).token};}
 async function list(uid,after){const link=await connection(uid);return providers.shopifyProductsPage(link.shop,link.token,after);}
 async function bind(uid,bindings,version){
  if(!Array.isArray(bindings) || !bindings.length || bindings.length>5 || bindings.some(item=>!/^\d{1,30}$/.test(item.shopifyProductId || '') || !Number.isInteger(item.revision) || item.revision<0))throw Object.assign(new Error('Ligação de produtos inválida.'),{status:400});
  for(const item of bindings)if(item.productId)safeId(item.productId);
  if(new Set(bindings.map(item=>item.shopifyProductId)).size!==bindings.length || new Set(bindings.map(item=>item.productId || 'sp_'+item.shopifyProductId)).size!==bindings.length)throw Object.assign(new Error('Cada produto da loja deve ter uma ligação distinta.'),{status:400});
  const release=await store.claim(uid,'shopify_catalog');if(!release)return {busy:true};
  try{const link=await connection(uid),state=await store.state(uid,version),remote=await providers.shopifyProductsByIds(link.shop,link.token,bindings.map(item=>item.shopifyProductId));
   if(new Set(remote.map(row=>normalName(row.title))).size!==remote.length)throw Object.assign(new Error('A Shopify devolveu produtos com nomes iguais. Vincula apenas um de cada nome para evitar ambiguidade.'),{status:409});
   const changes=bindings.map(item=>{const product=remote.find(row=>row.id===item.shopifyProductId);if(!product)throw Object.assign(new Error('Um produto já não está disponível na Shopify.'),{status:409});const id=item.productId || 'sp_'+item.shopifyProductId,previous=state.produtos.find(row=>row.id===id),other=state.produtos.find(row=>row.shopifyShop===link.shop && row.shopifyProductId===item.shopifyProductId && row.id!==id);
    if(other || (item.productId && !previous) || (previous?.shopifyProductId && (previous.shopifyProductId!==item.shopifyProductId || previous.shopifyShop!==link.shop)))throw Object.assign(new Error('Esta ligação já pertence a outro produto. Reabre a lista para rever.'),{status:409});
    if(state.produtos.some(row=>row.id!==id && normalName(row.nome)===normalName(product.title)))throw Object.assign(new Error('Já existe um produto com este nome. Escolhe-o na lista.'),{status:409});
    const record=linkedProduct(previous,product,link.shop);delete record._revision;return {id,revision:item.revision,record};});
   const revisions=await store.patch(uid,'produtos',changes);await store.connection(uid,'shopify').update({catalogEnabled:true,catalogLastSync:null,catalogAfter:null,catalogLastError:null});return {count:changes.length,revisions};
  }finally{await release();}
 }
 async function refresh(uid,link){
  const release=await store.claim(uid,'shopify_catalog');if(!release)return {busy:true};
  try{let query=store.records(uid,'produtos').where('record.shopifyShop','==',link.shop).limit(5);if(link.catalogAfter)query=query.startAfter(store.records(uid,'produtos').doc(link.catalogAfter));const page=await query.get();
   if(!page.empty){const products=page.docs.map(doc=>({...doc.data().record,_revision:doc.data().revision})),{token}=decrypt(link.credentials,config.encryptionKey),remote=await providers.shopifyProductsByIds(link.shop,token,products.map(row=>row.shopifyProductId));const changes=[];for(const previous of products){const found=remote.find(row=>row.id===previous.shopifyProductId);if(!found || found.title===previous.nome)continue;const duplicates=await store.records(uid,'produtos').where('record.nome','==',found.title).limit(2).get();if(duplicates.docs.some(doc=>doc.id!==previous.id))throw Object.assign(new Error('Um nome da Shopify já pertence a outro produto no painel. Revê as ligações do catálogo.'),{status:409});const record=linkedProduct(previous,found,link.shop);delete record._revision;changes.push({id:previous.id,revision:previous._revision,record});}if(changes.length)await store.patch(uid,'produtos',changes);}
   const partial=page.size===5;await store.connection(uid,'shopify').update({catalogLastError:null,catalogAfter:partial?page.docs.at(-1).id:null,...(!partial?{catalogLastSync:new Date().toISOString()}: {})});return {partial};
  }finally{await release();}
 }
 return {list,bind,refresh};
}
