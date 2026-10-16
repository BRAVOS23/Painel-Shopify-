const $=id=>document.getElementById(id);
export function initNavigation(){
 // O catálogo conserva os seus formulários e IDs, mas pertence à navegação principal.
 $('secProdutos').append($('metricasViewProdutos'));
 $('subnavMetProdutos').hidden=true;$('subnavMetCadastros').hidden=true;$('subnavMetGastos').textContent='Gastos';
 $('subnavVendasMeses').hidden=true;$('subnavVendasPedidos').textContent='Lista de pedidos';
 const heading=document.createElement('div');heading.className='section-heading orders-heading';heading.innerHTML='<div><h2>Pedidos</h2><p>Consulta qualquer período, encontra um pedido ou organiza as entregas.</p></div><button class="btn-primary" id="ordersNewOrder">Novo pedido</button>';
 const period=document.createElement('div');period.className='orders-period';period.innerHTML='<span>Período dos pedidos</span>';period.append($('drOverview'));
 $('secVendas').prepend(heading,period);$('ordersNewOrder').onclick=()=>window.openNewOrder(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit'}).format(new Date()));
 const planning=document.createElement('details');planning.id='deliveryPlanning';planning.className='delivery-planning';planning.innerHTML='<summary>Organizar entregas por mês e semana</summary><p class="report-help">Esta organização é independente do período usado para consultar a lista e os relatórios.</p>';
 for(const panel of [...$('vendasViewPedidos').children])planning.append(panel);
 const list=$('vendaTableBody').closest('.panel');$('vendasViewPedidos').append(list,planning);
 const reportHeading=$('vendasViewRelatorios').querySelector('h2');reportHeading.textContent='Desempenho das entregas';
 $('reportRevenue').parentElement.hidden=true;
 const delivery=$('entregasBody').closest('.panel');delivery.querySelector('.report-help').textContent='Unidades e entregas concluídas no período escolhido.';
 $('entregasBody').closest('table').classList.add('operational-deliveries');
 const originalNavigate=window.navigateOrders;window.navigateOrders=(month,week)=>{originalNavigate(month,week);if(month){const [year,number]=month.split('-').map(Number);drOverview.setRange([month+'-01',new Date(Date.UTC(year,number,0)).toISOString().slice(0,10)],null);window.renderOverview();}planning.open=Boolean(week);};
 const originalNew=window.openNewOrder;window.openNewOrder=month=>{originalNew(month);planning.open=true;$('vContacto').focus();$('vendaFormBody').scrollIntoView({block:'start',behavior:'smooth'});};
 const dialog=document.createElement('dialog');dialog.id='expenseDialog';dialog.className='app-dialog expense-dialog';dialog.setAttribute('aria-labelledby','expenseDialogTitle');dialog.innerHTML='<div class="dialog-head"><h2 id="expenseDialogTitle">Registar gasto</h2><button type="button" class="dialog-close" aria-label="Fechar registo de gasto">×</button></div><div class="dialog-body"></div>';$('metricasViewCadastros').classList.add('active');dialog.querySelector('.dialog-body').append($('metricasViewCadastros'));document.body.append(dialog);dialog.querySelector('.dialog-close').onclick=()=>dialog.close();
 window.openExpenseDialog=()=>{if(!dialog.open)dialog.showModal();};
 const add=document.createElement('button');add.id='registerExpense';add.className='btn-primary';add.textContent='Registar gasto';add.onclick=()=>window.openExpenseEntry();$('metricasViewGastos').querySelector('.toolbar').append(add);
 const productsHeading=document.createElement('div');productsHeading.className='section-heading';productsHeading.innerHTML='<div><h2>Produtos</h2><p>Catálogo, custos e stock local. As ligações à Shopify mantêm o stock independente.</p></div>';$('secProdutos').prepend(productsHeading);
 $('summaryProducts').onclick=()=>window.switchMain('produtos');
}
