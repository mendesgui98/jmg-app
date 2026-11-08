# Roteiro de melhorias da plataforma JMG

Lista priorizada do que falta refinar, para executar uma tarefa por vez. Para pedir: "faz a R2-1".
Cada tarefa entra num PR próprio; ao terminar, marcar `[x]`, registrar em
`contexto-desenvolvimento.md` e, se mudar regra, em `AGENTS.md`.

Legenda: **Depende do Guilherme** = precisa de uma informação, conta ou decisão antes de começar.

---

## Fase 0 — Reestruturação da obra (prioridade atual, levantada em 08/11)

Objetivo: as abas da obra conversarem entre si — marcou no checklist, avança etapa e cronograma;
o orçamento já traz o que o cliente vai pagar; recebeu, gera recibo e atualiza o cronograma.
Ordem sugerida: R0-2 → R0-3 → R0-4 → R0-5 → R0-7 → R0-1 → R0-6 (R0-1 espera as decisões).

### [ ] R0-1 · Checklist marcado avança a etapa e o cronograma

- **Por quê:** hoje o checklist é só lembrete (regra atual: "marcar nunca muda o avanço"); o avanço da etapa é digitado à mão por serviço na aba Etapas, então o mesmo trabalho é informado duas vezes e o cronograma fica desatualizado.
- **O que fazer:** o checklist vira a fonte do avanço — marcar o item de um serviço põe o serviço em 100% (desmarcar volta a 0%); a etapa recalcula pelo peso em valor (`servicesProgress`), e cronograma, painel do cronograma e Painel acompanham sozinhos. O % manual da aba Etapas passa a ser só leitura (ou parcial, conforme decisão). Atualizar a regra no `AGENTS.md`.
- **Onde:** `work_checklist_items` + trigger novo (migration), `work_stage_services.progress`, `src/lib/work-checklist.ts`, `src/lib/work-progress.ts`, `components/works/checklist.tsx`, `components/works/stage-services.tsx`.
- **Pronto quando:** ticar um item no checklist muda o % da etapa na aba Etapas e no Cronograma sem nenhum outro passo, com teste cobrindo marcar/desmarcar.
- **Depende do Guilherme:**
  1. Serviço só "feito / não feito" ou dá para marcar parcial (ex.: 50%)?
  2. Itens avulsos do checklist (sem serviço) contam no avanço ou são só lembrete?
  3. A equipe de campo pode ticar (e com isso mover o avanço) ou só admin/financeiro?

### [ ] R0-2 · Parcelas do orçamento viram contas a receber automaticamente

- **Por quê:** a conversão do orçamento aprovado cria etapas e serviços, mas não as parcelas; hoje cada uma é lançada à mão no Financeiro.
- **O que fazer:** ao converter o orçamento em obra, cada parcela de `payment_terms` vira uma conta a receber (`financial_entries` entrada) da obra, valores em centavos por `splitPayments`, vencimento pela data combinada ou pelo início da etapa ligada no cronograma (`budget_section_dates`). Cronograma mudou → vencimento das parcelas em aberto acompanha; nova revisão aprovada → refaz as parcelas em aberto, recebidas ficam intactas. Obras já existentes: botão "Gerar parcelas do orçamento" que não duplica o que já foi lançado.
- **Onde:** `convert_budget`/`supersede_previous_budget` (migration), `src/lib/proposal.ts` (`splitPayments`, `stageDates`), lógica pura testada nova para vencimentos, aba Financeiro da obra.
- **Pronto quando:** aprovar e converter um orçamento mostra todas as parcelas em Contas a receber com valor e vencimento certos, sem lançamento manual.

### [ ] R0-3 · "Recebi" em um clique, com recibo na hora

- **Por quê:** receber hoje pede vários campos e o recibo só aparece como sugestão num aviso que some.
- **O que fazer:** na conta a receber, botão "Recebi" com valor e data de hoje já preenchidos (só escolher a conta); ao salvar, entra como entrada no caixa e abre direto o recibo (`/recibos/$id`).
- **Onde:** Financeiro (contas a receber e aba Financeiro da obra), `register_settlement`/fluxo de baixa existente.
- **Pronto quando:** da parcela ao recibo aberto em no máximo 2 cliques.
- **Depende de:** R0-2.

### [ ] R0-4 · Recibo com o avanço financeiro em destaque

