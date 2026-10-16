# Revisão da interface — 12 de outubro de 2026

> Referência atual (13/10/2026): [Manual técnico e funcional](MANUAL-TECNICO-E-FUNCIONAL.md). Este ficheiro conserva instruções/notas de fases anteriores. Afirmações de que o painel ainda não foi publicado, integrações nunca foram ligadas ou certas ações permanecem na interface podem estar desatualizadas; usar o manual e o código atual para o estado do projeto.

A estrutura mantém Resumo, Pedidos, Resultados e o menu de utilizador. A revisão não altera regras financeiras, permissões de acesso ou o armazenamento dos pedidos.

| Área | Problema observado | Alteração |
| --- | --- | --- |
| Tipografia | Títulos em Space Grotesk e valores em IBM Plex Mono tinham estilos diferentes e aparência de código. | Inter em texto, títulos e valores; números tabulares; contraste reforçado nos dois temas. |
| Navegação | A largura de 800 px ainda usava um cabeçalho de computador no telemóvel. | Navegação inferior até 1023 px; subabas acessíveis ao deslocar; alvos de toque de pelo menos 44 px. |
| Resumo | Ações e valores precisavam de acompanhar a tipografia e os espaços das outras áreas. | Cartões e atalhos com tamanhos e cores consistentes. |
| Pedidos | Faltava pesquisa nos pedidos abertos; todos os campos e ações competiam pela atenção. | Pesquisa por contacto, local e produto; filtro de estado; detalhes opcionais no formulário; três ações principais e outras opções num disclosure. Produto/valor ficam visíveis no cartão fechado. |
| Relatórios | Rótulos mistos e tabelas difíceis de ler no ecrã estreito. | Rótulos em português, contraste e tipografia revistos; tabelas continuam a transformar-se em cartões. |
| Meses anteriores | A consulta e o reagendamento precisavam de continuar funcionais com os novos componentes. | Histórico e transferência entre meses preservados e novamente verificados. |
| Resultados | O ROI dominava o ecrã vazio; havia notas longas e os gráficos causavam overflow em 360 px. | Receita e lucro primeiro; taxas em seguida; explicação completa recolhível; custos com detalhe; vazio com ações úteis; dimensões dos gráficos corrigidas. Período inicial: este mês. |
| Registar gastos | Três formulários simultâneos produziam uma página longa. | Categoria Anúncios/Outros/Loja mostra um formulário de cada vez. Edição pelo histórico abre a categoria correta. |
| Produtos | O formulário completo aparecia antes do catálogo. | Catálogo como entrada; criação/edição em diálogo com foco e campos de stock por local preservados. |
| Histórico de gastos | Faltava um caminho direto para registar outro gasto. | Ação contextual de registo; nomes e filtros mais claros. |
| Conta/integrações/dados | Texto e controlos pouco consistentes. | Tema, sessão e backups preservados; domínio ligado preenchido quando disponível; reautorização identificada como tal. |
| Calendários | O posicionamento antigo não correspondia ao novo breakpoint; Escape deixava o painel aberto. | Popup centrado e limitado ao ecrã móvel; Escape fecha e devolve o foco; nomes acessíveis nos botões de navegação. |
| Falhas de ligação | O arranque podia deixar uma página vazia; uma gravação offline demorava a mostrar falha. | Estado de arranque com nova tentativa; falha offline imediata e nova tentativa de gravação. Dados pendentes permanecem apenas na memória da aba, sem promessa de edição offline persistente. |

## Verificação realizada

- Todas as áreas e subabas em 360, 390, 800 e 1280 px, com temas claro e escuro: sem scroll horizontal nem erros de JavaScript.
- Produto criado e editado pelo diálogo; stock por local mantido.
- Registo dos três tipos de gastos e edição a partir do histórico.
- Pedido manual concluído e resultados conferidos: receita de 200 MT, custos de 120 MT e lucro de 80 MT na conta de teste.
- Pesquisa e filtro de pedidos; PDF com ficheiro válido.
- Reagendamento em lote entre meses; histórico, backup e dados antigos de caixa preservados após recarregar.
- Ações Shopify simuladas: indicação imediata, bloqueio de cliques repetidos, atualização após confirmação e erros visíveis no cartão.
- Falha de arranque e gravação offline; recuperação online com persistência confirmada.

Os testes usam dados sintéticos e emuladores. Não concluem nem cancelam pedidos de clientes reais. A renderização foi verificada em Chromium; uma verificação num dispositivo físico continua útil para particularidades do teclado e do sistema operativo.

