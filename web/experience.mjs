import {initInstallationUi} from './install.mjs';
import {initUsability} from './usability.mjs';
import {scheduleOrder} from './orders.mjs';
const $=id=>document.getElementById(id);
const escape=value=>String(value || '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>Number(value || 0).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' MT';
const day=value=>value?value.split('-').reverse().join('/'):'';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const snapshot=()=>Object.fromEntries(['fluxo','vendas','produtos','ads','operacional'].map(name=>[name,window.cloudBackend.read(name)]));
function showDialog(dialog){if(!dialog.open)dialog.showModal();}
function wireClose(dialog){dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();}});}
export function initAccountMenu(){
 const personal=document.createElement('div');personal.className='header-personal';personal.innerHTML='<span id="cloudSaveStatus" class="save-indicator" role="status">A carregar…</span><button id="accountMenuButton" class="account-trigger" type="button" aria-label="Abrir menu de utilizador" aria-haspopup="dialog" aria-controls="accountDialog">⋯</button>';
 document.querySelector('.header-tabs-row').append(personal);
 const dialog=document.createElement('dialog');dialog.id='accountDialog';dialog.className='app-dialog account-dialog';dialog.setAttribute('aria-labelledby','accountTitle');dialog.innerHTML=`
 <div class="dialog-head"><h2 id="accountTitle">O teu espaço</h2><button class="dialog-close" type="button" data-close aria-label="Fechar menu">×</button></div>
 <div class="account-tabs" role="tablist" aria-label="Configurações"><button id="accountTabConta" role="tab" aria-controls="accountPaneConta" aria-selected="true">Conta</button><button id="accountTabIntegracoes" role="tab" aria-controls="accountPaneIntegracoes" aria-selected="false">Integrações</button><button id="accountTabDados" role="tab" aria-controls="accountPaneDados" aria-selected="false">Dados</button></div>
 <div class="dialog-body"><section id="accountPaneConta" class="account-pane" role="tabpanel" aria-labelledby="accountTabConta"><div class="account-identity"><strong>A tua conta</strong><span id="cloudIdentity"></span></div><div class="account-line"><div>Aparência<p>Escolhe o tema que te é mais confortável.</p></div><div id="accountThemeSlot"></div></div><div class="account-line"><div>Guardar alterações<p>Os dados são associados à tua conta.</p></div><button id="cloudRetry" class="btn-ghost" hidden>Tentar novamente</button><span id="accountSaveLabel" class="muted">Guardado automaticamente</span></div><div class="account-line"><span>Sessão</span><button id="cloudLogout" class="btn-ghost">Sair da conta</button></div></section>
 <section id="accountPaneIntegracoes" class="account-pane" role="tabpanel" aria-labelledby="accountTabIntegracoes" hidden></section>
 <section id="accountPaneDados" class="account-pane" role="tabpanel" aria-labelledby="accountTabDados" hidden><div id="accountBackupSlot"></div><details><summary class="muted" style="cursor:pointer;margin:16px 0">Importar de outras fontes</summary><button class="btn-ghost" id="cloudImport">Importar dados deste navegador</button><input id="cloudBackupFile" type="file" accept="application/json,.json" hidden><p class="account-data-help">Usa apenas dados do teu negócio. Os backups também incluem os movimentos antigos de caixa.</p><div id="accountCsvSlot"></div></details></section></div>`;
 document.body.append(dialog);wireClose(dialog);initInstallationUi($('accountPaneConta'));
 function tab(name){for(const key of ['Conta','Integracoes','Dados']){$('accountPane'+key).hidden=key!==name;$('accountTab'+key).setAttribute('aria-selected',String(key===name));$('accountTab'+key).tabIndex=key===name?0:-1;}}
 for(const key of ['Conta','Integracoes','Dados'])$('accountTab'+key).onclick=()=>tab(key);
 const tabs=[...dialog.querySelectorAll('[role="tab"]')];tabs.forEach((button,index)=>button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:-1)+3)%3;tabs[next].click();tabs[next].focus();});
 window.openAccountMenu=(name='Conta')=>{tab(name);showDialog(dialog);};$('accountMenuButton').onclick=()=>window.openAccountMenu();
 $('accountThemeSlot').append($('themeToggleBtn'));
 return dialog;
}
export function initExperience(){
 const config=$('vendasViewConfig'),panels=[...config.children];
 $('accountBackupSlot').append(panels[0]);
 const shopify=$('cloudIntegrationsShopify'),meta=shopify.nextElementSibling;
 $('accountPaneIntegracoes').append(shopify);if(meta?.querySelector('#connectMeta'))$('accountPaneIntegracoes').append(meta);
 for(const panel of [...config.children])$('accountCsvSlot').append(panel);
 config.hidden=true;
 const dialog=document.createElement('dialog');dialog.id='scheduleDialog';dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','scheduleTitle');dialog.innerHTML=`<div class="dialog-head"><h2 id="scheduleTitle">Reagendar entrega</h2><button class="dialog-close" type="button" data-close aria-label="Fechar reagendamento">×</button></div><div class="dialog-body"><form id="scheduleForm" class="schedule-form"><div id="scheduleSource" class="schedule-source"></div><div id="scheduleSelection" class="schedule-selection" hidden></div><div class="schedule-grid"><label>Nova data da entrega<input id="scheduleDate" type="date" required></label><label id="scheduleTimeLabel">Horário<input id="scheduleTime" type="time"></label></div><label>Grupo de pedidos<select id="scheduleGroup"><option value="">Semana da nova data</option><option value="semana1">Semana 1</option><option value="semana2">Semana 2</option><option value="semana3">Semana 3</option><option value="semana4">Semana 4</option><option value="remarketing">Remarketing</option><option value="provincias">Províncias</option></select></label><p class="muted">O pedido passa para o mês da nova entrega. A data original e o histórico de reagendamentos ficam guardados.</p><p id="scheduleError" class="schedule-error" role="alert"></p><div class="schedule-actions"><button type="button" class="btn-ghost" id="scheduleCancel">Voltar</button><button class="btn-primary" id="scheduleSubmit" type="submit">Guardar reagendamento</button></div></form></div>`;
 document.body.append(dialog);wireClose(dialog);$('scheduleCancel').onclick=()=>dialog.close();let singleId=null;
 function defaultDate(month){return month===today().slice(0,7)?today():month+'-01';}
 function open(ids,date,single){singleId=single;const sales=window.cloudBackend.read('vendas'),selected=sales.filter(row=>ids.includes(row.id));if(!selected.length){toast('Não há pedidos remarcados para transferir.');return;}
  $('scheduleForm').reset();$('scheduleError').textContent='';$('scheduleDate').value=date;$('scheduleTimeLabel').hidden=!single;$('scheduleSelection').hidden=Boolean(single);$('scheduleTitle').textContent=single?'Reagendar entrega':'Trazer pedidos remarcados';
  if(single){const row=selected[0];$('scheduleSource').textContent=`${row.contacto || 'Pedido'} · entrega atual: ${day(row.data)}`;$('scheduleTime').value=row.horario || '';}
  else{$('scheduleSource').textContent=`${selected.length} pedido(s) de meses anteriores. Escolhe os que queres trazer.`;$('scheduleSelection').innerHTML=selected.map(row=>`<label><input type="checkbox" name="scheduleIds" value="${escape(row.id)}" checked><span>${escape(row.contacto || row.produto || 'Pedido')}<small>${day(row.data)} · ${escape(row.produto || '')}</small></span></label>`).join('');}
  showDialog(dialog);
 }
 window.openReschedule=id=>{const row=window.cloudBackend.read('vendas').find(row=>row.id===id);if(!row)return;open([id],row.data<today()?today():row.data,id);};
 window.openCarryRescheduled=(month=$('mesVendasEditor').value)=>{const ids=window.cloudBackend.read('vendas').filter(row=>row.status==='remarcado' && row.mes<month).map(row=>row.id);open(ids,defaultDate(month),null);};
 $('scheduleForm').onsubmit=event=>{
  event.preventDefault();if(!$('scheduleForm').reportValidity())return;
  try{
   const ids=singleId?[singleId]:[...dialog.querySelectorAll('input[name="scheduleIds"]:checked')].map(input=>input.value);if(!ids.length)throw new Error('Seleciona pelo menos um pedido.');
   const state=snapshot(),rows=state.vendas,options={date:$('scheduleDate').value,group:$('scheduleGroup').value};if(singleId)options.time=$('scheduleTime').value;
   if(ids.some(id=>!rows.some(row=>row.id===id)))throw new Error('Um pedido mudou entretanto. Fecha e abre novamente o reagendamento.');
   const next=rows.map(row=>ids.includes(row.id)?scheduleOrder(row,options):row);
   window.cloudBackend.save('vendas',next);state.vendas=next;window.applyCloudState(state);
   const first=next.find(row=>row.id===ids[0]);window.navigateOrders(first.mes,first.semana);dialog.close();toast(`${ids.length===1?'Entrega reagendada':'Entregas reagendadas'} para ${day(options.date)}. A guardar…`);
  }catch(error){$('scheduleError').textContent=error.message;}
 };
 let request=0;
 const monthInput=$('summaryMonth');monthInput.value=today().slice(0,7);monthInput.onchange=()=>renderSummary();
 $('summaryNewOrder').onclick=()=>window.openNewOrder(monthInput.value);$('summaryReschedule').onclick=()=>window.openCarryRescheduled(monthInput.value);
 $('summaryProducts').onclick=()=>{window.switchMain('metricas');window.switchMetricasView('produtos');};$('summaryConnections').onclick=()=>window.openAccountMenu('Integracoes');
 async function renderSummary(){
  if(!$('secResumo').classList.contains('active'))return;
  const month=monthInput.value || today().slice(0,7),state=snapshot(),rows=state.vendas.filter(row=>row.mes===month),openRows=rows.filter(row=>['pendente','remarcado'].includes(row.status));
  $('summaryOpen').textContent=openRows.length;$('summaryDone').textContent=rows.filter(row=>row.status==='concluido').length;
  const upcoming=[...openRows].sort((a,b)=>a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || '')).slice(0,5);
  $('summaryOrders').innerHTML=upcoming.length?upcoming.map(row=>`<div class="summary-row"><div><strong>${escape(row.contacto || 'Pedido sem contacto')}</strong><small>${day(row.data)}${row.horario?' · '+escape(row.horario):''} · ${escape(row.produto || row.local || '')}</small></div><button class="btn-ghost" data-order="${escape(row.id)}">Ver pedido</button></div>`).join(''):'<div class="empty" style="padding:28px 0">Não há entregas em aberto neste mês.</div>';
  $('summaryOrders').querySelectorAll('[data-order]').forEach(button=>button.onclick=()=>{const row=state.vendas.find(row=>row.id===button.dataset.order);window.navigateOrders(row.mes,row.semana);});
  const previous=state.vendas.filter(row=>row.status==='remarcado' && row.mes<month);$('summaryNotice').hidden=!previous.length;$('summaryNotice').innerHTML=previous.length?`<span>${previous.length} pedido(s) remarcado(s) de meses anteriores à espera de uma nova data.</span><button class="btn-ghost" id="summaryCarryButton">Trazer para este mês</button>`:'';if(previous.length)$('summaryCarryButton').onclick=()=>window.openCarryRescheduled(month);
  const current=++request;$('summaryMetricsNote').textContent='A atualizar os resultados…';
  const [year,number]=month.split('-').map(Number),end=new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
  try{const metrics=await window.cloudBackend.metrics(month+'-01',end,'');if(current!==request || !$('secResumo').classList.contains('active'))return;if(!metrics){$('summaryMetricsNote').textContent='Os resultados serão atualizados depois de guardar as alterações.';return;}
   $('summaryRevenue').textContent=money(metrics.revenue);$('summaryProfit').textContent=money(metrics.profit);$('summaryMetricsNote').textContent=metrics.missingProductCount?`${metrics.missingProductCount} venda(s) sem custo de produto registado. Completa os custos em Produtos para melhorar a estimativa de lucro.`:'Os resultados usam os pedidos concluídos e os custos registados no período.';
  }catch{$('summaryMetricsNote').textContent='Não foi possível atualizar os resultados. Verifica a ligação à internet.';}
 }
 function carryNotice(){const month=$('mesVendasEditor').value,previous=window.cloudBackend.read('vendas').filter(row=>row.status==='remarcado' && row.mes<month);$('carryNotice').hidden=!previous.length;$('carryNotice').innerHTML=previous.length?`<span>${previous.length} pedido(s) remarcado(s) em meses anteriores.</span><button class="btn-ghost" id="carryOrdersButton">Trazer para este mês</button>`:'';if(previous.length)$('carryOrdersButton').onclick=()=>window.openCarryRescheduled(month);}
 window.renderExperience=()=>{carryNotice();void renderSummary();};
 window.updateConnectionSummary=()=>{const shop=$('shopifyStatusTag').textContent,meta=$('metaStatusTag').textContent;$('summaryConnectionState').textContent=`Shopify: ${shop.startsWith('Ligada')?'ligada':'não ligada'} · Meta Ads: ${meta.startsWith('Ligada')?'ligado':'não ligado'}`;};
 initUsability();window.switchMain('resumo');window.renderExperience();
}
function toast(message){let element=$('experienceToast');if(!element){element=document.createElement('div');element.id='experienceToast';element.className='toast-message';element.setAttribute('role','status');document.body.append(element);}element.textContent=message;element.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.hidden=true,4500);}
