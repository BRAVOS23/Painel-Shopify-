# Publicar no Cloudflare Workers Free

Esta versão foi compilada com Wrangler e testada no Workerd local, com Firebase emulado. Ainda não foi publicada nem validada com o projeto Firebase real, Shopify ou Meta. Não comprar domínio, não ativar Workers Paid e não mudar o Firebase Spark para Blaze: o requisito do proprietário é orçamento zero.

## Ficheiros e comandos preparados

- Worker: `worker/index.mjs`.
- Configuração: `wrangler.jsonc`, nome `painel-shopify`.
- Interface: `npm run build` gera `dist/`.
- APIs: rotas compartilhadas com o backend Node, usando Request/Response no Worker.
- Firestore: API HTTPS com conta de serviço, sem gRPC ou processo Node persistente.
- Autenticação: o token é verificado na API oficial Firebase, incluindo projeto, identidade, expiração e revogação. Email tem de estar verificado em produção.
- Cron: uma execução por minuto, com um lote pequeno e continuidade guardada no Firestore. Fechar o navegador não para o agendamento publicado.

## Desenvolvimento e validação

```sh
npm ci
npm run dev
```

Num segundo terminal, com os emuladores já disponíveis:

```sh
npm run dev:worker
```

O Node de desenvolvimento usa a porta 3000; o Worker local usa a porta 8787. Ambos usam os mesmos emuladores isolados `demo-painel`; nenhum usa o banco real.

```sh
npm test
npm run test:integration
npm run test:worker
npm run check:worker
```

`check:worker` usa `wrangler deploy --dry-run`: compila, valida bindings e assets, mas não publica. `test:worker` requer emuladores e Wrangler locais em execução; o teste da API corre no Workerd real. Shopify/Meta são simulados e não recebem alterações reais.

## Campos na tela da Cloudflare

Só prosseguir depois de enviar a versão testada para o GitHub e confirmar a branch selecionada.

