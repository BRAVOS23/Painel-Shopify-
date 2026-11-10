# Taxa de entrega padrão

Cada negócio pode definir o custo fixo combinado com o entregador em Conta → Taxa de entrega padrão. Existe um atalho na secção de custos de Resultados. A opção começa desligada, sem qualquer valor imposto ao proprietário.

A taxa aplica-se uma vez por pedido concluído, mesmo que contenha vários produtos. Não é um pagamento automático ao entregador nem altera o frete cobrado na Shopify. Pedidos pendentes e cancelados não entram no custo. Um valor específico por pedido, incluindo zero, pode ser definido no formulário de edição e tem prioridade sobre o padrão.

## Histórico e exceções

O servidor captura a taxa na conclusão. Alterar ou desligar o padrão não recalcula custos de pedidos já concluídos e guardados. Nos pedidos importados pela primeira vez já concluídos, a taxa só é aplicada quando a data original do pedido não é anterior ao dia de ativação/configuração vigente, no fuso de Maputo; não foi inventada uma data real de entrega que a Shopify não forneceu. Pedidos antigos podem receber um valor explícito pelo editor.

Valores antigos em `comissao` continuam com os seus cálculos anteriores por linha. O editor apresenta “Manter custo já registado”; só muda o modelo desse pedido quando o utilizador escolhe explicitamente o padrão ou um valor específico. Uma edição apenas do contacto não deve alterar custos históricos.

Os custos automáticos/específicos de um pedido são repartidos pelos produtos proporcionalmente ao valor de cada linha. Sem receita positiva, usa-se a quantidade. O rateio distribui os cêntimos restantes para garantir que a soma das linhas coincide com a taxa. Valores antigos de comissão mantêm a sua distribuição histórica por linha.

## Implementação

- `businesses/{uid}.deliveryPolicy`: enabled, amount, revision e updatedAt. O endpoint autenticado `POST /api/delivery-policy` exige permissão de edição e revisão atual; aceita valores de zero a 1.000.000 MT, com até duas casas decimais. Não modifica negócios de outros UIDs.
- Vendas: `deliveryFeeMode` auto/manual, `deliveryFee` como valor integral por pedido e `deliveryFeeCapturedAt`. O snapshot é repetido nas linhas; **não somar esse campo diretamente**.
- `web/delivery.mjs`: captura e rateio partilhados pelo servidor e pelos gráficos. Em importações por lotes, a captura mais antiga conhecida do pedido determina o padrão. Um valor manual tem prioridade.
- `server/store.mjs`: captura no servidor para alterações locais, conclusões Shopify e importações. A API devolve o registo canónico após gravar, para atualizar os gráficos locais com a taxa realmente guardada.
- `web/delivery-settings.mjs`: configuração por negócio e escolha entre padrão, valor específico e valores legados no editor.
- Métricas, gráficos diários, totais por entregador e exportações CSV usam o mesmo rateio. Não há desconto automático de stock.

## Backup e testes

Os snapshots de custo integram os registos exportados e são preservados ao restaurar. A configuração do padrão também aparece nos metadados da exportação completa da conta; os scripts de restauro recuperam os registos, sem reativar configurações da conta. Confirmar/configurar o padrão no destino após uma migração.

Testes: `npm test`, `npm run test:delivery` (API/emuladores), `npm run test:browser` e `npm run test:worker`. Cobrem pedidos com vários itens, rateio por produto, alteração de taxa sem recalcular conclusões, valor específico zero, cancelados/pendentes, revisões concorrentes, isolamento por conta, sincronização, restauro e UI móvel. Os testes usam apenas contas sintéticas.

## Valor ao concluir um pedido

Desde 08/11/2026, ao clicar em **Concluir**, se o pedido ainda não tiver um custo de entrega registado e não existir uma taxa padrão ativa, aparece o diálogo **Custo da entrega**. É necessário indicar o valor pago ao entregador, incluindo 0 MT quando não houve custo. **Voltar**, fechar ou premir Escape deixa o pedido por concluir.

O valor é guardado como custo específico do pedido antes de pedir a conclusão na Shopify; se a gravação falhar, a conclusão não é enviada. Se a Shopify não concluir, o custo fica guardado para a próxima tentativa. Pedidos com vários produtos usam uma única taxa por pedido. Uma taxa específica já guardada (incluindo zero), um custo antigo positivo ou uma taxa padrão ativa evitam a pergunta repetida.

## Remover a taxa e corrigir um pedido

Conta → Taxa de entrega padrão apresenta **Remover taxa padrão**. A ação guarda a política desligada e com valor zero, respeitando a revisão do servidor, e limpa o valor no formulário. Desmarcar a taxa e guardar tem o mesmo efeito. Os custos já capturados nos pedidos não são removidos em lote.

Para um custo já aplicado por engano: editar o pedido → Mais detalhes → **Retirar custo deste pedido** → guardar. Fica registado um custo específico de 0 MT; o pedido não volta a receber a taxa padrão automaticamente. Isto permite corrigir apenas o registo escolhido, sem apagar custos legítimos de outros pedidos.

## Gastos no cancelamento

Ao cancelar pelo painel, incluindo pelo estado de um pedido manual, a janela pergunta se houve algum gasto. É necessário escolher Não houve gasto ou Sim, houve gasto e indicar um valor positivo. Voltar, fechar e Escape não cancelam o pedido. A taxa padrão nunca é aplicada ao cancelamento.

O valor e a data ficam em `vendas.cancellationCost` e `vendas.cancellationCostDate`. A decisão é guardada antes de pedir o cancelamento à Shopify; o gasto só entra nos cálculos quando o pedido está cancelado. Uma recusa da Shopify mantém o estado anterior e permite retomar a tentativa com o valor preenchido. A confirmação de um cancelamento ainda depende da plataforma, como antes.

O gasto entra em **Outros**, no total de custos e no lucro estimado, na data do cancelamento em Africa/Maputo, ou na data corrigida pelo utilizador. Não gera receita, aquisição de mercadoria ou entrega concluída. Conta uma vez por pedido, repartido proporcionalmente pelas linhas para permitir filtrar por produto. IDs de CSV substituídos por linhas canónicas não duplicam nem perdem o custo local.

Resultados → Gastos mostra a despesa associada ao pedido, com Editar pedido. No editor, Gasto no cancelamento e Data do gasto permitem corrigir o valor; zero retira o gasto dos cálculos. A despesa não é também lançada como um gasto manual independente. Não registar o mesmo pagamento uma segunda vez.

A sincronização e os backups preservam os dois campos. Cancelamentos automáticos recebidos da Shopify não inventam despesas nem abrem janelas em segundo plano. O gráfico diário, os indicadores e o histórico usam a mesma regra de alocação.