- **Por quê:** o recibo já tem total/pago/saldo e uma barra fina; o Guilherme quer que o cliente veja claramente quanto já pagou e quanto falta.
- **O que fazer:** proposta (a)+(c): barra grande "Pago X% · Falta Y%" com valores e linha do tempo das parcelas (pagas em verde, a deste recibo destacada, próximas em cinza com valor e data). Dados de `buildReceipt` (`summary`, parcelas), sem números novos.
- **Onde:** `api/src/pdf/receipt-html.ts`, `src/lib/receipt.ts`.
- **Pronto quando:** recibo gerado mostra o avanço financeiro visual e bate com o Financeiro.
- **Depende do Guilherme:** confirmar o formato — (a) barra grande, (b) rosca, (c) linha do tempo das parcelas.

### [ ] R0-5 · Cronograma mostra as parcelas pagas

- **Por quê:** o painel do cronograma já sabe o que foi pago, mas a folha físico-financeira do cliente não marca as parcelas recebidas.
- **O que fazer:** na folha (`ScheduleSheets`) e na aba Cronograma, parcela recebida marcada como paga (com data), em aberto/vencida diferenciadas; totais pago × a receber.
- **Onde:** `src/lib/schedule-sheets.ts`, `components/works/schedule-sheets.tsx`.
- **Pronto quando:** receber uma parcela muda a folha do cronograma sem nenhum outro passo.
- **Depende de:** R0-2.

### [ ] R0-6 · Reorganizar as abas da obra

- **Por quê:** hoje são 15 abas (Visão geral, Etapas, Checklist, Financeiro, Cronograma, Compras, Aditivos, Fotos, Relatórios, Documentos, Contrato, Diário, Entrega, Garantia, Decisões) que não conversam entre si.
- **Já validado:** Visão geral, Etapas, Checklist, Financeiro e Cronograma ficam.
- **Em aberto:** Compras (explicado: compra → contas a pagar; chegada do material → custo da obra; pagamento → só caixa — decidir se fica, simplifica ou junta ao Financeiro) e as demais abas, que o Guilherme ainda vai passar.
- **Onde:** `src/routes/_authenticated/obras.$id.index.tsx` e componentes de `components/works/`.
- **Depende do Guilherme:** terminar de passar as abas.
- **Relacionada:** R3-3 (parcela liberada por etapas concluídas) encaixa depois de R0-1 e R0-2.

### [ ] R0-7 · Visão geral: refazer o "Orçado × realizado" (conta e visual)

- **Por quê:** o Guilherme lançou o que recebeu do cliente e a tabela "soma/subtrai errado"; além disso o visual está feio.
- **Diagnóstico (código atual, `components/works/budget-vs-actual.tsx`):** a tabela mistura três bases sem dizer: "Valor contratado" é preço de **venda**; a coluna "Orçado" é **custo direto** (MO + material, sem estrutura/margem); "Realizado" são só as **saídas pagas** com etapa. O que o cliente pagou (entradas) **não aparece em lugar nenhum**, e a "Diferença" compara gasto com "orçado × avanço" — com avanço desatualizado (ver R0-1) o número parece absurdo. Gastos sem etapa entram no total como uma linha a mais.
- **O que fazer:** separar em dois blocos claros, com números que fecham à vista:
  1. **Cliente:** contratado (venda) − recebido = a receber, com barra de avanço financeiro (mesma fonte do recibo e do Financeiro).
  2. **Custo da obra:** custo previsto − gasto pago = saldo do custo, por etapa, com barra gasto × previsto e avanço físico ao lado; "a executar" para etapa não iniciada; gastos sem etapa destacados como alerta ("ligar à etapa").
  - Resultado previsto (venda − custo) no fim, vindo de `computeWorkResult`/executive.ts, sem fórmula nova na tela. Visual em cartões/barras no padrão azul + dourado do Painel, legível no celular.
- **Onde:** `components/works/budget-vs-actual.tsx`, `src/lib/operations.ts` (`stageCosts`, `earnedVariance`), `src/lib/work-composition.ts`; testes da regra nova.
- **Pronto quando:** na obra da Caroline Zeppelini os números batem com o Financeiro (recebido, a receber, gasto) e cada total é a soma das linhas exibidas.
- **Depende do Guilherme:** print ou os números que viu errados na obra da Caroline, para reproduzir o erro exato.

---

## Fase 1 — Segurança e confiabilidade (esta semana)

### [ ] R1-1 · E-mail de envio (SMTP)

