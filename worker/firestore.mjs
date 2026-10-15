// Firestore REST: nenhuma dependência gRPC, socket persistente ou credencial no browser.
export function encode(value){
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number' && Number.isFinite(value))return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 if(value && typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
 throw new Error('Valor Firestore não suportado.');
}
export function decode(value){
 if('nullValue'in value)return null;if('stringValue'in value)return value.stringValue;if('booleanValue'in value)return value.booleanValue;
 if('integerValue'in value)return Number(value.integerValue);if('doubleValue'in value)return value.doubleValue;
 if('timestampValue'in value)return value.timestampValue;
 if('arrayValue'in value)return (value.arrayValue.values || []).map(decode);
 if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v])=>[k,decode(v)]));
 throw new Error('Tipo Firestore não suportado.');
}
export function createFirestore({project,accessToken,emulator=false,fetcher=fetch}){
 const root=`projects/${project}/databases/(default)/documents`,origin=emulator?'http://127.0.0.1:8080/v1/':'https://firestore.googleapis.com/v1/';
 async function call(path,{method='GET',body,query}={}){
  const url=new URL(origin+path);if(query)for(const [k,v]of Object.entries(query))url.searchParams.set(k,v);
  const response=await fetcher(url,{method,headers:{Authorization:'Bearer '+await accessToken(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  if(!response.ok){
   const reason=result.error?.status,code={NOT_FOUND:5,ALREADY_EXISTS:6,ABORTED:10,UNAVAILABLE:14}[reason];
   const faults={RESOURCE_EXHAUSTED:[429,'FIREBASE_QUOTA','O Firebase atingiu o limite de utilização. Aguarda a reposição da quota ou verifica a utilização no Firebase.'],PERMISSION_DENIED:[503,'FIREBASE_ACCESS','O servidor não tem acesso à base de dados. Verifica as permissões da conta de serviço no Firebase.'],UNAUTHENTICATED:[503,'FIREBASE_IDENTITY','O Firebase recusou a identidade do servidor. Verifica a conta de serviço.'],UNAVAILABLE:[503,'FIREBASE_UNAVAILABLE','A base de dados está temporariamente indisponível. Tenta novamente.'],DEADLINE_EXCEEDED:[503,'FIREBASE_TIMEOUT','A base de dados demorou demasiado a responder. Tenta novamente.']};
   const fault=faults[reason];throw Object.assign(new Error(fault?.[2] || 'Operação Firestore recusada.'),{code,httpStatus:response.status,status:fault?.[0] || (response.status===403?503:undefined),diagnosticCode:fault?.[1] || 'FIREBASE_REQUEST'});
  }
  return result;
 }
 const fields=data=>encode(data).mapValue.fields;
 function snapshot(ref,document){return {id:ref.id,ref,exists:Boolean(document),data:()=>document?decode({mapValue:{fields:document.fields || {}}}):undefined};}
 function doc(path){
  const ref={path,id:path.split('/').pop(),name:root+'/'+path,
   async get(){try{return snapshot(ref,await call(ref.name));}catch(error){if(error.code===5)return snapshot(ref);throw error;}},
   async set(data){await call(root+':commit',{method:'POST',body:{writes:[{update:{name:ref.name,fields:fields(data)}}]}});},
   async create(data){await call(root+':commit',{method:'POST',body:{writes:[{update:{name:ref.name,fields:fields(data)},currentDocument:{exists:false}}]}});},
   async update(data){await call(root+':commit',{method:'POST',body:{writes:[{update:{name:ref.name,fields:fields(data)},updateMask:{fieldPaths:Object.keys(data)},currentDocument:{exists:true}}]}});},
   async delete(){await call(root+':commit',{method:'POST',body:{writes:[{delete:ref.name}]}});},
   collection:name=>collection(path+'/'+name)};return ref;
 }
 function collection(path,filters=[],max=500,options={}){
  const parts=path.split('/'),id=parts.pop(),parent=parts.length?root+'/'+parts.join('/'):root;
  return {doc:id=>doc(path+'/'+id),orderBy:(field,direction='asc')=>{if(field!=='__name__' || direction!=='asc')throw new Error('Ordenação não suportada pelo adaptador.');return collection(path,filters,max,{...options,orderName:true});},where:(field,op,value)=>collection(path,[...filters,{fieldFilter:{field:{fieldPath:field},op:({'==':'EQUAL','>':'GREATER_THAN','<':'LESS_THAN','>=':'GREATER_THAN_OR_EQUAL','<=':'LESS_THAN_OR_EQUAL',in:'IN'})[op],value:encode(value)}}],max,options),limit:limit=>collection(path,filters,limit,{...options,explicitLimit:true}),select:(...fields)=>collection(path,filters,max,{...options,select:fields}),startAfter:ref=>collection(path,filters,max,{...options,after:ref.name}),
   async get(){
    const query={from:[{collectionId:id}],limit:options.explicitLimit?max:max+1};
    if(options.select)query.select={fields:options.select.map(fieldPath=>({fieldPath}))};
    if(options.orderName || options.after)query.orderBy=[{field:{fieldPath:'__name__'},direction:'ASCENDING'}];
    if(options.after){query.orderBy=[{field:{fieldPath:'__name__'},direction:'ASCENDING'}];query.startAt={values:[{referenceValue:options.after}],before:false};}if(filters.length)query.where=filters.length===1?filters[0]:{compositeFilter:{op:'AND',filters}};
    const response=await call(parent+':runQuery',{method:'POST',body:{structuredQuery:query}});
    const docs=response.filter(item=>item.document).map(item=>snapshot(doc(item.document.name.slice(root.length+1)),item.document));
    if(!options.explicitLimit && docs.length>max)throw Object.assign(new Error('O histórico excedeu o limite desta versão gratuita. É necessário paginar os dados antes de continuar.'),{status:422});
    return {docs,size:docs.length,empty:!docs.length};
   }};
 }
 async function runTransaction(fn){
  for(let attempt=0;attempt<3;attempt++){
   const {transaction}=await call(root+':beginTransaction',{method:'POST',body:{options:{readWrite:{}}}});const writes=[];
   const tx={
    async get(ref){const result=await call(root+':batchGet',{method:'POST',body:{documents:[ref.name],transaction}});return snapshot(ref,result.find(item=>item.found?.name===ref.name)?.found);},
    async getAll(...refs){if(!refs.length)return [];const result=await call(root+':batchGet',{method:'POST',body:{documents:refs.map(ref=>ref.name),transaction}});return refs.map(ref=>snapshot(ref,result.find(item=>item.found?.name===ref.name)?.found));},
    set(ref,data){writes.push({update:{name:ref.name,fields:fields(data)}});return tx;},
    create(ref,data){writes.push({update:{name:ref.name,fields:fields(data)},currentDocument:{exists:false}});return tx;},
    update(ref,data){writes.push({update:{name:ref.name,fields:fields(data)},updateMask:{fieldPaths:Object.keys(data)},currentDocument:{exists:true}});return tx;},
    delete(ref){writes.push({delete:ref.name});return tx;}
   };
   try{const value=await fn(tx);await call(root+':commit',{method:'POST',body:{writes,transaction}});return value;}
   catch(error){try{await call(root+':rollback',{method:'POST',body:{transaction}});}catch{}if(error.code!==10 || attempt===2)throw error;}
  }
 }
 function batch(){const writes=[];return {delete(ref){writes.push({delete:ref.name});return this;},set(ref,data){writes.push({update:{name:ref.name,fields:fields(data)}});return this;},async commit(){if(!writes.length)return [];if(writes.length>100)throw new Error('Lote demasiado grande.');return call(root+':commit',{method:'POST',body:{writes}});}};}
 return {doc,collection,runTransaction,batch};
}
