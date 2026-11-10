# Meta Ads: autorização, conta e sincronização

## Fluxo de utilização

1. Em ⋯ → Integrações, ligar ou reautorizar a Meta.
2. Confirmar a conta de anúncios e, se a moeda não for MZN, a taxa de câmbio.
3. Tocar em **Guardar conta e câmbio**. A autorização pode estar Ligada sem esta confirmação; nesse caso Sincronizar agora fica indisponível e aparece uma instrução.
4. Usar **Sincronizar agora** para importar gastos. Uma importação parcial continua por lotes automáticos. Repetir a consulta não cria novos IDs para os mesmos gastos.

Alterar o campo do câmbio não guarda o valor. É necessário confirmar com o botão; a sincronização fica indisponível enquanto as alterações desse formulário estiverem por guardar. Voltar a consultar contas apenas atualiza as contas disponíveis; não elimina os gastos.

## Processamento e recuperação

O runtime gratuito escreve no máximo cinco registos por lote. Uma página Meta maior é processada em várias execuções: conserva o cursor da página e a posição dentro dela, avançando o cursor só depois de consumir todas as linhas. Uma alteração na sequência de campanhas/datas da página reinicia a posição; IDs determinísticos evitam duplicação. Páginas acima de 1000 linhas são recusadas explicitamente, sem truncar. A API continua a pedir páginas pequenas.

Os IDs incluem a conta, a campanha e a data. Cada gasto conserva moeda original, valor original e câmbio usado. Dados sem campanha, data ou valor válidos são recusados com diagnóstico, em vez de tratados como zero. Um gasto real de zero continua válido. A associação ao produto não é condição para importar: campanhas não associadas entram no total geral.

Só depois da gravação do lote se guarda a posição seguinte. Se guardar o progresso falhar, a repetição do lote é idempotente. O estado Ligada confirma a autorização, não o sucesso da última importação. Uma falha de sincronização não elimina a ligação, os gastos anteriores ou o câmbio guardado.

## Diagnósticos públicos

| Código | Etapa / ação |
| --- | --- |
| META_ACCOUNT_REQUIRED | Confirmar a conta com Guardar conta e câmbio. |
| META_RATE_REQUIRED | Confirmar um câmbio válido para a moeda da conta. |
| META_AUTH_EXPIRED | Reautorizar o acesso Meta. |
| META_ADS_PERMISSION | Confirmar ads_read e o acesso do perfil à conta de anúncios. |
| META_RATE_LIMIT | Aguardar a reposição do limite de consultas Meta. |
| META_INVALID_RESPONSE / META_PAGE_LIMIT | Resposta/página não utilizável; nenhum registo é truncado silenciosamente. |
| META_INVALID_RECORD | Campanha, data ou gasto inválidos; não é inventado um valor. |
| META_SYNC_READ_TOKEN | Não foi possível ler a autorização guardada. |
| META_SYNC_READ_CATALOG | Falha ao consultar o catálogo do painel. |
| META_SYNC_FETCH | Falha inesperada ao consultar os gastos. |
| META_SYNC_NORMALIZE | Falha inesperada ao preparar os registos. |
| META_SYNC_WRITE | Falha inesperada ao gravar o lote no painel. |
| META_SYNC_PROGRESS | Falha ao guardar a posição seguinte; repetir é seguro. |
| FIREBASE_QUOTA / FIREBASE_ACCESS / FIREBASE_UNAVAILABLE | Mantêm o diagnóstico específico da base de dados. |

O botão Sincronizar agora apresenta também o código devolvido pela API, e a mensagem guardada na integração conserva esse diagnóstico. Códigos conhecidos dos fornecedores são preservados; falhas inesperadas recebem a etapa, sem expor tokens, URLs autenticados ou respostas integrais.

## Verificação reproduzível

`npm test` cobre as páginas maiores, a posição/cursor, alterações de página e validação dos gastos. Com os emuladores locais, `npm run test:meta-sync` percorre a API e o Firestore REST: ausência de conta, ausência de câmbio, 13 linhas importadas em lotes 5/5/2/1, conversão USD→MZN, repetição sem duplicar, falha de gravação e recuperação. `npm run test:review` verifica a confirmação da conta no navegador, a indisponibilidade da sincronização antes de guardar e a apresentação do código após falha.

A mensagem genérica reportada em produção não permite confirmar qual destas condições ocorreu sem o diagnóstico da execução real. Estes testes usam dados sintéticos e não alteram as contas de anúncios reais.