## Gráficos e instalação — 13 de outubro de 2026

Resultados: receita e gasto total em linhas, comparação ao tocar/hover, cursor vertical, datas curtas e até seis marcas no eixo horizontal. O seletor Acumulado soma os valores diários já calculados, sem alterar as regras financeiras. Os custos mostram o total no centro e legenda inferior; Relatórios usa barras horizontais para comparar as origens dos pedidos. Tooltips usam Inter.

Conta: secção de instalação da PWA com o evento real beforeinstallprompt, tratamento de aceitação/recusa e estado instalado. Sem suporte ao prompt, apresenta instruções para Chrome/Android e Safari/iPhone. O manifesto já não afirma que os dados do negócio funcionam offline; consultar e guardar continuam a exigir internet.

Verificação: build e 27 testes unitários passaram. Auditoria Chromium com dados sintéticos e emuladores: todas as abas em 360, 390, 800 e 1280 px, temas claro/escuro, sem overflow ou erros JavaScript. Teste adicional confirmou tipo line, soma acumulada por dia, instruções manuais e chamada de prompt simulada. A instalação física em Android/iPhone não foi executada neste ambiente.

Correção posterior: Acumulado redesenha apenas o gráfico local, sem depender do endpoint de métricas. Regressão Chromium confirmou ativar, desativar e alternar rapidamente com métricas a devolver HTTP 503: os valores diários originais regressam. Uma falha na consulta inicial de conexões também não esconde mais o painel autenticado.

Sessão persistida: uma falha ao carregar /state já não é apresentada como erro de integração no formulário de entrada. O estado autenticado mostra uma página própria com Tentar novamente e Entrar noutra conta. Regressão Chromium confirmou entrada limpa sem sessão, falha HTTP 500 após restauro de sessão, recuperação sem reintroduzir credenciais e troca de conta sem mensagem residual. Build, 27 testes unitários e 19 cenários de integração passaram. Este teste simula a falha; não identifica a causa da indisponibilidade observada na conta de produção.

Diagnóstico de carregamento: erros REST Firestore reconhecidos passam a distinguir quota, falta de acesso, identidade recusada, indisponibilidade e timeout, com códigos públicos fixos. A página de sessão mostra esses erros acionáveis (403/422/429/503), sem respostas integrais do fornecedor nem credenciais. Verificação: 28 testes unitários, 13 verificações Workerd e regressão Chromium de recuperação de sessão passaram. O diagnóstico da conta de produção exige o novo código apresentado ou os logs Cloudflare; não há autenticação Cloudflare neste ambiente.

Quota Firebase confirmada pelo utilizador (FIREBASE_QUOTA): estado e métricas partilham um cache em memória no Worker, separado por projeto/ambiente e negócio, validado pela dataVersion obtida do servidor. Expira em cinco minutos e está limitado a oito MB/20 entradas; respostas são copiadas para impedir mutação do cache. Versões novas, outros negócios e entradas expiradas não reutilizam o estado anterior. Workers frios continuam a consultar Firestore. A sincronização incremental Shopify reduz a sobreposição de 24 horas para cinco minutos, mantendo o intervalo fixo e a importação inicial/cursores existentes. Isto reduz consumo futuro; não repõe a quota esgotada. Verificação: 29 testes unitários, 19 cenários de integração e 13 verificações Workerd passaram. A quota exata (leituras/escritas/outra) exige consultar Usage na consola Firebase.

Meta Ads: associação de campanhas aceita uma data válida no fim do nome (DD/MM/AA, DD/MM/AAAA, separadores ponto/hífen ou AAAA-MM-DD; opcionalmente entre parênteses/colchetes). O nome exato do produto tem prioridade. Não usa correspondência parcial nem escolhe arbitrariamente entre nomes normalizados duplicados; campanhas de conjuntos só são associadas se o conjunto estiver registado com esse nome. Mantém campaignName, valor, IDs estáveis e importação idempotente. Testes cobrem exemplos fornecidos pelo utilizador, data inválida, produto com números, combinação de produtos e nomes ambíguos. Build, 30 testes unitários e 13 verificações Workerd passaram.

Meta câmbio: a resposta pública da ligação inclui apenas a taxa numérica guardada; o campo é preenchido ao carregar e após guardar. Consultas periódicas não substituem a taxa enquanto o utilizador a está a editar. Guardar conta/taxa bloqueia o botão durante o pedido e mostra confirmação. Build, 30 testes unitários, 19 verificações de integração e teste Chromium com fornecedor simulado confirmaram reposição da taxa após reload; nenhuma conta Meta real foi alterada nos testes.

