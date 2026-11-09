import {todayDeliveryScope} from './orders.mjs';
const $=id=>document.getElementById(id);
export function initNavigation(){
 // O catálogo conserva os seus formulários e IDs, mas pertence à navegação principal.
 $('secProdutos').append($('metricasViewProdutos'));
 $('subnavMetProdutos').hidden=true;$('subnavMetCadastros').hidden=true;$('subnavMetGastos').textContent='Gastos';
 $('subnavVendasMeses').hidden=true;$('subnavVendasPedidos').textContent='Lista';
 const heading=document.createElement('div');heading.className='section-heading orders-heading';heading.innerHTML='<div><h2>Pedidos</h2></div><button class="btn-primary" id="ordersNewOrder">Novo pedido</button>';
 const period=document.createElement('div');period.className='orders-period';period.innerHTML='<span>Período dos pedidos</span>';period.append($('drOverview'));
 $('secVendas').prepend(heading);$('secVendas').querySelector('.subnav').after(period);$('ordersNewOrder').onclick=()=>window.openNewOrder(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit'}).format(new Date()));
 const planning=document.createElement('div');planning.id='deliveryPlanning';planning.className='delivery-planning';
 const workspace=document.createElement('div');workspace.id='vendasViewEntregas';workspace.className='subview';$('vendasViewPedidos').after(workspace);workspace.append(planning);
 const deliveryTab=document.createElement('button');deliveryTab.id='subnavVendasEntregas';deliveryTab.textContent='Entregas';deliveryTab.onclick=()=>window.switchVendasView('entregas');$('subnavVendasPedidos').before(deliveryTab);
 window.openDeliveryWorkspace=()=>window.switchVendasView('entregas');
 for(const panel of [...$('vendasViewPedidos').children])planning.append(panel);
 const list=$('vendaTableBody').closest('.panel');$('vendasViewPedidos').append(list);list.classList.add('orders-list-panel');list.querySelector('h2').hidden=true;const exportButton=list.querySelector('button[onclick="exportVendasCSV()"]');exportButton.textContent='Exportar CSV';exportButton.classList.add('export-orders-link');
 const reportHeading=$('vendasViewRelatorios').querySelector('h2');reportHeading.textContent='Desempenho das entregas';
 $('reportRevenue').parentElement.hidden=true;
 const delivery=$('entregasBody').closest('.panel');delivery.querySelector('.report-help').textContent='Unidades e entregas concluídas no período escolhido.';
 $('entregasBody').closest('table').classList.add('operational-deliveries');
 const originalNavigate=window.navigateOrders;window.navigateOrders=(month,week)=>{originalNavigate(month,week);if(month){const [year,number]=month.split('-').map(Number);drOverview.setRange([month+'-01',new Date(Date.UTC(year,number,0)).toISOString().slice(0,10)],null);window.renderOverview();}if(week)window.switchVendasView('entregas');};
 window.focusOrder=id=>{const row=window.cloudBackend.read('vendas').find(row=>row.id===id);if(!row)return;window.navigateOrders(row.mes,row.semana);$('pedidosBusca').value='';$('pedidosEstado').value='';pedidosExpandidos.add(id);window.renderPedidos();const card=document.getElementById('pedido_'+id);if(card){card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:'smooth'});}};
 // Só os botões de navegação mudam o destino padrão. Atalhos de edição e
 // de pedidos concretos conservam o mês/semana do registo que abriram.
 const top=()=>window.scrollTo({top:0,left:0,behavior:'instant'});
 const openToday=()=>{
  const {month,week}=todayDeliveryScope();
  $('pedidosBusca').value='';$('pedidosEstado').value='';
  if(vendaFormAberto)toggleVendaForm();
  if(modoSelecaoPedidos)cancelarModoSelecaoPedidos();
  window.navigateOrders(month,week);top();
 };
 for(const [id,section] of [['tabBtnResumo','resumo'],['tabBtnVendas','vendas'],['tabBtnProdutos','produtos'],['tabBtnMetricas','metricas']]){
  $(id).onclick=()=>{if(section==='vendas')openToday();else{window.switchMain(section);top();}};
 }
 for(const [id,view] of [['subnavVendasEntregas','entregas'],['subnavVendasPedidos','pedidos'],['subnavVendasRelatorios','relatorios']])$(id).onclick=()=>{window.switchVendasView(view);top();};
 for(const [id,view] of [['subnavMetResultados','resultados'],['subnavMetGastos','gastos']])$(id).onclick=()=>{window.switchMetricasView(view);top();};
 const todayButton=document.createElement('button');todayButton.id='deliveryToday';todayButton.type='button';todayButton.className='btn-ghost';todayButton.textContent='Hoje';todayButton.setAttribute('aria-label','Ver entregas na semana de hoje');todayButton.onclick=openToday;
 $('mesVendasEditor').parentElement.prepend(todayButton);
 $('vendaFormToggle').onclick=()=>{if(vendaFormAberto)toggleVendaForm();else window.openNewOrder($('mesVendasEditor').value);};
 window.switchVendasView('entregas');
 const originalNew=window.openNewOrder;window.openNewOrder=month=>{originalNew(month);window.switchVendasView('entregas');$('vContacto').focus();$('vendaFormBody').scrollIntoView({block:'start',behavior:'smooth'});};
 const dialog=document.createElement('dialog');dialog.id='expenseDialog';dialog.className='app-dialog expense-dialog';dialog.setAttribute('aria-labelledby','expenseDialogTitle');dialog.innerHTML='<div class="dialog-head"><h2 id="expenseDialogTitle">Registar gasto</h2><button type="button" class="dialog-close" aria-label="Fechar registo de gasto">×</button></div><div class="dialog-body"></div>';$('metricasViewCadastros').classList.add('active');dialog.querySelector('.dialog-body').append($('metricasViewCadastros'));document.body.append(dialog);dialog.querySelector('.dialog-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(dialog.open)return;window.cancelAdEdit();window.cancelOutroEdit();window.cancelOpEdit();for(const id of ['adMsg','outroMsg','opMsg'])$(id).textContent='';});
 window.openExpenseDialog=()=>{if(!dialog.open)dialog.showModal();};
 const add=document.createElement('button');add.id='registerExpense';add.className='btn-primary';add.textContent='Registar gasto';add.onclick=()=>window.openExpenseEntry();$('metricasViewGastos').querySelector('.toolbar').append(add);
 const productsHeading=document.createElement('div');productsHeading.className='section-heading';productsHeading.innerHTML='<div><h2>Produtos</h2><p>Catálogo, custos e stock local. As ligações à Shopify mantêm o stock independente.</p></div>';$('secProdutos').prepend(productsHeading);
 $('summaryProducts').onclick=()=>window.switchMain('produtos');
}
