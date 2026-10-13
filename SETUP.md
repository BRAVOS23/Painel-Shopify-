# Ativar Firebase, Shopify e Meta

O alvo escolhido para respeitar o orçamento zero é **Cloudflare Workers Free**. Seguir primeiro [CLOUDFLARE.md](CLOUDFLARE.md), incluindo a configuração de Secrets. A versão foi verificada localmente; ainda não foi publicada nem ligada ao Firestore real. Não ativar faturação nem plano Blaze. As instruções Node abaixo ficam como referência de desenvolvimento/alternativa e não devem ser usadas para contratar um servidor pago.

## 1. Criar o projeto Firebase

O proprietário informou que criou o projeto `painel-cash-on-delivery`. O ID está registado no alias `production` em `.firebaserc` e no modelo `config/production.env.example`. O proprietário informou que ativou login Email/Password, criou o Firestore em modo de produção e registou uma aplicação Web. A configuração pública fornecida está em `config/firebase.production.json`; não é uma conta de serviço e não concede administração do banco. A ligação de produção e o acesso administrativo ainda não foram verificados. O desenvolvimento local continua no projeto emulado `demo-painel`; o ambiente não ativa faturação por si.

1. Na [consola Firebase](https://console.firebase.google.com/), crie o projeto do produto.
2. Em Authentication, ative Email/Password. Adicione o domínio público da aplicação aos domínios autorizados e configure os emails de verificação/recuperação.
3. Crie o Firestore e escolha a localização antes de guardar dados de clientes. Registe uma aplicação Web para obter `projectId`, `apiKey` e `authDomain`. Estes campos de configuração Web não são as credenciais administrativas.
4. Publique as regras de `firestore.rules` no projeto **real**, após confirmar o projeto de destino. As regras negam acesso direto: o navegador usa a API e o servidor aplica o isolamento por proprietário. Não aplique estas regras num projeto já usado por outras aplicações sem avaliar o impacto.
5. Configure a identidade do servidor com acesso ao Firestore e leitura de utilizadores do Firebase Authentication. Use uma identidade gerida/Application Default Credentials; se precisar de um ficheiro de conta de serviço, guarde-o fora do repositório.

Não envie chaves privadas, tokens ou palavras-passe no chat.

## 2. Servidor e configuração de produção

Use `config/production.env.example` como modelo de produção num ambiente controlado ou configure as variáveis no gestor de segredos da infraestrutura. `.env.example` é o modelo de desenvolvimento local. Defina:

- `USE_FIREBASE_EMULATORS=false`.
- `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN` do projeto real.
- `APP_BASE_URL` com o endereço público HTTPS, sem barra final.
- `INTEGRATION_ENCRYPTION_KEY`: 32 bytes aleatórios em base64. Guarde uma cópia segura; perdê-la torna os tokens armazenados ilegíveis. A rotação exige recifrar os tokens existentes.
- IDs e segredos dos aplicativos Shopify e Meta, descritos abaixo.

Os segredos usados para HMAC e cifragem precisam de valores reais no processo do servidor. Placeholders que só são substituídos por um proxy HTTPS não servem para estas operações locais. Não substitua a chave por valores inventados para simular uma ligação.

```sh
npm ci
npm run build
npm start
```

O backend Node serve a interface e executa a fila de webhooks a cada 5 segundos e a reconciliação Shopify/Meta a cada 15 minutos. Estes processos sobrevivem ao fecho do navegador **quando o servidor permanece ativo**. Firebase Hosting, por si só, não executa este servidor. Use um serviço sempre ligado; se optar por Cloud Run, configure CPU disponível fora dos pedidos e pelo menos uma instância, ou adapte os workers para Cloud Scheduler/Tasks antes de depender de escala a zero. A aplicação não foi publicada ou testada num fornecedor de alojamento real.

**Restrição do proprietário: orçamento zero; não ativar faturação ou fazer upgrades.** A adaptação Cloudflare usa APIs HTTP e Cron Triggers no lugar de um processo permanente. A execução no runtime local foi validada; a publicação, credenciais e as quotas efetivas de produção ainda precisam de validação. Não usar o processo Node num serviço gratuito que suspende, supondo que os timers continuarão ativos.

Isto pode exigir faturação. A quota gratuita do Firestore não garante que hospedagem, execução agendada e restantes serviços sejam gratuitos. Antes de vender, calcule custos com a infraestrutura e o volume real de leituras.

Verifique `/api/health`, faça login com email verificado e teste dois negócios separados. Os emuladores devem estar desativados e as variáveis `FIREBASE_AUTH_EMULATOR_HOST` e `FIRESTORE_EMULATOR_HOST` removidas.

## 3. Shopify

1. Crie/configure um aplicativo Shopify que suporte OAuth e instalação para as lojas pretendidas. Para vender a outras empresas, escolha a distribuição adequada e cumpra os requisitos/revisão da Shopify; um token de app personalizado de uma loja não basta para um serviço multi-cliente.
2. Configure a URL base e o callback exato `https://SEU_DOMINIO/oauth/shopify/callback`.
3. Configure as permissões `read_products`, `read_orders`, `write_orders`, `read_merchant_managed_fulfillment_orders` e `write_merchant_managed_fulfillment_orders`. Acesso aos dados protegidos dos clientes requer as autorizações aplicáveis da Shopify. Processamento por prestadores/locais de terceiros pode exigir permissões e tratamento adicionais.
4. Configure `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` no servidor. A versão GraphQL padrão é `2026-07`; confirme o suporte e mantenha-a atualizada com testes.
5. No painel, no menu ⋯ → Integrações, indique `nomedaloja.myshopify.com` e clique em Ligar Shopify. A loja pede autorização diretamente na Shopify.

O callback guarda o token cifrado, associa a loja ao negócio e regista webhooks `orders/create`, `orders/updated`, `orders/cancelled` e `app/uninstalled` no endpoint `/webhooks/shopify`. A importação inicial cobre 59 dias; o acesso a pedidos antigos requer permissões adicionais e não está implementado nesta fase. Uma loja não pode ficar ligada simultaneamente a dois negócios neste servidor.

Validação real obrigatória: importar um pedido de teste, verificar produto/quantidade/preço/data, repetir sem duplicar, atualizar a loja, receber o webhook e verificar que outra conta do painel não vê o pedido. Com pedidos destinados a teste e autorização explícita do dono, verificar Concluir e Cancelar (sem reembolso automático). Não use pedidos reais de clientes para validar ações irreversíveis.

## 4. Meta Ads

1. Crie um aplicativo adequado na [Meta for Developers](https://developers.facebook.com/), configure o login e o callback `https://SEU_DOMINIO/oauth/meta/callback`.
2. Configure `META_APP_ID` e `META_APP_SECRET` no servidor. O código usa `META_API_VERSION=v24.0` por padrão; confirme que a versão e o fluxo de login são suportados pelo aplicativo configurado.
3. Solicite o acesso `ads_read` e os requisitos de verificação/revisão necessários para contas de clientes externos. Contas de teste e administradores do aplicativo não demonstram autorização para vender a qualquer cliente.
4. No painel, ligue Meta Ads, autorize na plataforma e selecione a conta de anúncios. Se não usar MZN, indique explicitamente a taxa de conversão para MZN antes de importar.

O servidor consulta Insights por campanha/dia; não precisa de permissão para criar ou alterar anúncios. O token não vai para o navegador. Uma campanha com o mesmo nome normalizado do produto é associada a ele; campanhas sem correspondência continuam no gasto total. As importações usam IDs estáveis de conta/campanha/data. O gasto pode ser revisto pela Meta e é atualizado nas sincronizações seguintes.

Compare com o Ads Manager um dia fechado, respeitando a moeda e o fuso da conta; importe duas vezes e confirme que não duplica. O gasto de hoje pode ser parcial. O processo consulta os últimos 30 dias, com dias definidos pela conta de anúncios; diferenças de fuso entre loja e Meta precisam de validação antes de tratar o ROI diário como reconciliado.

## 5. Rede e operação

Destinos necessários em produção: a loja `*.myshopify.com`, `www.facebook.com`, `graph.facebook.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` e os endpoints Google usados pela identidade/Firestore (`firestore.googleapis.com`, `oauth2.googleapis.com`, `www.googleapis.com`, `accounts.google.com`). Use os destinos mínimos da infraestrutura escolhida. Para instalar os emuladores, a CLI descarrega artefactos verificados de `storage.googleapis.com`; dependências Node vêm de `registry.npmjs.org`.

Configure logs sem tokens, alertas para falhas de sincronização, retenção/limpeza da fila e estados OAuth, recuperação dos jobs que esgotaram tentativas e backups do banco. Esta versão conserva jobs falhados para diagnóstico; não tem consola administrativa de reprocessamento. Os erros de integração aparecem no menu ⋯ → Integrações.

A cobrança ainda não existe. O serviço **não está pronto para aceitar assinaturas pagas** até os requisitos comerciais indicados em README.md serem implementados e as ligações reais validadas.

## Catálogo Shopify e limpeza manual

Adicione read_products à versão ativa do app Shopify e reautorize no painel. Em Resultados → Produtos → Vincular produtos Shopify, selecione a correspondência com um produto existente, Criar no painel ou Não vincular. O servidor lê apenas ID e título; não consulta nem altera inventário. Uma ligação preserva ID local, custo, fotografia e locais/quantidades; nomes anteriores tornam-se aliases. Nomes vinculados são editados na Shopify e atualizados automaticamente pelo Worker em lotes de cinco, com reconciliação diária. Produtos criados da loja têm custo por definir e stock local vazio. Falhas no catálogo são apresentadas nas integrações e não bloqueiam indefinidamente a reconciliação dos pedidos.

Em ⋯ → Dados → Limpar pedidos e gastos manuais, a prévia contém apenas pedidos sem identificação Shopify, anúncios/outros sem identificação Meta e gastos da loja. A confirmação exige baixar o backup, confirmar que foi guardado e escrever APAGAR. Produtos, stock, importações identificadas e movimentos antigos de caixa são preservados. A restauração específica da limpeza valida todo o ficheiro antes de inserir e nunca substitui IDs existentes. Limpeza/restauração usam as transações e revisões normais, em lotes; consulte o estado de gravação e resolva conflitos antes de continuar. A conta real só é alterada pela ação autenticada do utilizador nesta interface.
