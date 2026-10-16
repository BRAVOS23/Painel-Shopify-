import json,os,shutil
from playwright.sync_api import sync_playwright,expect
fixture=json.loads(os.environ['PAINEL_BROWSER_FIXTURE'])
errors=[]
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    customer=browser.new_page(viewport={'width':390,'height':844})
    admin=browser.new_page(viewport={'width':1280,'height':900})
    for page in [customer,admin]:
        page.on('pageerror',lambda error:errors.append(str(error)))
    def login(page,email):
        page.goto(fixture['url'],wait_until='networkidle')
        page.fill('#cloudEmail',email);page.fill('#cloudPassword',fixture['password']);page.click('#cloudLoginForm button[type=submit]')
        expect(page.locator('.wrap')).to_be_visible(timeout=30000)
    login(customer,fixture['customer'])
    expect(customer.locator('#readOnlyNotice')).to_be_visible()
    customer.click('#accountMenuButton');expect(customer.locator('#openPlatformAdmin')).to_be_hidden()
    expect(customer.locator('#businessPlanDescription')).to_contain_text('Aguarda ativação')
    customer.click('#requestAccess');expect(customer.locator('#businessAccessMessage')).to_contain_text('guardado')
    customer.click('#accountTabDados')
    with customer.expect_download() as event:customer.click('#exportAccount')
    assert event.value.suggested_filename.endswith('.json')
    customer.click('#inspectDataQuality');expect(customer.locator('#qualityReport')).to_contain_text('Registos guardados')
    assert customer.evaluate('document.documentElement.scrollWidth<=innerWidth')
    login(admin,fixture['admin']);admin.click('#accountMenuButton');admin.click('#openPlatformAdmin')
    expect(admin.locator('#platformBusinesses article').first).to_be_visible()
    expect(admin.locator('#subscriptionForm')).to_be_hidden()
    target=admin.locator('[data-grant="'+fixture['customerUid']+'"]')
    for _ in range(100):
        if target.count():break
        expect(admin.locator('#moreBusinesses')).to_be_visible()
        before=admin.locator('#platformBusinesses article').count();admin.click('#moreBusinesses')
        expect(admin.locator('#platformBusinesses article')).not_to_have_count(before)
    target.click()
    admin.select_option('#subscriptionPlan','standard');admin.fill('#subscriptionExpiry',fixture['expiresOn']);admin.click('#subscriptionForm button[type=submit]')
    expect(admin.locator('#platformAdminMessage')).to_contain_text('Acesso atualizado')
    expect(admin.locator('#subscriptionForm')).to_be_hidden()
    admin.locator('#platformAdminDialog summary').click()
    admin.click('#loadPlatformAudit')
    expect(admin.locator('#platformAudit')).to_contain_text(fixture['customerUid'])
    customer.reload(wait_until='networkidle');expect(customer.locator('.wrap')).to_be_visible(timeout=30000)
    expect(customer.locator('#readOnlyNotice')).to_be_hidden()
    # Percursos de navegação com dados reais do emulador, em ecrã móvel.
    customer.click('#tabBtnProdutos');expect(customer.locator('#secProdutos')).to_be_visible()
    expect(customer.locator('#secProdutos')).to_contain_text('Produto de navegação')
    customer.get_by_role('button',name='Adicionar produto',exact=True).click();expect(customer.locator('#productDialog')).to_be_visible();customer.click('#productDialog .dialog-close')
    customer.click('#tabBtnVendas');expect(customer.locator('#vendaTableBody')).to_contain_text('Cliente atual')
    customer.click('#drOverview .daterange-trigger');customer.click('#drOverview [data-key="mes_passado"]')
    expect(customer.locator('#vendaTableBody')).to_contain_text('Cliente antigo');expect(customer.locator('#vendaTableBody')).not_to_contain_text('Cliente atual')
    customer.click('#ordersNewOrder');expect(customer.locator('#vContacto')).to_be_visible()
    customer.click('#tabBtnMetricas');expect(customer.locator('#subnavMetProdutos')).to_be_hidden();expect(customer.locator('#subnavMetCadastros')).to_be_hidden()
    customer.click('#subnavMetGastos');customer.click('#registerExpense');expect(customer.locator('#expenseDialog')).to_be_visible()
    customer.fill('#adValor','15');customer.click('#adSubmitBtn');expect(customer.locator('#adMsg')).to_contain_text('adicionado')
    expect(customer.locator('#cloudSaveStatus')).to_have_text('Dados guardados',timeout=20000)
    customer.click('#expenseDialog .dialog-close');expect(customer.locator('#metricasViewGastos')).to_contain_text('15,00')
    for width in [320,360,390,412,768,1280]:
        customer.set_viewport_size({'width':width,'height':900})
        for key in ['Vendas','Produtos','Metricas']:
            customer.click('#tabBtn'+key)
            assert customer.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,key)
            if key=='Produtos':
                assert customer.evaluate('''()=>[...document.querySelectorAll('#produtosGrid .produto-card')].every(card=>{const a=card.getBoundingClientRect(),b=document.getElementById('produtosGrid').getBoundingClientRect();return a.right<=b.right+1 && a.left>=b.left-1 && card.scrollWidth<=card.clientWidth+1;})'''),('cartão fora da grelha',width)
            if key=='Vendas' and width<=600:
                assert customer.evaluate('''()=>[...document.querySelectorAll('#vendaTableBody .row-actions button')].filter(button=>button.getClientRects().length).every(button=>button.clientWidth>=44 && button.scrollWidth<=button.clientWidth+1 && button.clientHeight<=70)'''),('botão comprimido',width)
                assert customer.evaluate('''()=>[...document.querySelectorAll('#vendaTableBody .tel-ativo')].every(number=>number.getBoundingClientRect().height<40 && number.scrollWidth<=number.clientWidth+1)'''),('telefone partido',width)

    customer.screenshot(path='/tmp/painel-navigation-desktop.png',full_page=True,animations='disabled')
    customer.set_viewport_size({'width':390,'height':844});customer.click('#tabBtnVendas');customer.screenshot(path='/tmp/painel-orders-mobile-fix.png',full_page=True,animations='disabled');customer.click('#tabBtnProdutos');customer.screenshot(path='/tmp/painel-navigation-mobile.png',full_page=True,animations='disabled')
    customer.click('#accountMenuButton');expect(customer.locator('#businessPlanDescription')).to_contain_text('Ativo')
    customer.click('#accountTabDados');customer.locator('summary',has_text='Encerrar e eliminar').click();customer.click('#openCloseAccount')
    customer.fill('#closeAccountConfirmation','ELIMINAR');customer.fill('#closeAccountPassword',fixture['password']);customer.check('#closeAccountBackup');customer.click('#closeAccountForm button[type=submit]')
    expect(customer.locator('.cloud-login').first).to_be_visible(timeout=60000)
    admin.screenshot(path='/tmp/painel-commercial-admin.png',full_page=True,animations='disabled')
    assert not errors,errors
    print('PASS: mobile apenas consulta, exportação, qualidade, ativação administrativa, auditoria e eliminação Firebase reais nos emuladores; sem erros JavaScript')
    browser.close()
