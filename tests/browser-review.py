"""Percursos de revisão com dados sintéticos, API e Firebase locais."""
import csv,io,json,os,shutil
from playwright.sync_api import sync_playwright,expect
fixture=json.loads(os.environ['PAINEL_BROWSER_FIXTURE'])
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(fixture['url'],wait_until='networkidle')
    page.fill('#cloudEmail',fixture['customer']);page.fill('#cloudPassword',fixture['password']);page.click('#cloudLoginForm button[type=submit]')
    expect(page.locator('.wrap')).to_be_visible(timeout=30000)
    def saved():expect(page.locator('#cloudSaveStatus')).to_have_text('Dados guardados',timeout=30000)
    def state():return page.evaluate("window.cloudBackend.read('vendas')")
    def modal_close(selector):page.locator(selector+' .dialog-close').click()
    saved()
    # Resumo: um pedido com dois produtos tem uma única entrada; abrir mostra o cartão concreto.
    expect(page.locator('#summaryOrders [data-order]')).to_have_count(2)
    page.locator('#summaryOrders [data-order]').first.click()
    expect(page.locator('#vendasViewEntregas')).to_be_visible()
    assert page.locator('.pedido-card:focus').count()==1
    page.click('#tabBtnVendas');page.click('#subnavVendasPedidos')
    # Editar e depois Novo pedido nunca reaproveita o ID ou os dados da edição.
    page.evaluate("editVenda('nav_current')")
    expect(page.locator('#vendaSubmitBtn')).to_have_text('Atualizar')
    page.click('#ordersNewOrder')
    expect(page.locator('#vContacto')).to_have_value('')
    expect(page.locator('#vendaSubmitBtn')).to_have_text('Adicionar')
    page.fill('#vContacto','Novo cliente de revisão 840000007');page.fill('#vProduto','Produto de navegação');page.fill('#vValor','200')
    page.click('#vendaSubmitBtn');saved();expect(page.locator('#vendaFormBody')).to_be_hidden()
    created=next(row for row in state() if row['contacto'].startswith('Novo cliente'))
    assert next(row for row in state() if row['id']=='nav_current')['contacto'].startswith('Cliente atual')
    # Sem taxa padrão, voltar do custo de entrega não conclui; zero é uma decisão explícita.
    page.evaluate('(id)=>{void markStatus(id,"concluido");}',created['id'])
    expect(page.locator('#completionDeliveryDialog')).to_be_visible()
    assert page.locator('#completeDeliveryAmount').bounding_box()['width']>200
    page.locator('#completionDeliveryDialog').screenshot(path='/tmp/painel-review-delivery-mobile.png')
    page.get_by_role('button',name='Voltar',exact=True).click()
    assert next(row for row in state() if row['id']==created['id'])['status']=='pendente'
    page.wait_for_function('(id)=>!pedidosAAtualizar.has(id)',arg=created['id'])
    page.evaluate('(id)=>{void markStatus(id,"concluido");}',created['id'])
    page.fill('#completeDeliveryAmount','0');page.locator('#completionDeliveryDialog button[type=submit]').click();page.wait_for_function('(id)=>window.cloudBackend.read("vendas").some(row=>row.id===id && row.status==="concluido")',arg=created['id']);saved()
    done=next(row for row in state() if row['id']==created['id']);assert done['status']=='concluido' and done['deliveryFee']==0
    # Reagendamento move todas as linhas do pedido para o mesmo mês/hora.
    next_month=page.evaluate("()=>{const d=new Date();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,15)).toISOString().slice(0,10);}")
    page.evaluate("window.openReschedule('sh_700_one')")
    page.fill('#scheduleDate',next_month);page.fill('#scheduleTime','16:30');page.click('#scheduleSubmit');saved()
    grouped=[row for row in state() if row.get('shopifyOrderId')=='700']
    assert len(grouped)==2 and all(row['data']==next_month and row['horario']=='16:30' for row in grouped)
    expect(page.locator('#pedidosTag')).to_have_text('1 pedido em aberto · 2 linhas de produto')
    page.click('#pedidosSelecaoBtn');page.locator('#pedido_sh_700_one .pedido-checkbox').click();expect(page.locator('#pedidosSelecaoCount')).to_have_text('1 pedido selecionado')
    with page.expect_download() as download:page.evaluate('exportarPDFSelecionados()')
    assert download.value.suggested_filename.endswith('.pdf')
    # Navegação principal começa no topo e Pedidos abre Entregas na semana de hoje.
    scope=page.evaluate("()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return {month:parts.year+'-'+parts.month,week:'semana'+Math.min(4,Math.ceil(Number(parts.day)/7))};}")
    page.evaluate('abrirVendaForm();window.scrollTo(0,document.body.scrollHeight)')
    page.click('#tabBtnVendas')
    expect(page.locator('#vendasViewEntregas')).to_be_visible();expect(page.locator('#mesVendasEditor')).to_have_value(scope['month'])
    expect(page.locator('#semanaTabs button[aria-pressed="true"]')).to_contain_text('Semana '+scope['week'][-1])
    assert page.evaluate('scrollY')==0
    # Um atalho para um pedido antigo/futuro conserva o destino explícito.
    page.evaluate("window.focusOrder('sh_700_one')");expect(page.locator('#mesVendasEditor')).to_have_value(next_month[:7])
    page.click('#deliveryToday');expect(page.locator('#mesVendasEditor')).to_have_value(scope['month']);assert page.evaluate('scrollY')==0
    for target in ['tabBtnProdutos','tabBtnMetricas','tabBtnResumo']:
        page.evaluate('window.scrollTo(0,document.body.scrollHeight)');page.click('#'+target);assert page.evaluate('scrollY')==0,target
    page.click('#tabBtnVendas');page.click('#subnavVendasRelatorios');assert page.evaluate('scrollY')==0
    page.click('#subnavVendasPedidos');assert page.evaluate('scrollY')==0
    # Catálogo: pesquisa vazia não sugere apagar dados; duplicados não alteram stock/custo.
    page.click('#tabBtnProdutos');page.fill('#produtosBusca','sem-correspondencia');expect(page.locator('#produtosGridEmpty')).to_contain_text('pesquisa')
    page.fill('#produtosBusca','');page.get_by_role('button',name='Adicionar produto',exact=True).click()
    page.fill('#pNome','Produto de navegação');page.fill('#pCusto','999');page.click('#produtoSubmitBtn')
    expect(page.locator('#produtoMsg')).to_contain_text('outro produto')
    product=next(row for row in page.evaluate("window.cloudBackend.read('produtos')") if row['id']=='nav_product');assert product['custo']==20 and product['locais'][0]['quantidade']==4
    page.fill('#pNome','Produto criado na revisão');page.fill('#pCusto','30');page.click('#produtoSubmitBtn');saved()
    expect(page.locator('#productDialog')).to_be_hidden();expect(page.locator('#produtosGrid')).to_contain_text('Produto criado na revisão')
    product=next(row for row in page.evaluate("window.cloudBackend.read('produtos')") if row['nome']=='Produto criado na revisão')
    page.evaluate('(id)=>editProduto(id)',product['id']);page.fill('#pCusto','35');page.click('#produtoSubmitBtn');saved()
    assert next(row for row in page.evaluate("window.cloudBackend.read('produtos')") if row['id']==product['id'])['custo']==35
    page.once('dialog',lambda dialog:dialog.accept());page.evaluate('(id)=>deleteProduto(id)',product['id']);saved()
    # Gastos: as três categorias, editar/fechar e iniciar um novo registo sem sobrescrever.
    page.click('#tabBtnMetricas');page.click('#subnavMetGastos');page.click('#registerExpense')
    page.fill('#adValor','40');page.click('#adSubmitBtn');saved();modal_close('#expenseDialog')
    expense=page.evaluate("window.cloudBackend.read('ads').find(row=>row.valor===40)")
    page.evaluate('(id)=>editAd(id)',expense['id']);expect(page.locator('#adSubmitBtn')).to_contain_text('Atualizar');modal_close('#expenseDialog')
    page.click('#registerExpense');expect(page.locator('#adValor')).to_have_value('');expect(page.locator('#adSubmitBtn')).to_have_text('Adicionar gasto')
    page.get_by_role('button',name='Outros',exact=True).click();page.fill('#outroNome','Embalagens de teste');page.fill('#outroValor','12');page.click('#outroSubmitBtn');saved()
    page.get_by_role('button',name='Loja',exact=True).click();page.fill('#opNome','Domínio de teste');page.fill('#opValor','20');page.click('#opSubmitBtn');saved();modal_close('#expenseDialog')
    expect(page.locator('#gastosViewBody')).to_contain_text('Embalagens');expect(page.locator('#gastosViewBody')).to_contain_text('Domínio');expect(page.locator('#metricasViewGastos')).to_contain_text('Soma dos valores registados')
    # Gráficos: alternar acumulado e diário devolve as séries e o título originais.
    page.click('#subnavMetResultados')
    checkbox=page.locator('#chartCumulative')
    if checkbox.count():
        checkbox.check();checkbox.uncheck();expect(checkbox).not_to_be_checked()
    # Dados: mapeamento e CSV sintéticos reais (sem mocks de parser), número alternativo e recuperação da hora.
    page.click('#accountMenuButton');page.click('#accountTabDados');page.locator('.import-sources>summary').click()
    expect(page.locator('#shopifyNativeFile')).to_be_visible()
    output=io.StringIO();writer=csv.writer(output)
    writer.writerow(['Id','Financial Status','Fulfillment Status','Cancelled at','Created at','Note Attributes','Shipping Name','Shipping Phone','Lineitem quantity','Lineitem name','Subtotal'])
    writer.writerow(['700','pending','unfulfilled','',next_month,'Nome: Cliente Exemplo\nContacto: 840000005\nContacto alternativo: 850000006\nLocal de entrega: Matola\nProvíncia: Maputo\nHora da entrega: 15:00','Cliente Exemplo','840000005','1','Produto de navegação','200'])
    page.set_input_files('#shopifyNativeFile',{'name':'checkout-review.csv','mimeType':'text/csv','buffer':output.getvalue().encode()})
    page.get_by_role('button',name='Alterar mapeamento',exact=True).click()
    expect(page.locator('#shopifyMap_alternativo')).to_have_value('contacto alternativo')
    assert page.locator('#shopifyMap_alternativo').bounding_box()['width']>200
    page.locator('#shopifyMapBox').screenshot(path='/tmp/painel-review-mapping-mobile.png')
    page.get_by_role('button',name='Guardar mapeamento e importar',exact=True).click();expect(page.locator('#shopifyNativeMsg')).to_contain_text('registos atualizados');saved()
    assert all(row['horario']=='16:30' and row['status']=='remarcado' and '850000006' in row['contacto'] for row in state() if row.get('shopifyOrderId')=='700')
    with page.expect_download() as download:page.get_by_role('button',name='Exportar backup (.json)').click()
    assert download.value.suggested_filename.endswith('.json')
    page.click('#accountTabIntegracoes');expect(page.locator('#connectShopify')).to_be_visible();expect(page.locator('#connectMeta')).to_be_visible()
    page.click('#accountTabConta');expect(page.locator('#installApp')).to_be_visible();page.click('#installApp');expect(page.locator('#installInstructions')).to_have_attribute('open','')
    modal_close('#accountDialog')
    # Exportações e filtros, relatórios, navegação e layouts nos dois temas.
    page.click('#tabBtnVendas');page.click('#subnavVendasPedidos')
    with page.expect_download() as download:page.get_by_role('button',name='Exportar CSV',exact=True).click()
    assert download.value.suggested_filename.endswith('.csv')
    page.click('#subnavVendasRelatorios');expect(page.locator('#ordersTrendChart')).to_be_visible()
    page.click('#verifyOrderCounts');expect(page.locator('#orderAuditMessage')).to_contain_text('Liga a Shopify')
    for theme in ['light','dark']:
      page.evaluate('(theme)=>document.documentElement.setAttribute("data-theme",theme)',theme)
      for width in [320,390,768,1280]:
        page.set_viewport_size({'width':width,'height':900})
        for key in ['Resumo','Vendas','Produtos','Metricas']:
          page.click('#tabBtn'+key)
          assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width,key)
        page.click('#tabBtnVendas');page.click('#subnavVendasEntregas');page.evaluate('abrirVendaForm();document.getElementById("orderExtraFields").open=true')
        if not page.evaluate('document.documentElement.scrollWidth<=innerWidth'):
          page.screenshot(path='/tmp/painel-review-overflow.png',full_page=True)
          print(page.evaluate('''()=>[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length && e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right})).slice(-25)'''),flush=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width,'entregas')
        if width==390:
          page.screenshot(path='/tmp/painel-review-orders-'+theme+'.png',full_page=True,animations='disabled')
    missing=page.evaluate(r'''()=>[...document.querySelectorAll('[onclick]')].flatMap(node=>{const match=node.getAttribute('onclick').match(/^(?:window\.)?([A-Za-z_$][\w$]*)\(/);return match && typeof window[match[1]]!=='function'?[match[1]]:[];})''')
    assert not missing,missing
    # Trocar de conta limpa rascunhos e o domínio da loja anterior.
    page.click('#ordersNewOrder');page.fill('#vContacto','Rascunho privado de revisão')
    page.click('#accountMenuButton');page.click('#accountTabIntegracoes');page.fill('#cloudShop','old-example.myshopify.com')
    page.click('#accountTabConta')
    with page.expect_navigation(wait_until='networkidle'):page.click('#cloudLogout')
    expect(page.locator('#cloudLoginForm')).to_be_visible()
    expect(page.locator('#cloudPassword')).to_have_value('')
    page.fill('#cloudEmail',fixture['admin']);page.fill('#cloudPassword',fixture['password']);page.click('#cloudLoginForm button[type=submit]');expect(page.locator('.wrap')).to_be_visible(timeout=30000)
    expect(page.locator('#vContacto')).to_have_value('');expect(page.locator('#cloudShop')).to_have_value('')
    assert not errors,errors
    print('PASS: revisão funcional de Resumo, Lista, Entregas, Relatórios, Produtos, Resultados, Gastos e Conta; criação/edição/exclusão, reagendamento por pedido, custo zero, importação e downloads; 4 larguras e 2 temas.')
    browser.close()
