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
