# Relatório resumido — preparação para vender acesso

15 de outubro de 2026 · Painel do Negócio

O painel recebeu a base técnica para controlar acessos e operar um piloto comercial. Continua em modo piloto, sem cobrança automática e sem bloquear a conta atual. Não foi contratado nem ativado nenhum serviço pago.

## Feito

- Planos e validade preparados, com ativação/renovação/suspensão pela administração, histórico das alterações e verificação no servidor. A conta administrativa será escolhida pelo proprietário.
- Acesso expirado conserva consulta e exportação. Pedidos de ativação ficam visíveis à administração; não fazem cobranças.
- Carregamento paginado, incluindo históricos com mais de 500 registos, e proteção contra leituras que misturem versões diferentes.
- Resultados protegidos contra cópias CSV/Shopify do mesmo pedido; custo conhecido capturado na conclusão. Pendentes, cancelados e conversões Meta não contam como vendas.
- Importação histórica Shopify por período, em lotes retomáveis, com verificação do acesso a pedidos antigos.
- Exportação completa dos dados da própria conta, verificação de qualidade, ferramentas de backup/restauro e encerramento com confirmação e reautenticação.
- Páginas de ajuda e minutas de termos/privacidade, com aceitação por versão preparada, ainda sem publicação legal aprovada.
- Manual atualizado, guia de operação/ativação e workflow de testes preparado no repositório.

## Verificação

Passaram 52 testes unitários, 25 cenários de integração, 9 comerciais, 2 de histórico/recuperação e 17 no runtime Workerd. Passaram também a verificação de cifragem no Workerd, a compilação/dry-run de publicação e o percurso no navegador com ecrã móvel: consulta, pedido de acesso, exportação, ativação administrativa, auditoria e eliminação de conta/login de teste.

Os testes usaram emuladores e dados sintéticos. Não apagaram dados reais nem concluíram/cancelaram pedidos reais na Shopify. As aprovações das plataformas, os totais reais da conta e o resultado de futuros testes GitHub Actions não estão certificados por estes testes.

Publicação confirmada em `main`, commit `11d9f62`, compilação `9a42e6e54840`. A saúde pública respondeu em produção; as páginas de ajuda/privacidade e o download deste PDF foram confirmados. O estado dos testes remotos GitHub Actions não foi verificado.

## Para tratar contigo quando voltares

1. Escolher a conta administradora e configurar os acessos em segurança.
2. Definir preços, periodicidade, teste, renovação, suporte e forma de receber/confirmar pagamentos e emitir comprovativos.
3. Confirmar identidade/contactos do vendedor, retenção e aprovação dos documentos legais.
4. Rever permissões, distribuição e requisitos de conformidade Shopify/Meta para clientes externos, incluindo callbacks próprios de privacidade ainda pendentes.
5. Conferir os relatórios reais e a cobertura histórica com as plataformas e medir a capacidade antes de aumentar o número de clientes.

A instalação gratuita continua sujeita às quotas Firebase/Cloudflare. O cálculo tem limite técnico de 10.000 registos somados por negócio; a exportação é paginada. Não existe ainda backup automático integral da infraestrutura, gateway de pagamento ou conciliação contabilística completa. A preparação feita não deve ser anunciada como lançamento comercial integralmente aprovado.

Detalhes e sequência de ativação: [guia comercial e operacional](PREPARACAO-COMERCIAL.md). Referência completa: [manual técnico e funcional](MANUAL-TECNICO-E-FUNCIONAL.md).
