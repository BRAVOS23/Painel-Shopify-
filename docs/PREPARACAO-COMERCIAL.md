# Preparação comercial e operação

Atualização: 15/10/2026. Complementa o manual técnico com a preparação para vender acesso. O serviço continua em **piloto**, sem preços definidos, cobranças automáticas ou promessa de disponibilidade contratual. Não ativar infraestrutura paga sem autorização.

## O que foi preparado

- Planos propostos Piloto, Essencial e Profissional, todos sem preço. Nesta fase os nomes distinguem a ativação administrativa, sem prometer funcionalidades/quotas comerciais diferentes.
- Validade, ativação, teste autorizado e suspensão; alterações com revisão e chave de idempotência, registadas em `platformAudit`.
- Acesso administrativo apenas por UIDs autorizados no servidor. O primeiro utilizador não recebe privilégios; email, pedidos do navegador e custom claims não concedem este papel.
- Quando o controlo comercial estiver ativo, contas sem ativação ou expiradas ficam em consulta: podem ver e exportar dados, mas não gravar, sincronizar ou executar ações Shopify. Webhooks são pausados e retomados após renovação. O servidor faz a verificação, além dos botões da interface.
- Pedidos de ativação aparecem na lista administrativa. Não enviam emails/WhatsApp nem verificam pagamentos.
- Registo manual do meio/referência/valor recebido. O administrador confirma o recebimento **fora do painel** antes de conceder acesso. Não é um gateway, uma cobrança nem emissão de fatura/recibo fiscal.
- Exportação integral dos registos e metadados públicos da própria conta, ferramentas de qualidade e encerramento com confirmação, palavra-passe e sessão recente. Tokens/chaves não entram no backup.
- Minutas de termos, privacidade e ajuda. Aceitação por versão preparada, desativada enquanto não houver aprovação explícita e contactos do operador.
- Estado do negócio paginado e coerente por versão, cálculos sem truncar silenciosamente, custos capturados por venda e tratamento de cópias CSV/API.
- Importação histórica explícita Shopify por período, com cursor e lotes retomáveis. Não confundir verificação dos pedidos já guardados com importação de pedidos em falta.

## Ativação, com o proprietário

1. Exportar a conta e testar recuperação nos emuladores. Confirmar relatórios reais com Shopify e Meta, datas/câmbio/custos e pedidos com vários itens.
2. Obter no Firebase Authentication o UID da conta administradora e configurar `PLATFORM_ADMIN_UIDS` (lista separada por vírgula) no Worker. UID não é uma chave, mas não deve ser inventado. Manter o controlo comercial desligado enquanto se preparam acessos existentes.
3. Definir preços, periodicidade, teste, renovação, política de cancelamento/reembolso e suporte. Definir também identidade do vendedor, impostos/recibos e os meios de recebimento com o proprietário.
4. Em Conta → Administração, ativar a conta do proprietário e cada cliente piloto que deva continuar a editar, com validade futura no fuso Africa/Maputo. Em piloto estas ativações podem ser preparadas sem bloquear ninguém.
5. Rever minutas, retenção, contactos, responsabilidades e requisitos locais. Definir `OPERATOR_NAME` e `SUPPORT_EMAIL`. Só após aprovação expressa definir `LEGAL_DOCUMENTS_APPROVED=true`; as contas terão de aceitar a versão publicada para voltar a editar.
6. Depois de verificar acessos, definir `SUBSCRIPTION_ENFORCEMENT=true`. Contas sem ativação passam a consulta. A variável ausente ou false conserva a experiência piloto atual.
7. Testar uma conta externa autorizada nas duas plataformas. Fazer uma abertura comercial limitada, com apoio próximo; ampliar só com medição de utilização e capacidade.

Reverter `SUBSCRIPTION_ENFORCEMENT=false` volta ao piloto com edição para todas as contas verificadas; **não é uma política de renovação** e não deve ser usado como rotina. Para transferir administração, adicionar o novo UID, verificar a sessão e só depois remover o antigo. A conta de administrador não pode autoeliminar-se antes de transferir o papel.