| Campo | Valor |
| --- | --- |
| Repositório | `BRAVOS23/Painel-Shopify-` |
| Branch | A branch que contém `wrangler.jsonc` e `worker/` |
| Project name | `painel-shopify` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy --env=""` |
| Root directory | raiz do repositório (vazio, ou `/` se a interface exigir) |
| Enable Preview builds | desativado nesta primeira configuração |

Não usar o preset de Pages estático nem apenas carregar o HTML: o servidor faz parte do Worker. Não preencher credenciais nos comandos de build. A instalação das dependências é feita pelo sistema de builds; existe um lockfile. Se o ambiente permitir escolher a versão Node, usar 22 ou superior.

## Ligar o Firebase sem enviar segredos para o chat

A configuração Web pública de `painel-cash-on-delivery` já está no Wrangler. Ela permite configurar o login; **não dá acesso administrativo ao banco**. Uma primeira publicação sem conta de serviço mostrará uma mensagem indicando que falta a ligação segura ao Firebase, em vez de fingir que os dados foram guardados.

1. No Firebase do projeto correto, abrir Project settings → Service accounts → Firebase Admin SDK.
2. Gerar a chave privada da conta de serviço para esse projeto. O ficheiro JSON é um segredo administrativo: não enviar no chat, não pôr no GitHub, não incluí-lo em screenshots e não carregá-lo como ficheiro público da aplicação.
3. No Worker Cloudflare → Settings → Variables and Secrets, criar **Secret** com nome `FIREBASE_SERVICE_ACCOUNT`. Colar ali o JSON completo e guardar. A conta tem de ter acesso ao Firestore desse projeto; preferir uma identidade com o menor acesso necessário. O Worker só pede o scope OAuth `datastore`.
4. Guardar/republicar quando a interface exigir, conforme o fluxo da Cloudflare. O segredo não entra no código nem na configuração pública.
5. Copiar a URL HTTPS `workers.dev` atribuída à aplicação. Guardar uma variável `APP_BASE_URL` com essa URL, sem barra final. Ela será usada nos callbacks das integrações.
6. No Firebase Authentication → Settings → Authorized domains, acrescentar apenas o hostname dessa URL. Verificar as regras Firestore: acesso direto do cliente deve continuar negado; o acesso ocorre pela API autenticada.
7. Criar uma conta de teste no aplicativo publicado, confirmar o email, adicionar um lançamento, recarregar e verificar outro dispositivo. Criar uma segunda conta de teste e confirmar isolamento. Esta validação de produção ainda não foi feita.

Não adicionar `FIREBASE_SERVICE_ACCOUNT` como variável pública nem incluí-la em `wrangler.jsonc`. Se o JSON exceder o limite de 5 KB da Cloudflare, parar e preparar outra forma de identidade; não truncar a chave. Verificar logs de execução sem publicar tokens ou requisições completas.

## Shopify e Meta depois da ligação do banco

Seguir as secções próprias de SETUP.md e configurar os aplicativos das plataformas. Os campos sensíveis vão para Secrets do Worker:

- `INTEGRATION_ENCRYPTION_KEY`: 32 bytes aleatórios em base64; a mesma chave tem de ser mantida para ler tokens existentes.
- `SHOPIFY_CLIENT_SECRET` e `META_APP_SECRET`.

IDs `SHOPIFY_CLIENT_ID` e `META_APP_ID` podem ser variáveis normais. Os callbacks usam `APP_BASE_URL` e os caminhos indicados em SETUP.md. Não colar tokens diretamente no navegador. Configurar as permissões/revisões aplicáveis e testar com contas e pedidos de teste antes de usar dados de clientes.

## Limites e o que os testes não demonstram

A documentação oficial consultada indica 100.000 pedidos/dia, 10 ms de CPU por execução e 50 subrequests no Workers Free. O projeto não configura um plano pago, armazenamento Cloudflare pago ou upgrades Firebase.

- Cada invocação limita as chamadas controladas a 40, reservando margem para o runtime. Não é uma garantia de cumprimento da CPU em todos os volumes; confirmar CPU e erros `1102`/`1027` nas métricas do Worker publicado. Os testes locais não aplicam nem certificam a quota CPU de produção.
- Cada lote grava até 5 itens/gastos. Uma página Shopify traz um pedido; pedidos com vários itens continuam pelo ID desse pedido. O Meta avança um cursor de até 5 campanhas/dias por lote.
- Cada minuto processa um webhook pendente; sem webhooks, alterna Shopify/Meta de um negócio por vez e depois avança para o seguinte. A reconciliação completa tem um intervalo mínimo de 15 minutos após concluir uma janela. Atrasos dependem do número de negócios, pedidos e lotes; não promete sincronização instantânea. Muito tráfego de webhooks pode atrasar a reconciliação Meta nesta primeira versão.
- O navegador verifica alterações visíveis a cada 60 segundos; se o estado não mudou, recebe 304, sem reler as coleções. As ligações são consultadas a cada 5 minutos. Ao voltar à aba, verifica os dados.
- Nesta versão, cada coleção do negócio tem um limite de leitura completa de 500 registos no adapter Worker. Acima disso a API avisa, em vez de apresentar totais incompletos. Paginação/histórico maior é uma pendência antes de vender em escala.
- As quotas do Firestore contam documentos lidos/escritos, não apenas chamadas HTTP. Vários clientes, fotografias e sincronizações podem consumir a quota gratuita. Manter o plano Spark; se atingir uma quota, diagnosticar/reduzir uso, sem ativar faturação automaticamente.

Os limites e preços podem mudar: confirmar a página oficial no momento de publicar. Isto prepara um piloto gratuito, não certifica custos zero para um serviço ilimitado nem termina os requisitos comerciais.

## Preservar os dados do protótipo

A versão anterior está conservada em `legacy/painel-negocio-3.html`, com um botão para exportar um backup JSON apenas das cinco coleções de dados. Não exporta URLs/tokens das integrações.

Dados `localStorage` pertencem ao domínio do site antigo; o domínio Cloudflare não consegue lê-los. Abrir o protótipo legado no mesmo domínio/navegador onde os dados estavam guardados e exportar o backup. No aplicativo novo, entrar numa conta vazia e usar **Importar backup JSON**. A cópia original e o ficheiro de backup são conservados. O backup contém dados do negócio: guardar privadamente. Fazer a migração antes de substituir a publicação usada no dia a dia.

## Publicação e estado

Nenhum push, deploy real, alteração de plano ou configuração de segredo foi feito automaticamente. A versão preparada tem de ser enviada para o GitHub e a publicação feita com aprovação do proprietário. A conexão Firebase real e as integrações têm de ser validadas depois de configurar os segredos. Cobrança e assinaturas continuam por implementar.
