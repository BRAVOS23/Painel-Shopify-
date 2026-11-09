# Revisão funcional e de experiência — 09/11/2026

Revisão do código e dos percursos atuais com Chromium, API local e Firebase Authentication/Firestore emulados. Os dados utilizados são sintéticos. Não foram alterados pedidos reais, integrações, credenciais, planos pagos ou infraestrutura de produção para executar os testes.

## Organização do produto

A navegação mantém quatro tarefas principais:

| Área | Para que serve | O que fica fora |
| --- | --- | --- |
| Resumo | Ver a situação do mês e abrir a próxima tarefa | Edição detalhada e configuração de integrações |
| Pedidos → Lista | Consultar e pesquisar pedidos por período e estado | Configurações e formulários permanentes |
| Pedidos → Entregas | Organizar mês/semana, registar, concluir e reagendar | Indicadores financeiros completos |
| Pedidos → Relatórios | Comparar estados e evolução; verificar ou importar histórico Shopify | Catálogo e stock |
| Produtos | Catálogo, custo por unidade e stock por local | Stock da Shopify e gastos publicitários |
| Resultados → Resultados | Receita, lucro estimado, custos e gráficos no período | Inventário e configuração técnica |
| Resultados → Gastos | Consultar registos e abrir o formulário da categoria | Apresentar a soma nominal de mensalidades como custo real de um período |
| Menu ⋯ → Conta / Integrações / Dados | Sessão, instalação, taxa padrão, ligações, exportação e importação | Operação diária de pedidos |

Produtos mantém área própria. O registo de gastos permanece uma ação contextual, com categorias Anúncios, Outros e Loja. A taxa padrão mantém-se em Conta e tem atalho no custo de entregas em Resultados. A operação por mês/semana fica visível em Entregas; a Lista e os Relatórios usam o período escolhido no topo.

### Entrada direta nas tarefas do dia

Ao tocar na navegação principal, a página abre no topo. Pedidos entra em **Entregas**, na semana e no mês atuais de Moçambique, com o formulário recolhido. Entregas é a primeira subaba e tem o botão **Hoje** para regressar ao contexto atual. Lista e Relatórios continuam disponíveis; os seus botões também voltam ao topo. Atalhos explícitos para editar/ver/reagendar um pedido preservam a data do registo.

## Problemas corrigidos e reforços

1. **Novo pedido depois de editar:** o botão podia reaproveitar a edição de um pedido existente. Agora inicia um novo registo, com os campos e o modo de entrega reiniciados.
2. **Criação de produto repetido:** um nome existente podia atualizar custo e stock sem passar por Editar. Agora o formulário recusa o duplicado, incluindo nomes associados, preservando o produto original.
3. **Reagendamento parcial:** reagendar uma linha Shopify podia deixar os restantes produtos do mesmo pedido no mês antigo. O reagendamento e a mudança de semana acompanham o pedido inteiro, preservando IDs, histórico e outros pedidos.
4. **Contagens diferentes:** semanas, avisos de meses anteriores e próximas entregas podiam contar linhas como pedidos. Passam a contar pedidos únicos; Entregas identifica separadamente o número de linhas quando necessário.
5. **PDF parcial:** selecionar um produto de um pedido com várias linhas podia exportar apenas parte do pedido. A seleção agora acompanha o pedido inteiro, sem incluir cópias CSV substituídas por linhas canónicas. A contagem mostra pedidos, não linhas.
6. **Reimportação desfazia Remarcado:** um pedido reagendado podia voltar a Pendente ao ler um CSV. O estado Remarcado é preservado quando a Shopify ainda o considera pendente; estados finais continuam a ser respeitados.
7. **Detalhes fora do ecrã:** o formulário de pedido, com Mais detalhes aberto, excedia a largura de 320 px. As colunas e os campos passam a respeitar a largura disponível.
8. **Janela do custo de entrega:** o formulário herdava a grelha geral de seis colunas. Agora usa uma coluna, valor em MT, campo de toque confortável e ações legíveis. Voltar não conclui; zero continua válido.
9. **Pesquisa em Entregas:** os controlos podiam aparecer com o aspeto mínimo do navegador. Agora têm contraste, borda, espaçamento e dimensões consistentes, incluindo pesquisa por província.
10. **Ver pedido sem destino claro:** o atalho do Resumo abria a semana sem localizar o pedido. Agora limpa filtros que o esconderiam, expande e foca o cartão correspondente.
11. **Edição de gasto residual:** fechar o formulário e começar outro registo podia reaproveitar uma edição anterior. O fecho e a entrada de novo gasto reiniciam a edição. O título distingue Registar de Editar e o foco vai para o campo relevante. Eventos de fecho atrasados não apagam uma edição acabada de abrir.
12. **Soma de gastos ambígua:** a soma nominal de registos, incluindo mensalidades, podia ser interpretada como custo de um período. O rótulo e a explicação distinguem a lista do cálculo proporcional em Resultados.
13. **Mensagens sem contexto:** pesquisas vazias de produtos e gastos passam a distinguir ausência de registos de filtros sem correspondência; registar um pedido já não é descrito como adicionar um contacto.
14. **Expectativa da sincronização:** a integração Shopify explica a diferença entre alterações recentes e importação histórica, com atalho direto para escolher o período em Relatórios.
15. **Apenas consulta incompleto na interface:** os controlos dinâmicos de edição, importação e ligação de produtos também respeitam a consulta sem escrita, inclusive nos diálogos. Consulta e exportação continuam disponíveis; a autorização continua a ser aplicada no servidor.
16. **Reforço na troca de conta:** rascunhos, campos de loja, seleções e pesquisas são limpos; as contas não reaproveitam a seleção de contas Meta da sessão anterior. A palavra-passe do login também é limpa.
17. **Formulário longo após guardar:** depois de guardar um pedido, o formulário e os detalhes opcionais recolhem para devolver espaço à lista.
18. **Acessibilidade:** abas/semana comunicam o estado ativo sem depender da cor; seleção PDF tem botão com nome e estado; fechar diálogos tem alvo mínimo de 44 px; labels, foco e teclado foram verificados nos percursos testados.