Variáveis seguras de exemplo constam de `.env.example` e `config/production.env.example`. Segredos de integração continuam no gestor de Secrets, nunca no Git nem em mensagens. A chave `INTEGRATION_ENCRYPTION_KEY` é necessária para recuperar ligações existentes; não a substituir sem um plano de recifragem/reautorização.

## Shopify e Meta: ainda dependem de autorização externa

Ligar a conta do proprietário não certifica distribuição a outras empresas. É necessário verificar tipo/distribuição do app Shopify, permissões de fulfillment/pagamento/produtos, acesso a pedidos com mais de 60 dias e eventual acesso a dados protegidos. Para Meta, verificar acesso externo a `ads_read`, funções de teste, revisão/verificação empresarial e validade das credenciais conforme o caso. Não foi submetida nenhuma revisão nem alterada uma empresa nas plataformas nesta intervenção.

Os endpoints de conformidade Shopify `customers/data_request`, `customers/redact`, `shop/redact` e os fluxos exigidos de eliminação/revogação Meta ainda precisam de implementação e validação específicas antes da distribuição comercial. O autoencerramento do painel não substitui esses contratos. Não apontar esses callbacks para rotas que apenas devolvam sucesso sem processar o pedido.

## Novos contratos e dados

- `GET /api/account`: acesso efetivo, planos sem preço, administração e estado de documentos/encerramento.
- `POST /api/account/access-request`: pedido idempotente de ativação; sem cobrança.
- `GET /api/admin/businesses?limit=10&after=…`: lista paginada com acesso/uso, sem dados dos pedidos ou credenciais.
- `POST /api/admin/businesses/:uid/subscription`: `{requestId, revision, planId, status, expiresOn, method, reference?, amount?}`. Validade ao fim do dia de Maputo; máximo três anos. `status` active/trial/suspended; `method` manual/mpesa/emola/bank.
- `GET /api/admin/audit`, `GET /api/admin/health`, `GET /api/admin/businesses/:uid/health`: alterações e diagnóstico sanitizado; saúde de configuração não prova funcionamento da plataforma.
- `GET /api/state?manifest=1`: ownerId, versão e coleções. `GET /api/state/:collection?version=…&after=…&limit=250`: páginas. Reconsultar o manifesto ao final e repetir quando a versão muda; 409 impede misturar alterações.
- `GET /api/account/export`: metadados da conta e das ligações sem segredos; combinar com todas as páginas para exportar registos.
- `GET /api/data-quality`: contagens brutas, cópias ignoradas e custos/verificações em falta.
- `POST /api/account/legal`: `{version,accept:true}`, apenas documentos publicados/aprovados. A versão atual está em `server/access.mjs`; mudar a versão quando os documentos mudarem materialmente.
- `POST /api/account/closure`: `{action:'start',confirmation:'ELIMINAR'}` com sessão reautenticada nos últimos cinco minutos; depois `{action:'step'}`. GET consulta progresso. Cada lote apaga até 25 documentos. O cron continua o trabalho se a janela fechar.
- `POST /api/shopify/history`: `{action:'start',start:'AAAA-MM-DD',end:'AAAA-MM-DD'}`, step ou cancel. Até 366 dias; períodos antigos exigem `read_all_orders`. Guarda estado em `connections/shopify.historyImport`, sem alterar a Shopify. O relatório usa data de entrega local; a pesquisa histórica Shopify usa criação em UTC, preservando a regra existente. Pode haver diferenças nas fronteiras de fuso que exigem reconciliação.

Campos adicionais do negócio: `subscription`, `activationRequestedAt/Status`, `legal`, `accountStatus`, `usage`. Coleções privadas globais: `platformAudit`, `accountClosures`. Vendas podem guardar `unitCost`, `costCapturedAt`, `shopifyLineCount`. Não expor essas coleções diretamente pelas regras Firestore.

## Fiabilidade financeira e limites

As vendas exigem conclusão local explícita ou Shopify processada **e** paga. Meta só fornece gastos. As linhas canónicas completas da Shopify têm preferência sobre resumos legados do mesmo pedido, mantendo os originais no armazenamento e no backup. Uma importação canónica incompleta conserva o resumo legado até completar as linhas conhecidas. Correspondências ambíguas precisam de revisão; IDs Shopify ausentes não permitem deduplicação automática segura.

