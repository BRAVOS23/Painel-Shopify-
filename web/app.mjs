import {validateRecord} from './record-schema.mjs';
import {sourceCounts} from './order-reports.mjs';
import {countOrders,csvOrderStatus,completedSale} from './sales.mjs';
import {productResolver,effectiveExpenseProduct,metaProductResolver} from './catalog.mjs';
import {initAccountMenu,initExperience} from './experience.mjs';
import {initializeApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,sendEmailVerification,sendPasswordResetEmail} from 'firebase/auth';
import Chart from 'chart.js/auto';
import {jsPDF} from 'jspdf';
window.resolveExpenseProduct=effectiveExpenseProduct;
window.resolveProductName=(value,products)=>productResolver(products)(value);
window.sourceCounts=sourceCounts;window.completedSale=completedSale;window.countOrders=countOrders;window.csvOrderStatus=csvOrderStatus;
window.Chart=Chart; window.jspdf={jsPDF};
const startup=document.createElement('section');startup.className='panel';startup.setAttribute('role','status');startup.style.cssText='max-width:440px;margin:12vh auto;padding:26px';startup.textContent='A abrir o painel…';document.body.prepend(startup);
let config=null;
try{const response=await fetch('/api/config',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('config');config=await response.json();if(!config.firebase?.projectId)config=null;}catch{}
if(!config){startup.replaceChildren();const heading=document.createElement('h1');heading.textContent='Não foi possível abrir o painel';heading.style.fontSize='22px';const text=document.createElement('p');text.textContent='Verifica a ligação à internet e tenta novamente.';text.style.cssText='margin:16px 0;color:var(--sand-dim)';const retry=document.createElement('button');retry.type='button';retry.className='btn-primary';retry.textContent='Tentar novamente';retry.onclick=()=>location.reload();startup.append(heading,text,retry);}
else{
startup.remove();const auth=getAuth(initializeApp(config.firebase));
if(config.emulators)connectAuthEmulator(auth,`http://${location.hostname}:9099`,{disableWarnings:true});
const groups=['fluxo','vendas','produtos','ads','operacional'];
const clean=record=>Object.fromEntries(Object.entries(record).filter(([key])=>key!=='_revision'));
let baseline={},desired={},loaded=false,busy=false,failure=null,mutation=0,user=null,session=0,stateTag=null,lastConnectionsCheck=0;
const wrap=document.querySelector('.wrap');wrap.hidden=true;
const style=document.createElement('style');style.textContent=`
[hidden]{display:none!important}.cloud-login{max-width:440px;margin:8vh auto;padding:28px;background:var(--panel);border:1px solid var(--panel-line);border-radius:14px}.cloud-login h1{font-size:24px;margin-bottom:12px}.cloud-login p{line-height:1.5;color:var(--sand-dim);font-size:14px}.cloud-login form{display:flex;flex-direction:column;align-items:stretch;margin:20px 0}.cloud-login input{padding:12px;border-radius:8px;border:1px solid var(--panel-line);background:var(--ink-2);color:var(--sand)}.cloud-actions{display:flex;gap:8px;flex-wrap:wrap}.cloud-status{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 18px;padding:12px;border:1px solid var(--panel-line);border-radius:10px;font-size:12px}.cloud-status button{padding:6px 10px}.cloud-message{font-size:13px;line-height:1.5;margin-top:10px;color:var(--gold)}.cloud-help{font-size:13px;color:var(--sand-dim);line-height:1.6;margin-bottom:12px}.cloud-integration input,.cloud-integration select{padding:10px;background:var(--ink-2);color:var(--sand);border:1px solid var(--panel-line);border-radius:8px;max-width:100%}.cloud-integration .cloud-actions{margin-top:12px}
`;document.head.append(style);
const login=document.createElement('section');login.className='cloud-login';login.innerHTML=`
<h1>Painel do Negócio</h1><p>Entre para gerir os pedidos, custos e resultados do seu negócio.</p>
<form id="cloudLoginForm"><label for="cloudEmail">Email</label><input id="cloudEmail" type="email" autocomplete="username" required><label for="cloudPassword">Palavra-passe</label><input id="cloudPassword" type="password" minlength="8" autocomplete="current-password" required><button class="btn-primary" type="submit">Entrar</button></form>
<div class="cloud-actions"><button class="btn-ghost" id="cloudSignup">Criar conta</button><button class="btn-ghost" id="cloudReset">Recuperar acesso</button></div><div id="cloudLoginMessage" class="cloud-message" role="status"></div>`;document.body.prepend(login);
const sessionNotice=document.createElement('section');sessionNotice.className='cloud-login';sessionNotice.hidden=true;sessionNotice.innerHTML='<h1>A abrir a tua conta</h1><p id="sessionLoadMessage" role="status">A carregar os dados do negócio…</p><div class="cloud-actions"><button type="button" class="btn-primary" id="sessionLoadRetry" hidden>Tentar novamente</button><button type="button" class="btn-ghost" id="sessionSwitchAccount">Entrar noutra conta</button></div>';login.after(sessionNotice);
document.getElementById('sessionLoadRetry').onclick=()=>{if(auth.currentUser)void loadSession(auth.currentUser);};
document.getElementById('sessionSwitchAccount').onclick=()=>signOut(auth);
initAccountMenu();
const status=text=>{const element=document.getElementById('cloudSaveStatus');element.textContent=text;element.dataset.state=text==='Dados guardados'?'saved':text==='A guardar…' || text==='A carregar…'?'saving':'error';const label=document.getElementById('accountSaveLabel');if(label)label.textContent=text==='Dados guardados'?'Guardado automaticamente':text;};
function loginMessage(text){document.getElementById('cloudLoginMessage').textContent=text;}
function authMessage(error){return ({'auth/invalid-credential':'Email ou palavra-passe incorretos.','auth/email-already-in-use':'Este email já tem uma conta.','auth/weak-password':'Use uma palavra-passe com pelo menos 8 caracteres.','auth/too-many-requests':'Aguarde alguns minutos antes de tentar novamente.','auth/network-request-failed':'Não foi possível contactar o serviço de login.'})[error.code] || 'Não foi possível entrar. Verifique os dados e a ligação.';}
async function api(path,options={}){
 if(!navigator.onLine)throw new Error('Sem ligação à internet. Volta a tentar quando a ligação regressar.');
 const token=await auth.currentUser?.getIdToken();if(!token)throw new Error('Entre novamente na sua conta.');
 const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(path==='/state' && stateTag?{'If-None-Match':stateTag}:{}),...options.headers},signal:AbortSignal.timeout(60000)});
 if(response.status===304)return null;
 if(path==='/state' && response.ok)stateTag=response.headers.get('ETag');
 const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error || 'Operação recusada.'),{status:response.status,diagnosticCode:body.code});return body;
}
const clone=value=>structuredClone(value);
function adopt(snapshot){baseline=clone(snapshot);desired=Object.fromEntries(groups.map(name=>[name,snapshot[name].map(clean)]));}
function changed(name){
 const previous=new Map((baseline[name] || []).map(record=>[record.id,record]));const changes=[];
 for(const record of desired[name] || []){const old=previous.get(record.id);previous.delete(record.id);if(!old || JSON.stringify(clean(old))!==JSON.stringify(record))changes.push({id:record.id,revision:old?._revision || 0,record:clone(record)});}
 for(const old of previous.values())changes.push({id:old.id,revision:old._revision,record:null});return changes;
}
function dirty(){return groups.some(name=>changed(name).length);}
async function flush(){
 if(busy)return;busy=true;const activeSession=session;
 try{
  for(const name of groups){while(changed(name).length){
   const changes=[];let bytes=0;for(const change of changed(name)){const size=new TextEncoder().encode(JSON.stringify(change)).length;if(changes.length && (changes.length>=5 || bytes+size>700000))break;changes.push(change);bytes+=size;}const result=await api('/data/'+name,{method:'POST',body:JSON.stringify({changes})});
   if(activeSession!==session)return;
   const revisions=new Map(result.revisions.map(r=>[r.id,r.revision])),records=new Map(baseline[name].map(r=>[r.id,r]));
   for(const change of changes){if(change.record===null)records.delete(change.id);else records.set(change.id,{...change.record,_revision:revisions.get(change.id)});}
   baseline[name]=[...records.values()];
  }}
  failure=null;document.getElementById('cloudRetry').hidden=true;status('Dados guardados');
 }catch(error){if(activeSession!==session)return;failure=error;status('Não guardado: '+error.message);document.getElementById('cloudRetry').hidden=false;}
 finally{busy=false;if(!failure && dirty())void flush();else if(!failure)window.refreshCloudMetrics?.();}
}
window.cloudBackend={
 preferenceKey:key=>`${key}:${auth.currentUser?.uid || "anonymous"}`,
 async shopifyConnected(){if(shopifyConnectionKnown!==null)return shopifyConnectionKnown;await connections();return shopifyConnectionKnown;},
 ready:()=>!dirty() && !busy && !failure,
 catalogPage:after=>api('/shopify/products'+(after?'?'+new URLSearchParams({after}):'')),
 async linkCatalog(bindings){if(dirty() || busy)throw new Error('Aguarda a gravação dos dados.');const result=await api('/shopify/products/link',{method:'POST',body:JSON.stringify({bindings:bindings.map(item=>({...item,revision:baseline.produtos.find(row=>row.id===item.productId)?._revision || 0}))})});await refresh();return result;},
 read:name=>clone(desired[name] || []),
 save(name,records){desired[name]=clone(records);mutation++;status('A guardar…');if(!failure)void flush();},
 async reflectStatus(id,status){
  if(dirty() || busy)throw new Error('Aguarde a gravação dos dados antes de alterar a Shopify.');
  const activeSession=session;let result=await api(`/shopify/orders/${id}/status`,{method:'POST',body:JSON.stringify({status})});
  const apply=result=>{
   if(activeSession!==session || dirty() || busy)return;
   if(!Array.isArray(result.records)){void refresh();return;}
   const next=new Map(baseline.vendas.map(record=>[record.id,record]));for(const record of result.records)next.set(record.id,record);
   baseline.vendas=[...next.values()];desired.vendas=baseline.vendas.map(clean);mutation++;window.applyCloudState(desired);window.refreshCloudMetrics?.();
  };
  apply(result);
  for(let attempt=0;result.pending && attempt<5;attempt++){
   await new Promise(resolve=>setTimeout(resolve,2500));
   if(activeSession!==session || document.visibilityState!=='visible')break;
   try{result=await api(`/shopify/orders/${id}/status?status=${encodeURIComponent(status)}`);apply(result);}catch(error){if(error.status!==409)throw error;}
  }
  return result;
 },
 async syncShopify(){await syncProvider('shopify');},
 async metrics(start,end,product){if(dirty() || busy)return null;const activeSession=session;const result=await api(`/metrics?${new URLSearchParams({start,end,product})}`);return activeSession===session && !dirty() && !busy ? result : null;}
};
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
document.getElementById('cloudRetry').onclick=()=>{failure=null;void flush();};
document.getElementById('cloudLoginForm').onsubmit=async event=>{event.preventDefault();try{await signInWithEmailAndPassword(auth,document.getElementById('cloudEmail').value,document.getElementById('cloudPassword').value);}catch(error){loginMessage(authMessage(error));}};
document.getElementById('cloudSignup').onclick=async()=>{
 const form=document.getElementById('cloudLoginForm');if(!form.reportValidity())return;
 try{const result=await createUserWithEmailAndPassword(auth,document.getElementById('cloudEmail').value,document.getElementById('cloudPassword').value);if(!config.emulators){await sendEmailVerification(result.user);loginMessage('Conta criada. Confirme o email recebido e entre novamente.');await signOut(auth);}}
 catch(error){loginMessage(authMessage(error));}
};
document.getElementById('cloudReset').onclick=async()=>{const email=document.getElementById('cloudEmail');if(!email.reportValidity() || !email.value)return;try{await sendPasswordResetEmail(auth,email.value);loginMessage('Se houver uma conta para este email, receberás instruções para recuperar o acesso.');}catch(error){loginMessage(authMessage(error));}};
document.getElementById('cloudLogout').onclick=async()=>{if(dirty() || busy){status('Aguarde a gravação dos dados antes de sair.');return;}await signOut(auth);location.reload();};
document.getElementById('cloudImport').onclick=()=>{
 if(groups.some(name=>desired[name].length)){status('A importação inicial só está disponível num negócio sem dados.');return;}
 if(!confirm('Importar os dados guardados neste navegador para a conta atual? Faça esta operação apenas com os dados do seu próprio negócio.'))return;
 const keys={fluxo:'lobo_fluxo_caixa_v2',vendas:'lobo_controle_vendas_v2',produtos:'lobo_produtos_v1',ads:'lobo_ad_spend_v1',operacional:'lobo_gastos_operacionais_v1'};
 try{for(const [name,key] of Object.entries(keys)){const records=JSON.parse(localStorage.getItem(key) || '[]');if(!Array.isArray(records))throw new Error('Formato inválido.');window.cloudBackend.save(name,records);}window.applyCloudState(desired);}
 catch{status('Não foi possível importar. Os dados originais continuam neste navegador.');}
};
async function importBackup(file){
 if(groups.some(name=>desired[name].length))throw new Error('Importe o backup numa conta sem dados, para preservar os registos que já guardou.');
 if(file.size>10*1024*1024)throw new Error('O backup excede 10 MB. É necessária uma migração assistida.');
 const backup=JSON.parse(await file.text());
 const records=backup.version===1?backup.records:backup.tipo==='painel-negocio-backup' && backup.versao===1?{fluxo:backup.fluxoData || [],vendas:backup.vendasData || [],produtos:backup.produtosData || [],ads:backup.adSpendData || [],operacional:backup.operacionaisData || []}:null;
 if(!records || groups.some(name=>!Array.isArray(records[name])))throw new Error('Formato de backup inválido.');
 const prepared=Object.fromEntries(groups.map(name=>[name,records[name].map(record=>{
  const result=clean(record);
  if(!/^[A-Za-z0-9_-]{1,180}$/.test(result.id || ''))throw new Error('O backup contém um identificador inválido.');
  if(result.foto && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(result.foto))throw new Error('Fotografia inválida no backup.');
  if(name==='produtos' && !result.locais){result.locais=[{id:(result.id+'__local').slice(0,180),local:result.local || '',quantidade:Number(result.estoque || 0)}];delete result.estoque;delete result.local;}
  if(result.locais && (!Array.isArray(result.locais) || result.locais.some(item=>!item || !/^[A-Za-z0-9_-]{1,180}$/.test(item.id || '') || typeof item.local!=='string' || !Number.isInteger(item.quantidade) || item.quantidade<0)))throw new Error('Locais de stock inválidos no backup.');
  validateRecord(name,result);
  return result;
 })]));
 if(groups.some(name=>new Set(prepared[name].map(record=>record.id)).size!==prepared[name].length))throw new Error('O backup contém registos repetidos.');
 if(!confirm('Importar este backup para a conta atual? Confirme que pertence ao seu negócio.'))return;
 for(const name of groups)window.cloudBackend.save(name,prepared[name]);window.applyCloudState(desired);
}
window.cloudBackend.importBackup=importBackup;
document.getElementById('cloudBackupFile').onchange=async event=>{const input=event.target,file=input.files[0];if(!file)return;try{await importBackup(file);}catch(error){status(error.message || 'Não foi possível ler o backup.');}finally{input.value='';}};
async function refresh(){
 if(!loaded || !user || dirty() || busy || failure)return;const started=mutation;
 try{const snapshot=await api('/state');if(started!==mutation || dirty() || busy)return;if(snapshot && JSON.stringify(snapshot)!==JSON.stringify(baseline)){adopt(snapshot);window.applyCloudState(desired);}if(Date.now()-lastConnectionsCheck>300000)await connections();}
 catch(error){status('Ligação interrompida: '+error.message);}
}
async function syncProvider(provider){
 const target=document.getElementById(provider+'ConnectionMessage');target.textContent='A sincronizar…';
 try{if(dirty() || busy)throw new Error('Aguarde a gravação dos dados antes de sincronizar.');const result=await api('/sync/'+provider,{method:'POST'});target.textContent=result.busy ? 'Já existe uma sincronização em curso.' : (result.partial?result.message:`${result.count} registo(s) consultado(s).`);await refresh();}
 catch(error){target.textContent=error.message;}
}
function setupIntegrations(){
 const panel=document.getElementById('cloudIntegrationsShopify');panel.innerHTML=`<h2>Shopify <span class="tag" id="shopifyStatusTag">Não ligada</span></h2><p class="cloud-help">Importe pedidos automaticamente e receba alterações da loja. Concluir regista o pedido inteiro como processado e pago na Shopify: usa esta ação depois de receber o pagamento. Não cobra o cartão do cliente. Cancelar não faz um reembolso automático.</p><div class="cloud-integration"><label for="cloudShop">Domínio da loja</label><br><input id="cloudShop" placeholder="nome.myshopify.com" autocomplete="off"><div class="cloud-actions"><button class="btn-primary" id="connectShopify">Ligar Shopify</button><button class="btn-ghost" id="syncShopify">Sincronizar agora</button><button class="btn-ghost" id="disconnectShopify">Desligar</button></div></div><div class="cloud-message" id="shopifyConnectionMessage" role="status"></div>`;
 const meta=document.createElement('div');meta.className='panel';meta.innerHTML=`<h2>Meta Ads <span class="tag" id="metaStatusTag">Não ligado</span></h2><p class="cloud-help">Importe gastos diários por campanha. O nome da campanha deve corresponder ao produto; pode incluir uma data no fim. Campanhas sem correspondência ou com vários produtos entram no total geral. Gastos manuais já lançados não são eliminados; evite lançar manualmente o mesmo gasto importado.</p><div class="cloud-actions"><button class="btn-primary" id="connectMeta">Ligar Meta Ads</button><button class="btn-ghost" id="syncMeta">Sincronizar agora</button><button class="btn-ghost" id="disconnectMeta">Desligar</button></div><div class="cloud-integration" id="metaAccountControls" hidden><label for="metaAccount">Conta de anúncios</label><br><select id="metaAccount"></select><br><label for="metaRate">Taxa de câmbio para MZN (apenas se a conta usar outra moeda)</label><br><input id="metaRate" type="number" min="0" step="0.0001" placeholder="1 unidade da moeda = ... MZN"><div class="cloud-actions"><button class="btn-ghost" id="chooseMetaAccount">Usar esta conta</button></div></div><div class="cloud-message" id="metaConnectionMessage" role="status"></div>`;
 panel.after(meta);
 for(const provider of ['shopify','meta']){
  const cap=provider==='shopify' ? 'Shopify' : 'Meta';
  document.getElementById('connect'+cap).onclick=async()=>{try{if(dirty())throw new Error('Aguarde a gravação dos dados.');const result=await api('/oauth/'+provider,{method:'POST',body:JSON.stringify(provider==='shopify' ? {shop:document.getElementById('cloudShop').value} : {})});location.assign(result.url);}catch(error){document.getElementById(provider+'ConnectionMessage').textContent=error.message;}};
  document.getElementById('sync'+cap).onclick=()=>syncProvider(provider);
  document.getElementById('disconnect'+cap).onclick=async()=>{if(!confirm('Desligar a integração? Os dados já importados serão mantidos.'))return;try{await api('/connections/'+provider,{method:'DELETE'});await connections();}catch(error){document.getElementById(provider+'ConnectionMessage').textContent=error.message;}};
 }
 document.getElementById('metaRate').oninput=()=>{metaRateEditing=true;};
 document.getElementById('chooseMetaAccount').onclick=async()=>{const button=document.getElementById('chooseMetaAccount'),message=document.getElementById('metaConnectionMessage');button.disabled=true;message.textContent='A guardar a conta e a taxa de câmbio…';try{const result=await api('/meta/account',{method:'POST',body:JSON.stringify({accountId:document.getElementById('metaAccount').value,conversionRate:Number(document.getElementById('metaRate').value)})});metaRateEditing=false;await connections();await refresh();message.textContent=(result.partial?'Taxa guardada. A importação continua automaticamente.':'Conta e taxa de câmbio guardadas.');}catch(error){message.textContent=error.message;}finally{button.disabled=false;}};
}
let metaAccountsLoaded=false,metaRateEditing=false,shopifyConnectionKnown=null;
async function connections(){
 const result=await api('/connections');lastConnectionsCheck=Date.now();shopifyConnectionKnown=Boolean(result.shopify.connected);
 for(const provider of ['shopify','meta']){const connection=result[provider],cap=provider==='shopify'?'Shopify':'Meta';
 document.getElementById(provider==='shopify'?'shopifyStatusTag':'metaStatusTag').textContent=connection.connected ? 'Ligada'+(connection.lastSync ? ' · '+new Date(connection.lastSync).toLocaleString('pt-MZ',{timeZone:'Africa/Maputo'}) : '') : 'Não ligada';
 document.getElementById('connect'+cap).disabled=!connection.configured;
 document.getElementById('connect'+cap).textContent=connection.connected?'Reautorizar':provider==='shopify'?'Ligar Shopify':'Ligar Meta Ads';
 if(provider==='shopify' && connection.shop && !document.getElementById('cloudShop').value)document.getElementById('cloudShop').value=connection.shop;
 document.getElementById('sync'+cap).disabled=!connection.connected;
 document.getElementById('disconnect'+cap).hidden=!connection.connected;
 document.getElementById(provider+'ConnectionMessage').textContent=!connection.configured ? 'A integração precisa de configuração pelo administrador antes de poder ser ligada.' : connection.lastError || connection.catalogLastError || (connection.unmatchedCampaigns?.some(name=>provider!=='meta' || !metaProductResolver(desired.produtos || [])(name)) ? 'Campanhas sem produto: '+connection.unmatchedCampaigns.filter(name=>provider!=='meta' || !metaProductResolver(desired.produtos || [])(name)).join(', ') : '');
 }
 if(result.meta.connected && !metaAccountsLoaded){const response=await api('/meta/accounts');const select=document.getElementById('metaAccount');select.replaceChildren(...response.accounts.map(account=>{const option=document.createElement('option');option.value=account.id;option.textContent=`${account.name} (${account.currency})`;return option;}));select.value=result.meta.accountId || select.options[0]?.value || '';metaAccountsLoaded=true;}
 if(!result.meta.connected){metaAccountsLoaded=false;metaRateEditing=false;document.getElementById('metaRate').value='';}
 if(result.meta.connected && !metaRateEditing)document.getElementById('metaRate').value=result.meta.conversionRate ?? '';
 document.getElementById('metaAccountControls').hidden=!result.meta.connected;window.updateConnectionSummary?.();
}
async function loadSession(current){
 const activeSession=++session;user=current;stateTag=null;shopifyConnectionKnown=null;
 if(!current){sessionNotice.hidden=true;loginMessage('');document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());login.hidden=false;wrap.hidden=true;baseline={};desired={};failure=null;return;}
 wrap.hidden=true;login.hidden=true;sessionNotice.hidden=false;document.getElementById('sessionLoadMessage').textContent='A carregar os dados do negócio…';document.getElementById('sessionLoadRetry').hidden=true;
 try{
  const snapshot=await api('/state');if(activeSession!==session)return;adopt(snapshot);
  if(!loaded){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/dashboard.js?v='+(document.querySelector('meta[name="painel-build"]')?.content || '');script.onload=resolve;script.onerror=reject;document.body.append(script);});setupIntegrations();initExperience();loaded=true;}
  else window.applyCloudState(desired);
  document.getElementById('cloudIdentity').textContent=current.email+(config.emulators?' · Desenvolvimento local':'');
  sessionNotice.hidden=true;loginMessage('');login.hidden=true;wrap.hidden=false;status(dirty() || busy?'A guardar…':'Dados guardados');
  try{await connections();}catch{document.getElementById('shopifyConnectionMessage').textContent='Não foi possível atualizar o estado das integrações. Tenta novamente no menu de utilizador.';}
 }catch(error){if(activeSession!==session)return;wrap.hidden=true;login.hidden=true;sessionNotice.hidden=false;document.getElementById('sessionLoadMessage').textContent=error.status===401?'A sessão expirou. Entra novamente na tua conta.':[403,422,429,503].includes(error.status)?error.message:'A tua sessão foi reconhecida, mas não foi possível carregar os dados do negócio. Tenta novamente.';if(/^[A-Z_]{1,50}$/.test(error.diagnosticCode || ''))document.getElementById('sessionLoadMessage').textContent+=' Código: '+error.diagnosticCode+'.';document.getElementById('sessionLoadRetry').hidden=false;}
}
onAuthStateChanged(auth,current=>void loadSession(current));
setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh();});

if('serviceWorker' in navigator){const register=()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});if(document.readyState==='complete')void register();else window.addEventListener('load',register,{once:true});}

}