Reconciliação de produtos: filtro separa catálogo cadastrado de nomes não associados presentes em pedidos/gastos e mostra contagens explícitas. Produtos têm aliases validados (até 50); renomeações futuras guardam o nome anterior. Resultados → Associar nomes permite ligar nomes históricos e campanhas a um produto cadastrado, preservando IDs, pedidos, valores, stock e custos. Resolução partilhada entre frontend, métricas, Shopify e Meta; associação ambígua não é escolhida arbitrariamente. Gastos Meta sem produto são resolvidos pela campanha no cálculo, incluindo associações novas, mesmo antes da reimportação. A projeção usada pelo Worker inclui aliases. Histórico de gastos identifica origem manual/Meta e conserva o nome da campanha. Não remove possíveis duplicados manuais automaticamente.

Validação: 31 testes unitários; 19 cenários de integração; 13 verificações Workerd; auditoria de abas em quatro larguras/dois temas; regressão Chromium confirmou renomeação com custo histórico preservado, associação manual, persistência após reload e registo original da venda intacto. Os testes usam emuladores/provedores simulados; não confirmam os totais reais do negócio nem alteram plataformas reais.

Catálogo Shopify e limpeza manual: o filtro de resultados volta a mostrar apenas os produtos do painel, sem categorias de nomes importados. Resultados → Produtos → Vincular produtos Shopify consulta cinco nomes/IDs por página, permite ligar um produto local existente ou criar um novo, e exige read_products. A ligação preserva ID local, custo, fotografia e stock por local; nomes anteriores são aliases. Novos produtos têm custo por definir e stock vazio. Produtos ligados usam nome gerido na Shopify; o Worker reconcilia apenas os nomes desses IDs, diariamente em lotes de cinco. Falhas do catálogo ficam visíveis e não bloqueiam indefinidamente a reconciliação de pedidos. As consultas nunca incluem inventário e não executam mutações Shopify.

⋯ → Dados contém limpeza dos pedidos/gastos manuais autorizada pelo utilizador. Prévia por categoria e registo, download de backup, confirmação de ficheiro guardado e texto APAGAR antes da remoção. Mantém registos identificados Shopify/Meta, catálogo/custos/stock e movimentos antigos de caixa. A restauração específica valida todas as coleções/registos antes de inserir, recusa integrações e IDs duplicados, e não substitui registos existentes. Operações usam revisões/transações habituais em lotes; em caso de conflito/erro, o estado de gravação continua a exigir intervenção. Não houve limpeza na conta real durante o desenvolvimento: a ação precisa da sessão autenticada do utilizador no painel.

Verificação: 34 testes unitários, 20 cenários de integração e 14 verificações Worker; auditoria das abas em quatro larguras/dois temas; regressões Chromium de ligação, edição de custo com nome bloqueado em 390 px, limpeza com backup, preservação de stock/importações e restauração persistida após reload. Provedores simulados/emuladores; nenhuma loja ou conta real alterada nos testes.

A pedido do utilizador, removidos o botão e o diálogo de limpeza em massa. A remoção individual nas listas continua disponível; a restauração dos backups já produzidos foi preservada.

Reautorização Shopify: consulta paginada dos webhooks da aplicação, reutilizando tópico+URL HTTPS+formato JSON e criando apenas tópicos ausentes. Erros de criação identificam tópico/campos permitidos, sem expor respostas completas ou credenciais. A mesma loja preserva lastSync, cursores de importação e ligações/progresso do catálogo ao substituir o token; uma loja diferente não herda esses dados. Validação: 35 testes unitários, 21 cenários de integração e dry-run Worker; cenário simula falha de webhook durante reautorização e confirma preservação do progresso. A causa exata do erro da loja real não foi lida nos logs; o código anterior criava subscrições repetidas sem consultar existentes.

Associação de nomes: total do catálogo identificado como Catálogo: N produtos; botão e título mostram o número de nomes pendentes e atualizam após guardar. Corrigido o formulário que herdava seis colunas da folha de estilos geral, espremendo descrição, seletores e botão. Teste Chromium: quatro nomes passam a dois pendentes com catálogo de quatro produtos intacto; diálogo em 360/390/800/1280 px sem overflow.

