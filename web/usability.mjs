import {initOrderReports} from './order-reports.mjs';
import {initShopifyCatalog} from './shopify-catalog.mjs';
import {initManualBackupRestore} from './manual-cleanup.mjs';
import {initReconciliation} from './reconcile.mjs';
const $=id=>document.getElementById(id);
const button=(text,handler,className='btn-ghost')=>{const node=document.createElement('button');node.type='button';node.className=className;node.textContent=text;node.onclick=handler;return node;};
export function initUsability(){
 // Pedidos: pesquisa e estado disponíveis sem abrir relatórios.
 const search=document.createElement('div');search.className='order-search-row';search.innerHTML='<input id="pedidosBusca" type="search" placeholder="Procurar nome, telefone, produto ou local" aria-label="Procurar pedidos"><select id="pedidosEstado" aria-label="Estado dos pedidos"><option value="">Todos em aberto</option><option value="pendente">Pendentes</option><option value="remarcado">Remarcados</option></select>';
 $('pedidosBody').parentElement.querySelector('.toolbar').before(search);search.style.marginBottom='16px';
 $('pedidosBusca').oninput=()=>window.renderPedidos();$('pedidosEstado').onchange=()=>window.renderPedidos();
 const orderForm=$('vendaForm'),extra=document.createElement('details');extra.className='form-secondary';extra.id='orderExtraFields';extra.innerHTML='<summary>Mais detalhes: origem, nota e entregador</summary><div class="secondary-fields"></div>';
 for(const id of ['vFonte','vDescricao','vDelivery','vComissao','vStatus'])extra.querySelector('div').append($(id).closest('.field'));
 const statusHelp=document.createElement('small');statusHelp.id='shopifyEditStatusHelp';statusHelp.className='muted';statusHelp.hidden=true;statusHelp.textContent='Para atualizar também a Shopify, usa Concluir ou Cancelar no pedido.';extra.querySelector('#vStatus').after(statusHelp);
 orderForm.insertBefore(extra,$('vendaSubmitBtn').closest('.field'));
 // Contacto e local vêm primeiro; a data, o produto e o valor continuam visíveis.
 const first=orderForm.firstElementChild;for(const id of ['vContacto','vLocal'])orderForm.insertBefore($(id).closest('.field'),first);
 $('vContacto').required=true;
 // Um formulário de gastos de cada vez, sem alterar as categorias contabilísticas.
 const expenseView=$('metricasViewCadastros'),panels=[...expenseView.children],types=document.createElement('div');types.className='expense-types';types.setAttribute('role','group');types.setAttribute('aria-label','Categoria do gasto');
 const choices=[['ads','Anúncios','Regista o gasto manual com publicidade. Se já vier do Meta Ads, evita registar o mesmo valor duas vezes.'],['outros','Outros','Embalagens, combustível, taxas e outras despesas do negócio.'],['operacional','Loja','Mensalidade da Shopify, domínio, aplicações e outros custos da loja.']];
 const intro=document.createElement('p');intro.className='expense-intro';expenseView.prepend(intro);expenseView.prepend(types);
 window.chooseExpenseType=type=>{choices.forEach(([key,,help],index)=>{panels[index].hidden=key!==type;types.children[index].setAttribute('aria-pressed',String(key===type));if(key===type)intro.textContent=help;});};
 for(const [key,label]of choices)types.append(button(label,()=>window.chooseExpenseType(key),'expense-type'));
 window.chooseExpenseType('ads');
 window.openExpenseEntry=(type='ads')=>{window.switchMain('metricas');window.switchMetricasView('cadastros');window.chooseExpenseType(type);$(type==='ads'?'adValor':type==='outros'?'outroNome':'opNome').focus();};
 const addExpense=button('Registar gasto',()=>window.openExpenseEntry($('gastosFiltroTipo').value || 'ads'),'btn-primary');$('metricasViewGastos').querySelector('.toolbar').append(addExpense);
 // O catálogo é a entrada de Produtos; criar/editar usa o mesmo formulário num diálogo.
 const productPanel=$('produtoForm').closest('.panel'),productDialog=document.createElement('dialog');productDialog.id='productDialog';productDialog.className='app-dialog product-dialog';productDialog.setAttribute('aria-labelledby','productDialogTitle');productDialog.innerHTML='<div class="dialog-head"><h2 id="productDialogTitle">Novo produto</h2><button type="button" class="dialog-close" aria-label="Fechar produto">×</button></div><div class="dialog-body"></div>';
 productDialog.querySelector('.dialog-body').append(productPanel);document.body.append(productDialog);
 productDialog.querySelector('.dialog-close').onclick=()=>productDialog.close();productDialog.addEventListener('close',()=>window.cancelProdutoEdit());
 window.openProductEditor=editing=>{if(!editing)window.cancelProdutoEdit();$('productDialogTitle').textContent=editing?'Editar produto':'Novo produto';if(!productDialog.open)productDialog.showModal();$('pNome').focus();};
 window.closeProductEditor=()=>productDialog.close();
 const productToolbar=$('produtosBusca').closest('.toolbar');productToolbar.classList.add('product-toolbar');productToolbar.append(button('Adicionar produto',()=>window.openProductEditor(false),'btn-primary'));
 // Resultados: receita/lucro primeiro, taxas depois, detalhes de custos recolhíveis.
 const results=$('metricasViewResultados').querySelector('.panel'),oldGrid=results.querySelector('.cards4'),primary=document.createElement('div'),efficiency=document.createElement('div');primary.className='metrics-primary';efficiency.className='metrics-efficiency';
 for(const id of ['metReceita','metLucroLiquido'])primary.append($(id).closest('.card'));
 const hero=results.querySelector('.roi-hero');hero.querySelector('.roi-hero-label').firstChild.textContent='Retorno sobre os custos (ROI) ';const count=$('metVendasSub');count.className='tag';results.querySelector('h2').append(count);
 efficiency.append(hero);for(const id of ['metCPA','metROAS'])efficiency.append($(id).closest('.card'));
 oldGrid.before(primary,efficiency);oldGrid.remove();
 const note=results.querySelector('.metricas-nota'),guide=document.createElement('details');guide.className='metric-guide';guide.innerHTML='<summary>Como interpretar estes números</summary><p>Uma venda conta depois de Concluir no painel ou quando o pedido está processado e pago na Shopify. A Meta Ads fornece apenas gastos.</p><p>O lucro estimado é a receita das entregas concluídas menos os custos registados. O ROI compara esse lucro com os custos.</p><p>O CPA divide o gasto com anúncios pelo número de pedidos concluídos. O ROAS divide a receita pelo gasto com anúncios. Ambos usam todas as vendas concluídas no período; não representam atribuição de vendas a campanhas individuais.</p><p>Para um produto específico, os custos gerais da loja não entram no cálculo. Gastos de vários dias são distribuídos pelo período correspondente.</p>';note.replaceWith(guide);
 const costs=results.querySelector('.cards6'),costDetails=document.createElement('details');costDetails.className='cost-disclosure';costDetails.id='metricsCostDetails';costDetails.innerHTML='<summary>Custos do período <span id="metricsCostPreview"></span></summary>';costs.before(costDetails);costDetails.append(costs);results.querySelector('.metricas-subhead')?.remove();
 const empty=document.createElement('div');empty.id='metricsEmptyState';empty.className='metric-empty';empty.hidden=true;empty.innerHTML='<p>Ainda não há entregas concluídas nem gastos neste período. Escolhe outro período ou regista os primeiros dados.</p>';
 empty.append(button('Ver pedidos',()=>window.navigateOrders()),button('Registar gasto',()=>window.openExpenseEntry()));guide.before(empty);
 let lastEmpty;
 window.updateMetricsPresentation=result=>{const noData=result.orders===0 && result.total===0;empty.hidden=!noData;efficiency.hidden=noData;results.querySelector('.chart-grid').hidden=noData;$('metricsCostPreview').textContent=Number(result.total).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})+' MT';if(lastEmpty!==noData)costDetails.open=!noData;lastEmpty=noData;};
 // Elementos dinâmicos também recebem nomes e campos adequados ao teclado móvel.
 function annotate(root){root.querySelectorAll('button[title]:not([aria-label])').forEach(node=>node.setAttribute('aria-label',node.title));root.querySelectorAll('input[type="number"]:not([inputmode])').forEach(node=>node.setAttribute('inputmode',node.step==='1'?'numeric':'decimal'));root.querySelectorAll('input[type="search"],input[id$="Busca"]').forEach(node=>{if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',node.placeholder || 'Procurar');});}
 annotate(document);new MutationObserver(entries=>{for(const entry of entries)for(const node of entry.addedNodes)if(node.nodeType===1)annotate(node);}).observe(document.body,{childList:true,subtree:true});
 for(const id of ['vendaMsg','adMsg','outroMsg','opMsg','produtoMsg','backupMsg']){$(id)?.setAttribute('role','status');$(id)?.setAttribute('aria-live','polite');}
 // Recolher/abrir formulários e históricos também funciona com teclado.
 document.querySelectorAll('div.historico-toggle').forEach(node=>{node.setAttribute('role','button');node.tabIndex=0;node.onkeydown=event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();node.click();}};});
 document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const picker=document.querySelector('.daterange.open');if(picker){picker.classList.remove('open');picker.querySelector('.daterange-panel')?.classList.remove('open');picker.querySelector('.daterange-trigger')?.setAttribute('aria-expanded','false');picker.querySelector('.daterange-trigger')?.focus();}});
 initReconciliation();initShopifyCatalog();initManualBackupRestore();initOrderReports();
 document.querySelectorAll('.daterange-nav').forEach(node=>node.setAttribute('aria-label',node.dataset.nav==='-1'?'Mês anterior':'Mês seguinte'));
}