- **Por quê:** o deploy avisa `SMTP_HOST vazio`; convites, recuperação de senha e qualquer envio de recibo/contrato por e-mail não funcionam.
- **O que fazer:** cadastrar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` nos segredos/variáveis do GitHub (o workflow já monta o `infra/.env` com eles); testar convite e "esqueci a senha".
- **Onde:** `.github/workflows/ci.yml`, `docs/deploy-vps.md`.
- **Pronto quando:** um convite chega na caixa de entrada e a recuperação de senha funciona em produção.
- **Depende do Guilherme:** conta de e-mail de envio (ex.: Google Workspace, Zoho, Brevo, Resend) e a senha de app.

### [ ] R1-2 · Dados da empresa e verificação em duas etapas

- **O que fazer:** preencher o e-mail da JMG em Configurações → Empresa e ativar a verificação em duas etapas da conta de administrador (Configurações → Segurança).
- **Pronto quando:** os dois avisos amarelos somem do Painel.
- **Depende do Guilherme:** é feito por ele na tela (2 minutos).

### [x] R1-3 · Aviso quando o deploy falhar

- **Por quê:** em 30/10 um deploy falhou na etapa "Montar infra/.env de produção" e ninguém viu; o recibo só subiu no deploy seguinte.
- **O que fazer:** investigar a causa da falha intermitente; tornar o passo resiliente (nova tentativa) e notificar por e-mail (ou WhatsApp/Telegram) quando o deploy falhar.
- **Onde:** `.github/workflows/ci.yml`, `infra/vps/deploy.sh`.
- **Pronto quando:** uma falha simulada gera aviso e a etapa tenta de novo antes de desistir.
- **Depende do Guilherme:** para onde mandar o aviso (e-mail já resolve, depois da R1-1).
- **Feito (30/10):** a causa era o `ssh-keyscan` (desiste em 5 s) quando a VPS demorava a responder; agora tenta 6 vezes com folga e o SSH tem timeout/keepalive. Deploy com falha abre a issue "Deploy em produção falhou" (o GitHub avisa por e-mail) e o próximo deploy bom fecha a issue.

### [ ] R1-4 · Backup diário do banco fora da VPS

- **O que fazer:** rotina agendada (GitHub Actions ou cron na VPS) com `pg_dump` diário, criptografado, guardado fora da VPS, com retenção de 30 dias; documentar como restaurar e testar uma restauração.
- **Onde:** `.github/workflows/`, `infra/vps/`, `docs/deploy-vps.md`.
- **Pronto quando:** existem backups dos últimos dias no destino e uma restauração de teste funcionou.
- **Depende do Guilherme:** destino do backup (ex.: Google Drive, Backblaze B2, S3 ou outra VPS).

---

## Fase 2 — Indicadores e precificação (próximas 2 semanas)

### [x] R2-1 · Caixa projetado em 90 dias (entradas e saídas)

- **Por quê:** o fluxo de caixa do Painel projeta só o que vai entrar; com as saídas previstas dá para ver antes um mês negativo.
- **O que fazer:** projeção semanal/mensal de saldo = saldo atual + a receber − a pagar (contas, parcelas de compra, impostos previstos); alerta no "Atenção" quando o saldo projetado ficar negativo.
- **Onde:** `src/lib/dashboard-home.ts` (puro, testado), `src/components/management/home-panel.tsx`.
- **Pronto quando:** o gráfico mostra a linha de saldo projetado e o alerta aparece com dados de teste.

- **Feito (30/10):** cartão "Caixa projetado · 90 dias" no Painel (`cashProjection` em `src/lib/business-indicators.ts`) e alerta no "Atenção" quando o saldo projetado fica negativo.

### [x] R2-2 · Funil comercial

- **O que fazer:** indicadores de orçamentos por situação (elaboração, enviados, aprovados, recusados), taxa de conversão, tempo médio até aprovação, valor em propostas abertas e motivo da recusa (campo novo ao recusar).
- **Onde:** migração para o motivo da recusa, `src/lib/` (puro), Painel e lista de Orçamentos.
- **Pronto quando:** o Painel mostra o funil do período filtrado e a recusa pede o motivo.

- **Feito (30/10):** cartão "Funil comercial" no Painel (`commercialFunnel`, última revisão de cada número, período pela data de emissão) e motivo obrigatório ao marcar como recusado (migração `20261030000037`, coluna `budgets.refusal_reason`).

### [x] R2-3 · Inadimplência

- **O que fazer:** % vencido sobre o que deveria ter sido recebido, dias médios de atraso por cliente e por obra; destaque no Painel e no cadastro do cliente.
- **Onde:** `src/lib/operations.ts`/`executive.ts`, Painel, perfil da pessoa.
- **Pronto quando:** os números batem com as contas a receber vencidas.

- **Feito (30/10):** cartão "Inadimplência" no Painel (`delinquency`) com taxa, atraso médio ponderado e ranking por cliente. Falta mostrar no perfil do cliente.

### [ ] R2-4 · Reserva técnica (contingência) no orçamento

- **Por quê:** imprevistos de reforma (demolição, hidráulica antiga) hoje saem da margem sem aparecer.
- **O que fazer:** novo percentual "Reserva técnica" em `pricing_settings` e nos parâmetros do orçamento, entrando na formação do preço (`priceFromCost`/`costBreakdown`) e no painel de preços; nunca no PDF do cliente.
- **Onde:** migração, `src/lib/pricing.ts` + testes, `pricing-panel.tsx`, Configurações.
- **Pronto quando:** o preço calculado inclui a reserva, orçamentos fechados não mudam e os testes de pricing passam.
- **Depende do Guilherme:** percentual padrão (sugestão: 3% a 5%).

### [ ] R2-5 · Margem mínima por tipo de obra

- **O que fazer:** margem mínima e desejada por tipo de obra (banheiro, cozinha, apartamento completo, casa, comercial), aplicada como padrão ao criar o orçamento.
- **Onde:** migração (`pricing_settings` por tipo), Configurações, criação de orçamento.
- **Depende do Guilherme:** tabela de margens por tipo.

### [ ] R2-6 · Preço de material desatualizado

- **O que fazer:** mostrar no catálogo a data da última atualização de preço e avisar no orçamento quando um material passar de 60 dias (configurável).
- **Onde:** `materiais.tsx`, `items-editor.tsx`, `pricing_settings`.
- **Pronto quando:** material antigo aparece com aviso no item do orçamento.

### [ ] R2-7 · Custo e preço por m²

- **O que fazer:** no orçamento, preço e custo por m² da área informada e a média das obras do mesmo tipo.
- **Onde:** `src/lib/pricing.ts` (helper puro), painel de preços.

---

## Fase 3 — Aprender com as obras e automatizar cobrança

### [ ] R3-1 · Orçado × realizado nas obras encerradas

- **O que fazer:** ao finalizar a obra, relatório de margem orçada × realizada por etapa e por serviço; média por tipo de obra, sugerindo ajuste de estrutura e margem.
- **Onde:** `src/lib/work-composition.ts`/`pricing.ts` (sem duplicar fórmulas), aba da obra, Análises do Financeiro.

### [ ] R3-2 · Mão de obra cadastrada × paga

- **O que fazer:** comparar o custo de MO do catálogo com o pago às equipes por serviço (saídas com etapa/serviço), sugerindo atualizar o catálogo.

### [ ] R3-3 · Medição ligada às etapas

- **O que fazer:** cada parcela do orçamento pode apontar as etapas que a liberam ("ao concluir as etapas 1 a 4"); quando elas chegam a 100%, a parcela fica "pronta para cobrar" com alerta no Painel e atalho para gerar a cobrança.
- **Onde:** `payment_terms` (vínculo com etapas), `work_stages`, Painel ("Atenção").

### [ ] R3-4 · Resultado consolidado da empresa

- **O que fazer:** soma das margens das obras − custos fixos reais da JMG (estrutura), para conferir se os 12,5% de estrutura cobrem o custo fixo.
- **Onde:** Análises do Financeiro (categoria de despesa fixa).

---

## Fase 4 — Cliente e envio de documentos

### [ ] R4-1 · Enviar recibo, orçamento e contrato por e-mail/WhatsApp

- **Depende de:** R1-1 (e-mail). WhatsApp: link "wa.me" com mensagem e link do PDF, ou API oficial.

### [ ] R4-2 · Assinatura eletrônica do contrato

- **O que fazer:** integrar com Clicksign, D4Sign ou ZapSign; o contrato assinado volta sozinho como "Contrato assinado" com o documento guardado.
- **Depende do Guilherme:** escolher o serviço e criar a conta (API).

### [ ] R4-3 · Aditivo aprovado pelo cliente

- **O que fazer:** link para o cliente aprovar o aditivo; ao aprovar, gera a conta a receber.

### [ ] R4-4 · Portal do cliente

- **O que fazer:** link só de leitura por obra com cronograma, fotos do diário, pagamentos e recibos.

### [ ] R4-5 · Compras com cotação

- **O que fazer:** comparar 2–3 cotações por pedido; aviso de material do cliente perto do prazo.

---

## Fase 5 — Qualidade contínua

### [ ] R5-1 · Testes de ponta a ponta no CI

- **O que fazer:** Playwright cobrindo orçamento → aprovação → obra → contrato → recebimento → recibo, rodando no CI com o stack local.

### [ ] R5-2 · Resumo diário por e-mail

- **O que fazer:** e-mail diário com os itens do "Atenção", contratos aguardando assinatura e vencimentos do dia.
- **Depende de:** R1-1.

### [ ] R5-3 · Curva S físico-financeira

- **O que fazer:** por obra, avanço físico × financeiro × custo ao longo do tempo, usando o histórico de `work_history` e as baixas.
