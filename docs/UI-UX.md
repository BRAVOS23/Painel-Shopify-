# Revisão da interface — 12 de outubro de 2026

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
