# Painel do Negócio

Aplicação de gestão de negócios com pagamento na entrega (COD), em português de Moçambique. O protótipo de ficheiro único foi ligado a Firebase Authentication e Firestore, com backend Node para desenvolvimento e Cloudflare Workers para publicação. A especificação funcional vem do plano de negócio fornecido pelo proprietário; as funcionalidades são verificadas separadamente, sem assumir que as integrações descritas no documento já funcionavam.

A interface atual vem de `public/index.html` da branch `claude/painel-negocio-validation-ui-j9360b` (commit `f63727163ecd67c6816f6394a959cf1654e25a57`), adaptada ao backend existente. Inclui tema claro/escuro, meses anteriores, contactos clicáveis, PDF de pedidos selecionados, stock por local, gastos por período e lucro líquido. O modo instalável guarda apenas a interface pública; login, consulta e gravação de dados exigem ligação à Internet. Backups desta versão podem ser importados numa conta vazia, sem substituir registos existentes.

## Desenvolvimento local

Requisitos: Node 22 ou superior e Java 21 (emulador Firestore).

```sh
npm ci
npm run dev
```

A aplicação usa a porta 3000; os emuladores usam 9099 e 8080. Crie uma conta de teste na tela de login. Não são necessários um projeto Firebase real, cartão ou credenciais das plataformas para os testes locais. Use apenas dados de teste nos emuladores, que não substituem a infraestrutura de produção.

`npm run dev` compila a interface, inicia os emuladores, aguarda respostas de ambos e inicia o servidor. Ao parar normalmente com Ctrl+C, exporta os dados para `.emulator-data/`, que são importados no arranque seguinte. O snapshot anterior é conservado em `.local/`. A exportação usa os endpoints locais dos emuladores porque a CLI Firebase pode encaminhar loopback indevidamente pelo proxy de Internet. Uma paragem abrupta pode perder os dados locais posteriores ao último snapshot.

Não abra o HTML diretamente nem use `python -m http.server` para esta versão: o login e os dados dependem do backend.

## Cloudflare Workers Free

A adaptação para Workers está preparada e testada localmente. O requisito do proprietário é orçamento zero; não ativar faturação ou upgrades. Consulte [CLOUDFLARE.md](CLOUDFLARE.md) para comandos, configuração segura e limites. O painel está publicado em https://painel-shopify.lobojose348.workers.dev/. As integrações Shopify e Meta ainda precisam de credenciais e validação com contas reais.

## Verificação

```sh
npm test
# Com npm run dev em execução:
npm run test:integration
# Com emuladores e npm run dev:worker em execução:
npm run test:worker
npm run check:worker
```

Os testes unitários cobrem assinatura/cifragem, normalização dos dados, moedas, descontos, paginação e cálculo de rentabilidade. Os testes de integração usam Auth e Firestore reais nos emuladores, com respostas Shopify/Meta simuladas. Verificam isolamento entre contas, revisões concorrentes, importações repetidas, proteção de credenciais e webhooks. Nenhum teste automatizado altera lojas ou contas de anúncios reais.

Também foram feitos testes de navegador: criação de conta, lançamentos e pedidos, persistência após recarregar, PDF, gráfico, métricas e separação entre dois negócios. Esses testes não substituem a validação das APIs com as contas reais.

## Funcionalidades implementadas

- Login por email/palavra-passe, criação de conta, recuperação de acesso e verificação de email em produção.
- Fluxo de caixa, pedidos, produtos/fotos comprimidas, anúncios e gastos operacionais persistidos por negócio.
- Cada utilizador possui o seu negócio; o backend deriva o proprietário do token verificado, nunca de um ID fornecido pelo navegador. Equipas e membros convidados ainda não existem.
- Gravações por registo com revisão, para evitar sobrescrever silenciosamente alterações de outro aparelho ou da integração. Num conflito os dados locais são mantidos e a interface avisa; é necessário conciliar antes de recarregar.
- Migração explícita dos dados antigos do navegador ou de um backup JSON para uma conta vazia, sem apagar a cópia original. O protótipo está conservado em `legacy/`, com exportação de backup.
- Gráficos e PDF incluídos no bundle, sem CDN em tempo de execução.
- Métricas calculadas no servidor, incluindo custo de aquisição, entregador, Ads, outros e rateio operacional. O CPA conta pedidos Shopify distintos, não o número de linhas de produto.
- Ligação Shopify por OAuth, carga inicial dos últimos 59 dias, webhooks assinados e reconciliação periódica. IDs estáveis evitam duplicações. Concluir/Cancelar pedidos importados envia a alteração à Shopify e só apresenta confirmação quando o estado regressado pela loja a confirmar. Cancelamento sem reembolso automático, com reposição de stock; a interface pede confirmação do pedido inteiro.
- Ligação Meta por OAuth, seleção de conta de anúncios e importação dos gastos diários por campanha nos últimos 30 dias. A sincronização volta a consultar os dias anteriores para atualizar gastos corrigidos. Campanhas sem correspondência continuam no total geral e são identificadas na interface.
- Tokens de integração cifrados no Firestore, inacessíveis pela API pública ou pelas regras do cliente.

## Estado e limites para lançamento comercial

Esta é uma base funcional de desenvolvimento, **não um serviço comercial já publicado**. A ativação e os requisitos externos estão em [SETUP.md](SETUP.md).

Antes de cobrar clientes, ainda são necessários:

1. Ligação segura ao projeto Firebase criado pelo proprietário, publicação HTTPS do Worker, testes com contas reais e aprovações de distribuição/acesso Shopify e Meta.
2. Planos, pagamentos e controlo de assinatura. Nenhum bloqueio por assinatura está implementado; contas verificadas têm acesso sem cobrança.
3. Políticas de privacidade e retenção, eliminação/exportação completa da conta e endpoints de conformidade exigidos pela Shopify para uma aplicação distribuída. O webhook `app/uninstalled` desliga a loja, mas não é um sistema completo de eliminação de dados.
4. Paginação do histórico na interface e redução das leituras: nesta versão a API carrega todas as coleções de um negócio e o navegador verifica alterações a cada 60 segundos, só relendo coleções quando o ETag indica mudanças. O adapter Worker limita a 500 registos por coleção e avisa se exceder; precisa de paginação antes de várias empresas com grande histórico. As estimativas de custo do plano de negócio não foram validadas.
5. Revisão da interface para pedidos com vários itens: as linhas são importadas separadamente e o servidor conta o pedido uma vez no CPA; alguns relatórios do protótipo ainda contam linhas como registos. Fotos, custos e entregador continuam por linha de produto.

Limites das integrações: pedidos Shopify com mais de 100 itens são recusados com aviso; no Node uma execução limita-se a 10.000 pedidos, e no Worker os dados são retomados em lotes de até 5 itens por execução. Receita importada é o total dos itens após descontos, sem acrescentar frete/impostos nem reconciliar reembolsos parciais; não deve ser apresentada como conciliação financeira completa. Só lojas em MZN são aceites nesta fase. Meta noutra moeda exige uma taxa explicitamente indicada; a taxa é fixa por ligação e fica registada em cada gasto, não é um serviço de câmbio diário. Não acrescente manualmente gastos já importados do Meta. Reautorização de tokens expirados, mapeamento manual de campanhas e moedas/taxas por data precisam de acabamento para comercialização.

Nunca coloque tokens, ficheiros de contas de serviço ou `.env` no Git.