O custo conhecido fica capturado na conclusão/importação concluída. Alterar o catálogo não muda vendas com custo capturado. Registos antigos sem snapshot usam o catálogo como estimativa e custos desconhecidos são assinalados. Não foi reconstruído o custo histórico real nem verificado o total real de vendas da conta do proprietário.

Nesta instalação existe um limite técnico de cálculo de 10.000 registos somados por negócio e orçamento de 28 páginas internas. Novos negócios têm contadores transacionais; os legados sem contadores continuam sujeitos ao limite de leitura/cálculo, sem inventar contagens. A exportação paginada não depende de carregar o conjunto completo de uma vez. Isso não é garantia de desempenho móvel nem de capacidade para muitos clientes simultâneos.

Fotos grandes, muitas linhas de pedidos, quota Firestore, CPU/memória, crescimento dos webhooks e número de empresas precisam de medição. O plano Spark continua com quotas reais (incluindo leituras diárias); paginação não cria quota adicional. Não foi ativado Blaze, Workers Paid ou outro custo.

Não existe conciliação contabilística integral: frete/impostos, reembolsos parciais, data própria de recebimento, múltiplas moedas de loja e câmbio diário continuam limitados. Receita do relatório usa a data local do pedido/entrega, não a data efetiva de recebimento. Não vender relatórios como contabilidade certificada.

## Backup e restauro

O menu Conta → Dados oferece exportação. Os scripts operacionais usam um token de sessão recebido apenas na variável de ambiente `PAINEL_ID_TOKEN`, nunca em argumentos ou no Git. É temporário e deve ser removido após o uso. Preferir entrada segura no terminal/gestor de segredos, sem colar em chats ou gravar no histórico.

```sh
node scripts/backup-account.mjs --url http://127.0.0.1:8787 --out /caminho/privado/conta.painel-backup.json
node scripts/restore-account.mjs --url http://127.0.0.1:8787 --file /caminho/privado/conta.painel-backup.json
```

O restauro acima é apenas prévia. `--apply` executa; `--allow-new-account` autoriza migração intencional para outro UID e `--resume` retoma apenas registos em falta, sem substituir diferenças. Servidores remotos exigem HTTPS e `--production`. O backup é criado com permissão 0600, sem sobrescrever ficheiros existentes, e mostra SHA-256. O restauro preserva IDs/custos/stock, mas não reativa credenciais, assinatura ou login; isso exige configuração própria.

Não existe ainda backup automático integral do Firestore/Authentication em produção. A exportação da conta não é disaster recovery da plataforma. Aprovar retenção, armazenamento protegido e ensaiar recuperação antes de prometer recuperação a clientes.

O encerramento mantém um marcador mínimo de UID/estado/data para impedir recriação por sessões antigas. Elimina registos/credenciais locais e referências operacionais, não pedidos/anúncios das plataformas nem backups que o utilizador guardou fora do serviço. No fim o SDK Firebase elimina o login após reautenticação; se a janela fechar, o utilizador pode entrar e concluir esse passo. Prazos de retenção desses marcadores e comprovativos precisam de aprovação.

## Verificação e continuidade

Com Node >=22, Java 21 e emuladores demo-painel nas portas 9099/8080:

```sh
npm ci
npm test
npm run test:integration
npm run test:commercial
npm run test:recovery
pip install playwright==1.62.0
python -m playwright install chromium
npm run test:browser
npm run dev:worker
# Noutro terminal, após a saúde local responder mode=emulator:
npm run test:worker
npm run test:worker:crypto
npm run check:worker
```

Os testes criam/eliminam somente contas sintéticas locais e usam provedores simulados. A integração Worker exige Workerd local em 8787. `scripts/validate-local.mjs` reúne as suítes e inicia/termina o seu próprio Worker; não executar com outra sessão já a usar essa porta. O workflow `.github/workflows/validate.yml` reproduz a validação com emuladores; adicionar o workflow não significa que a execução remota já passou.

Módulos centrais: `server/access.mjs`, `platform.mjs`, `privacy.mjs`, `paging.mjs`, `history.mjs`, `web/business-tools.mjs`, `privacy-tools.mjs`. A API Node e o Worker partilham as regras. Rever o relatório desta intervenção para evidência e pendências antes de ativar vendas.