Verificação de vendas: receita, aquisição, entrega e número de vendas excluem pendentes, remarcados e cancelados. Meta Insights consulta apenas campanha, gasto e datas; compras/conversões Meta não criam vendas. Critério confirmado pelo utilizador: Concluir no painel, ou pedido processado e pago na Shopify. API Shopify lê displayFinancialStatus; importação por API/CSV exige paid + fulfilled para conclusão automática. Confirmação explícita no painel fica registada em panelConfirmed e não é revertida pelo estado financeiro pendente; cancelamento/refund completo prevalece. Corrigida preservação indiscriminada de estados concluídos antigos ao receber fonte pendente. Pedidos Shopify antigos sem comprovação não entram nas métricas e são assinalados como a verificar. Uma passagem de verificação dos últimos 59 dias é retomada em lotes (salesPolicyVersion=2); registos mais antigos podem exigir confirmação/importação assistida. Histórico e valores não são apagados. Resumo/Relatórios contam pedidos únicos, como Resultados, em vez de linhas de produtos.

Validação: 38 testes unitários, 22 cenários de integração e 14 verificações Worker; teste de resposta Meta com 999 compras ignoradas; paid sem fulfilled e fulfilled sem paid permanecem pendentes; confirmação no painel sobre pedido unpaid permanece após reimportação; estado concluído automático antigo sem prova é reconciliado; auditoria das abas em quatro larguras/dois temas sem erros JavaScript. Testes com emuladores/provedores simulados, sem confirmação dos valores da conta real.

Concluir no painel, em pedidos ligados à Shopify, agora solicita processamento e registo do pagamento recebido via orderMarkAsPaid. Pré-verificação cancelledAt/displayFinancialStatus/canMarkAsPaid evita processar pedidos que não permitem o registo. Reutiliza processamento/pagamento já realizados; final e polling exigem fulfilled + paid antes de confirmar localmente. Se a segunda etapa falhar, o painel comunica a falha e não assume conclusão; repetir a ação retoma apenas estados em falta. Não utiliza captura/cobrança de cartão. A integração esclarece que Concluir significa confirmar pagamento recebido.

Validação: 40 testes unitários, 22 cenários de integração e dry-run Worker. Cobrem ambos os estados em falta, apenas pagamento em falta, apenas processamento em falta, repetição sem mutações, canMarkAsPaid=false sem efeitos e polling com processamento confirmado/pagamento pendente sem falsa conclusão. Provedores simulados; nenhum pedido real foi alterado nos testes.

## 16/10/2026 — navegação por tarefa

- Quatro áreas principais: Resumo, Pedidos, Produtos e Resultados; a mesma ordem no computador e na barra inferior móvel.
- Produtos saiu de Resultados. Conserva catálogo, associação Shopify, custo e stock local independente.
- Resultados apresenta Resultados e Gastos. Registar gasto abre um diálogo com as categorias existentes; os atalhos de edição mantêm-se.
- Pedidos apresenta Lista de pedidos e Relatórios. Um seletor de período partilhado permite consultar meses anteriores na mesma lista com pesquisa e estado.
- A lista permite concluir, cancelar e reagendar. A organização semanal e o formulário continuam em “Organizar entregas por mês e semana”; criar/editar abre essa área automaticamente.
- Relatórios focam pedidos, conclusões, cancelamentos, origens e entregas; a receita e os valores pagos ao entregador deixaram de ser apresentados ali.
- O antigo histórico separado foi retirado da navegação. O código de leitura legado permanece para compatibilidade; nenhum registo foi removido ou migrado.

As validações de navegação usam contas dos emuladores, incluindo catálogo, pedidos atuais/antigos, gastos e ecrãs de 360 a 1280 px. Não substituem um teste de usabilidade com novos utilizadores.

### Correção móvel após a revisão visual

Os cartões do catálogo precisavam de uma largura mínima de grelha igual a zero e de contenção individual; medir apenas o scroll da página não detetava os cartões a sair do painel. Os nomes passam a quebrar por palavras e a pesquisa usa a largura disponível. O valor em stock tem uma linha própria.

Na lista de pedidos, contacto e ações deixam o layout de duas colunas comprimidas. Nome/números e atalhos ficam em linhas próprias, com números indivisíveis e botões distribuídos em grelha. A etiqueta de ações deixa de consumir largura. Os testes agora usam quatro produtos com nomes longos e contactos fictícios com dois números, entre 320 e 1280 px, e verificam limites dos cartões, dimensões dos botões e ausência de quebra nos telefones.