Pedidos Shopify com vários produtos continuam a possuir linhas individuais para valores, custos e edição por produto. A indicação de linhas torna essa estrutura explícita; concluir, cancelar, reagendar e selecionar PDF aplicam-se ao pedido inteiro. As regras financeiras de venda concluída, preservação de custos e stock independente não foram substituídas por esta revisão.

## Matriz de verificação

| Área | Ações e estados revistos | Evidência |
| --- | --- | --- |
| Entrada e sessão | Entrar, restauro, sair, trocar de conta, falhas de carregamento, conta sem escrita | Suíte comercial de navegador, revisão de sessão e cenários API |
| Resumo | Mês, abertos/concluídos, próximas entregas, Ver pedido, Novo pedido, produtos e integrações | Navegador e revisão de código |
| Lista | Período, pesquisa, estado, expandir, editar, concluir, cancelar, CSV | Navegador, integração de estados e código |
| Entregas | Mês/semana, pesquisa, detalhes, novo/editar, concluir, custo zero/Voltar, reagendar entre meses, seleção/PDF | Navegador com gravação real no emulador e testes unitários |
| Transferências | Remarcados anteriores, seleção e mudança de data/grupo | Helper partilhado testado e revisão do diálogo |
| Relatórios | Contagens, estados, evolução, período, verificar Shopify e importação histórica | Navegador, testes de relatórios e recuperação |
| Produtos | Pesquisa, expandir, criar, duplicado, editar, apagar, fotografia, stock e vinculação Shopify | CRUD no navegador; código de fotografia/stock; integração com fornecedor simulado |
| Resultados | Filtros, receita/lucro, custos, gráfico diário/acumulado, vazio e interpretação | Navegador e testes de métricas, atribuição e preservação de custos |
| Gastos | Três categorias, registo, edição/reabertura, pesquisa, tipo, total e proteção de linhas Meta | Navegador, código e cenários API |
| Conta | Tema, instalação/instruções, taxa padrão, acesso e sessão | Navegador e API |
| Integrações | Estado, ligar/reautorizar, sincronizar, desligar, conta Meta/câmbio e atalho histórico | Código, UI e API com fornecedores simulados |
| Dados | Backup/download, CSV, mapeamento, contacto alternativo, preservação de horário e reagendamento | Navegador com parser real e dados sintéticos; testes unitários |
| Recuperação/privacidade | Exportação privada, restauro com prévia, qualidade, encerramento e isolamento | Suítes de recuperação/comercial e navegador |
| Administração | Ativação, expiração, permissões e auditoria | Suíte comercial e navegador com duas contas de teste |
| Mobile/desktop | 320, 390, 768 e 1280 px; temas claro/escuro; formulário opcional aberto | Chromium, capturas e verificações de largura |

Os atributos `onclick` da interface também são inspecionados no navegador para identificar referências a funções inexistentes. Isso complementa os percursos; não prova todas as combinações possíveis de dados e permissões.

## Resultado da execução final

Todas as verificações abaixo terminaram com sucesso nesta revisão:

- 65 testes unitários, incluindo o reagendamento por pedido com várias linhas e a preservação dos originais em caso de erro.
- 25 verificações de integração de API, 9 verificações comerciais e 2 cenários de recuperação/restauro.
- Cenário integrado da taxa de entrega: isolamento por conta, revisões, múltiplos produtos, custo zero e exportação.
- Duas suítes Chromium: comercial/administração e revisão de UX, sem erros JavaScript nos percursos executados.
- Layouts em 320, 390, 768 e 1280 px, nos temas claro e escuro, incluindo detalhes do formulário abertos.
- 18 verificações no Workerd local e cenário AES-GCM de cifragem, integridade e ocultação de token.
- Compilação, deploy em modo dry-run e `git diff --check`.

## Reprodução

Com `npm run dev` a correr noutro terminal e apenas emuladores `demo-painel`:

```sh
npm test
npm run check:worker
node scripts/validate-local.mjs
```

A nova suíte `npm run test:review` compila o painel e percorre criação/edição, regressões de duplicados, conclusão com custo zero, reagendamento com múltiplas linhas, importação CSV, PDF/CSV/backup, gráficos, instalação, navegação, larguras/temas e troca de conta. A suíte foi acrescentada à validação local usada pela CI.

## Limites da revisão

Os testes de Shopify e Meta usam fornecedores simulados e não certificam o conteúdo ou as permissões atuais das contas de produção. Não foi feita uma conclusão/cancelamento real, nem uma nova autorização nas plataformas. Instalação física, teclado virtual e comportamento do Safari/iPhone exigem verificação nos aparelhos. Não é possível garantir ausência absoluta de erros; os percursos e regressões acima ficam reproduzíveis.

A publicação automática é acionada pelo envio para `main`; o envio, por si só, não confirma que o ambiente público já terminou a publicação. O manual consolidado de 06/11/2026 permanece uma fotografia daquela data; este relatório descreve as alterações posteriores desta revisão.
