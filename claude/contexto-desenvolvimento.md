# Contexto de desenvolvimento

Registro das tasks feitas pelo Claude neste repositório. Regras gerais do projeto ficam em `AGENTS.md`.

## Tasks concluídas

### 2026-11-01 — Planejamento e Pendências (branch `claude/hopeful-mccarthy-0fob9w`)

**Pedido:** no menu Execução, depois de Cronogramas, um item Planejamento para planejar as obras por semana e por dia (tarefas urgentes e tarefas que precisam terminar para liberar outras) e um item Pendências. Decisões do Guilherme: a equipe vê os dois e marca tarefas; PDF para mandar às equipes (semana, obra, responsável); concluir tarefa não mexe no avanço (o cronograma continua por etapa); responsável do Cadastros ou nome livre; pendências automáticas junto; semana de segunda a domingo.

**Decisões:**

- Migração `20261101000040`: `work_tasks`, `work_task_dependencies` e `work_issues` com RLS operacional (admin/financeiro/equipe), auditoria em work_history e triggers: dependência só na mesma obra e sem ciclo; tarefa só conclui com as anteriores concluídas/canceladas e sem pendência aberta que a trave; quem concluiu/resolveu e quando vêm do banco.
- Regras puras e testadas em `src/lib/planning.ts`; consulta única `planningOptions`.
- Telas `/planejamento` (Semana com arrastar entre dias e Dia com "Feito", "Passar para hoje", sequência da obra e lista de espera), `/pendencias` (filtros por obra, quem resolve e pessoa; Resolver com observação; automáticas com "Ver origem") e `/planejamento/pdf` (folha da semana para a equipe).
- Menu: Planejamento e Pendências depois de Cronogramas; no celular da equipe as abas viram Painel, Obras, Planejamento e Pendências.

**Conferência:** testes de banco (PGlite), unitários (planning.test.ts), tipos, lint e build; telas conferidas no navegador com dados de exemplo.

### 2026-11-01 — Contas da empresa: conta obrigatória, recibo e contrato (branch `claude/hopeful-mccarthy-0fob9w`)

**Pedido:** o Guilherme pediu um card no Financeiro para cadastrar as contas da empresa, escolher a conta em toda entrada e saída e, ao gerar o contrato, um card para escolher qual conta vai no contrato. Decisões dele: conta obrigatória em todo lançamento novo; os antigos podem ter a conta editada para acertar o saldo; o recibo sai com a conta em que o dinheiro entrou; o PDF do orçamento não leva conta; admin e financeiro cadastram contas.

**Decisões:**

- Migração `20261101000039`: `financial_accounts` ganha tipo (corrente/poupança/caixa), banco, agência, conta, titular, CPF/CNPJ, tipo e chave PIX e `is_contract_default` (no máximo uma; marcar outra desmarca a anterior). Trigger `guard_financial_account` limpa dados bancários do caixa e exige banco+conta ou PIX na conta padrão. A conta C6 que estava fixa no código é completada (conta com "C6" no nome) ou criada quando não há nenhuma conta, e vira a padrão.
- Conta obrigatória: trigger `settlements_require_account` (só INSERT, então baixas antigas sem conta continuam válidas) e `register_cash_movement` recusam movimentação sem conta ou com conta inativa. Correção da conta de baixas já lançadas por `set_settlement_account` (só muda a conta; histórico em `settlement_account_changes`).
- `src/lib/bank-accounts.ts` (puro, compartilhado com a API): quadro do contrato (`contractBankRows`), bloco "Recebido em" do recibo (`receiptBankRows`), conta padrão (`defaultContractAccount`) e `COMPANY_ACCOUNT` (o C6 antigo, usado quando a baixa não tem conta ou o contrato é gerado sem escolher).
- Financeiro: card "Contas da empresa" (`components/finance/company-accounts.tsx`) com saldo por conta, nova/editar/desativar (só com saldo zerado), contas inativas e aviso "N movimentações sem conta · ajustar" (filtra o caixa por "Sem conta"). Nos lançamentos a conta é um seletor obrigatório com o saldo de cada conta; cada movimentação do caixa e cada baixa tem o seletor "Conta: …" para corrigir. Filtro "Conta" no caixa.
- Contrato: `/orcamentos/$id/pdf?doc=contrato` abre o card "Qual conta vai no contrato?" (`components/finance/contract-account-picker.tsx`) antes de gerar; a conta vai como `account_id` no corpo de `POST /v1/orcamentos/:id/contrato` e em `register_generated_contract(..., _account_id)`, que grava `contracts.bank_account_id` e a cópia `bank_account` (editar a conta depois não muda contrato gerado).
- Recibo: `receiptInput` lê a conta da baixa e `buildReceipt` monta "Recebido em" com ela.

**Conferência:** testes de banco (PGlite), unitários, API, tipos e lint passando; telas conferidas no navegador com dados de exemplo (sem Docker nesta sessão, então sem PDF real gerado).

### 2026-10-30 — Recibo de pagamento das entradas (branch `claude/eager-hopper-auxpdq`)

**Pedido:** o Guilherme mandou `Recibo-JMG-modelo` e pediu que toda entrada da obra gere um recibo em PDF para o cliente, pelo caixa/fluxo de caixa. (Na conversa anterior o recibo só tinha sido proposto, não construído.)

**Decisões:**

- `buildReceipt` (puro, testado com os valores do modelo) monta número, valor por extenso, parcela (nome sem o "· obra", % e "quando" do `payment_terms` do orçamento) e a situação financeira do contrato até a data do pagamento. Entrada avulsa do caixa não entra no valor do contrato.
- API `POST /v1/recebimentos/:id/recibo` (admin/financeiro, RLS do usuário) gera o PDF no visual do orçamento; titular, banco, agência/conta e ID da transação são opcionais no corpo e não são gravados.
- App: página `/recibos/$id` (gera, atualiza com os dados opcionais e baixa); botão "Recibo" no caixa e nas baixas das contas a receber; ao registrar recebimento ou entrada da obra, o aviso traz "Gerar recibo".

**Conferência:** recibo da entrada já recebida e de uma entrada nova pelo caixa gerados no app local com a API; PDF comparado com o modelo.

### 2026-10-30 — Contratos gerados entram no menu Contratos (branch `claude/eager-hopper-auxpdq`)

**Problema:** o Guilherme gerou o contrato da obra da Caroline e o menu Contratos continuou vazio. O PDF do modelo oficial era só gerado pela API e mostrado na tela; nada era gravado em `contracts`, que é o que o menu lista.

**Decisões:**

- Migração `20261030000036`: `contracts` ganha `budget_id`, `code` (CT-…), `generated_path` e `generated_at`; situações viram `aguardando_revisao` / `aguardando_assinatura` / `assinado` (rascunho e gerado migrados); `guard_contract` aceita o PDF gerado no lugar do texto.
- Ao gerar o contrato em `/orcamentos/$id/pdf?doc=contrato`, o PDF vai para `jmg-documents/contracts/generated/` e a RPC `register_generated_contract` cria/atualiza o contrato da obra (novo = aguardando assinatura; existente mantém a situação; assinado não muda). Sem obra convertida, a tela avisa para gerar de novo depois da conversão.
- `ContractActions` (situação, PDF gerado, enviar contrato assinado com data) no menu Contratos e na aba Contrato da obra.

**Conferência:** orçamento aprovado de teste ligado à obra: contrato gerado aparece em Contratos, situação alterada e assinatura registrada com o documento.

### 2026-10-30 — Painel de cronogramas: lista e página do cronograma (branch `claude/eager-hopper-auxpdq`)

**Pedido:** o Guilherme mandou dois mockups: a lista de Cronogramas em painel (indicadores, filtros por situação, card com linha do tempo) e a página do cronograma da obra (cabeçalho com indicadores, grade semanal previsto × executado, marcos de pagamento, materiais do cliente, revisões e "Lançar avanço").

**Decisões:**

- Contas puras em `src/lib/schedule-dashboard.ts` (+ testes): avanço previsto para hoje linear pelas datas e ponderado pelo peso das etapas (sem pesos, iguais); realizado = `physicalProgress`; diferença em p.p.; etapas atrasadas (término vencido e < 100%); próximo pagamento/soma dos próximos 30 dias e situação do marco (pago/vencido/previsto); situação na lista (elaboração/execução/atrasado/concluído, ignorando etapas sem datas); `shiftStageDates` desloca as etapas que começam depois do término antigo; `progressHistory` lê as mudanças de avanço do `work_history`.
- Lista (`schedule-list.tsx` + `mini-timeline.tsx`): KPIs (ativos, em execução, etapas atrasadas, próximas medições só para admin/financeiro), busca, cliente, obra, situação e período; card com Rev., linha do tempo, previsto × realizado e próximo pagamento; sem etapas oferece "Importar do orçamento". Pagamentos de todas as obras por `schedulesFinanceOptions` (contas a receber).
- Página do cronograma vinculado (`schedule-dashboard.tsx`, em `/cronogramas/$id`): grade de 10 semanas por período, as mesmas folhas do PDF (`buildScheduleSheets`), com linha HOJE, barras vermelhas nas atrasadas, losangos dos pagamentos e pontos dos materiais; abas Avanço físico, Pagamentos, Materiais do cliente e Revisões. Datas de várias etapas de uma vez vão pela RPC `shift_work_stages` (migração `20261030000035`), que grava tudo e registra UMA revisão; avanço de etapa com serviços continua vindo dos serviços. Cronograma avulso segue no editor de folhas.

**Conferência:** obra de teste em execução no app local: indicadores, grade, lançamento de avanço salvo e histórico; RPC conferida no banco com o usuário de teste (datas deslocadas, uma revisão).

### 2026-10-30 — Cronograma físico-financeiro no novo modelo (branch `claude/eager-hopper-auxpdq`)

**Pedido:** o Guilherme mandou o modelo `Cronograma-JMG-obra-longa_28_semanas_3_folhas` (A4 deitado, 10 semanas por folha, semanas que sobram em cinza) para o PDF do cronograma das obras e para a aba Cronograma da plataforma; pagamentos vêm das contas a receber e materiais do cliente de uma aba nova de lançamento.

**Decisões:**

- `buildScheduleSheets` (puro, testado com as datas do modelo) monta as folhas: semanas a partir da segunda-feira do início, meses do cabeçalho (≥3 semanas "Janeiro de 2027", 2 "Mar/27", 1 "Mai"), barra por semanas inteiras com continuação à esquerda/direita, "concluída na Sx"/"inicia na Sx", marcos de pagamento (% sobre o total das entradas) e materiais por período.
- `ScheduleSheets`/`ScaledSheets` desenham as folhas iguais na tela e na impressão (`@page cronograma` A4 deitado; `body:has(.cr-doc)` na mesma página nomeada para não sobrar folha em branco). Dados da obra em `useWorkSheetProps`: etapas com datas, contas a receber (`scheduleFinanceOptions`, sem caixa avulso), materiais, cliente, códigos CT/ORC do orçamento vinculado e "Rev." pela versão do cronograma.
- Tabela `work_client_materials` (migração `20261030000033`): etapa da mesma obra, descrição, data limite, entregue; acesso de admin/financeiro/equipe e auditoria em `work_history`. Aba "Materiais do cliente" dentro da aba Cronograma da obra.
- Aba Cronograma: o Gantt antigo do planejamento deu lugar às folhas (clicar na etapa continua abrindo a edição); a comparação original × atual segue na tabela abaixo. Cronograma avulso usa as mesmas folhas, sem financeiro/materiais.

- Datas do orçamento nas etapas (migração `20261030000034`): `budget_section_dates` calcula início/fim de cada etapa a partir do início e das semanas do cronograma do orçamento; o gatilho `work_stages_budget_dates` preenche etapas sem data ao converter/sincronizar, e a migração preenche as obras existentes (e o início/término da obra quando vazios). Datas já ajustadas não mudam.
- Menu Cronogramas: botão "PDF" em cada linha; cronograma vinculado abre só as folhas (edição na aba da obra) e o "Gerar PDF" leva ao PDF da obra; avulso troca o Gantt pelas folhas.

**Conferência:** obra de teste com as 14 etapas, 7 entradas e 4 materiais do modelo, criada pelas RPCs/RLS do app: PDF em 3 folhas comparado com o modelo; avulso de 15 semanas em 2 folhas; aba conferida no desktop e no celular.

### 2026-10-30 — Novo modelo de contrato (branch `claude/eager-hopper-auxpdq`)

**Pedido:** o Guilherme mandou o novo modelo de contrato (`Contrato-JMG-modelo`, página contínua) para substituir o atual; os campos (datas, valores, parcelas, prazo) continuam vindo do orçamento aprovado.

**Decisões:**

- Texto: migração `20261030000032_contract_model_2026.sql` troca as cláusulas de `contract_clauses` pelas 13 do modelo (substitui também edições feitas em Configurações → Contrato). Marcadores novos: `{{OBJETO}}` (título + descrição do orçamento), `{{AREA}}`, `{{DATA_ORCAMENTO}}` (`budgets.issue_date`), `{{MAO_DE_OBRA}}`, `{{MATERIAIS}}`; `{{ORCAMENTO}}` vira "Orçamento nº ORC-…", `{{VALOR}}` deixa só o valor em negrito e `{{PRAZO}}` sai "8 semanas".
- `renderClauses`: número do parágrafo separado (destaque em azul), incisos romanos, itens "- " e `**negrito**`.
- `contract-html.ts` no visual do modelo: capa baixa (sem cartões) com "Instrumento particular" e código `CT-`, partes + barra de resumo, cláusulas com divisórias, parcelas no estilo do orçamento com faixa de total, dados bancários, anexos, assinaturas e testemunhas. No paginado só as partes começam folha nova.
- Corrigido junto: fio dourado/branco na lateral e no pé da página contínua (o PDF arredonda a página para cima): o conteúdo passa 2 px da lateral, a faixa final fica fixa no pé (`render.ts` reserva o espaço) e a altura vai em múltiplos de 8 px.

**Conferência:** contrato de exemplo (cláusulas lidas da migração) comparado com o modelo; paginado em 8 folhas; teste garante que as cláusulas da migração só usam marcadores conhecidos; bordas conferidas a 72 e 300 dpi sem fio.

### 2026-10-30 — Escolha entre PDF contínuo e com quebra de página (branch `claude/eager-hopper-auxpdq`)

**Pedido:** poder gerar orçamento e contrato tanto em página contínua quanto com quebra de página.

**Decisões:**

- `PdfLayout` (`"continuo"` padrão, `"paginado"`) e `pdfLayout` em `src/lib/proposal.ts`, compartilhados por API e app. A API lê `?layout=paginado` em `/pdf` e `/contrato`; valor desconhecido cai no contínuo.
- Mesmo HTML nos dois formatos: `html.paged` troca as regras (`@page` A4 com margens, capa de folha inteira, cada seção em folha nova, sem divisórias nem faixa final, `break-inside: avoid` nos blocos) e o `render.ts` volta a carimbar cabeçalho/rodapé com pdf-lib em todas as páginas menos a capa.
- Tela `/orcamentos/$id/pdf`: botões "Página contínua" / "Com quebra de página" (fica em `?layout=` na URL). "Salvar versão" continua gerando o contínuo.
- Corrigido junto: fio branco na borda direita da capa/faixa (página em 794 px, conteúdo 100%) e folga do pé da página pintada com as cores da faixa.

**Conferência:** exemplos gerados nos dois formatos (orçamento 1 página contínua / 9 folhas A4; contrato 1 / 3); teste de API cobre o parâmetro; troca de formato conferida no app local (a URL e a chamada à API mudam).

### 2026-10-30 — PDFs em página única contínua (branch `claude/eager-hopper-auxpdq`)

**Pedido:** o Guilherme mandou um novo modelo de orçamento (`Orcamento-JMG-modelo-continuo`, uma página A4 de largura que cresce com o conteúdo) e quer que orçamento, contrato e cronograma saiam assim, substituindo o modelo paginado, inclusive para os orçamentos já cadastrados.

**Decisões:**

- `api/src/pdf/render.ts`: `htmlToPdf(html, title)` mede a altura do documento no Chromium (mídia de impressão, 794 px = 210 mm) e gera uma página só com essa altura; pdf-lib confere que saiu uma página e grava o título. Saiu o carimbo de cabeçalho/rodapé por página: a faixa da empresa (`footerHtml`) fecha o documento.
- `layout.ts`/`proposal-html.ts` seguem o modelo: capa de 264,6 mm, seções separadas por divisórias, "Como trabalhamos", "Sobre esta obra" dentro de Etapas e serviços, caixas de total (serviços = mão de obra total; materiais) no topo das seções, observações numeradas, cronograma com "ETAPA" no cabeçalho e aviso em texto simples (`SCHEDULE_DISCLAIMER` com o texto do modelo). Números de "Quem somos" do modelo (+35 anos, 100% de satisfação). Observações padrão (`DEFAULT_NOTES`) não mudaram: as do modelo eram do orçamento de exemplo.
- Contrato da API no mesmo formato contínuo. Os PDFs são gerados na hora, então todo orçamento existente já sai no modelo novo; versões salvas (`budget_versions`) continuam como foram geradas (imutáveis).
- Cronogramas (obra e avulso) e contrato da obra, impressos pelo navegador: `printContinuous` (`src/lib/continuous-print.ts`) mede `.print-root` com as regras de impressão (`html.print-measure` em `styles.css`) e define `@page { size: 210mm <altura> }` antes de `window.print()`. Safari ignora `@page size` e segue em folhas A4.

**Conferência:** `sample.ts` gera orçamento e contrato numa página (comparados com o modelo lado a lado); serviço real (`createPdfService`) com orçamento mínimo também em uma página; impressão do cronograma avulso simulada no Chromium com o app local (14 etapas) saiu em uma página de 730 mm sem sobra.

### 2026-10-28 — Levar os dados locais para a produção (branch `claude/nifty-dijkstra-i0rmcy`)

**Pedido:** o Guilherme quer copiar o que já cadastrou no banco local para a produção, sem cadastrar tudo de novo.

**Decisões:**

- `scripts/export-data.sh` (no computador, stack local no ar): `pg_dump --data-only` de `public.*`, `auth.users`, `auth.identities`, `auth.mfa_factors`, `storage.buckets` e `storage.objects`, mais o volume do Storage e a última migração (`jmg-export/`, no `.gitignore`).
- `infra/vps/import-data.sh` (na VPS): recusa se a versão de migração do arquivo for diferente da produção, pede `SUBSTITUIR`, roda `backup.sh`, para web/api, faz `truncate … cascade` dessas tabelas e aplica o dump com `--disable-triggers` numa transação só (as travas de orçamento aprovado e a auditoria não disparam na cópia), troca os arquivos do Storage e religa tudo. Usuários mantêm senha, papéis e 2FA.
- Corrigido junto: o Storage guarda tipo/etag de cada arquivo em atributos estendidos e o tar do Alpine não os copia (arquivo restaurado respondia 500). `backup.sh`, exportação e importação usam GNU tar (`debian:12-slim`) com `--xattrs`.
- Os `docker compose exec` do import leem `/dev/null`: sem isso o exec consumia a entrada do terminal e a confirmação digitada.

**Conferência:** simulado com duas stacks (local com usuário, papel, carga de materiais e foto; produção nova com outras chaves e outro admin): após a importação o usuário local entra com a senha local, o admin antigo some, 11 materiais e a foto voltam (200, `image/png`); antes da correção do tar a foto respondia 500.

### 2026-10-28 — Deploy automático na VPS da Hostinger (branch `claude/nifty-dijkstra-i0rmcy`, sobre `feat/fundacao-tecnica`)

**Pedido:** o Guilherme assinou uma VPS KVM 2 na Hostinger e quer deploy automático pelo GitHub Actions, com o sistema num subdomínio (`app.jmgreformas.com.br`), deixando o domínio principal para o site institucional, e o passo a passo para configurar a VPS.

**Decisões:**

- O CI (`.github/workflows/ci.yml`, agora "CI/CD") continua verificando PRs sem publicar nada; no merge na `main` (ou "Run workflow") publica `web`, `api` e `migrate` no GHCR com a tag do commit e o job "Deploy na VPS" entra por SSH como `deploy`. O deploy é no merge, não ao abrir o PR, para código ainda em revisão não ir para produção.
- `infra/docker-compose.yml`: `web`, `api` e `migrate` ganharam `image: ${IMAGE_REGISTRY}/<serviço>:${IMAGE_TAG}`; localmente continuam sendo construídos (`jmg-obras/*:local`), na VPS só são baixados (`--no-build`).
- O `infra/.env` da VPS é escrito pelo workflow a cada deploy a partir das variáveis/segredos do repositório (fonte única; a VPS pode ser refeita do zero). Produção sai com cadastro fechado (`DISABLE_SIGNUP=true`, `SIGNUP_ENABLED=false`) e sem autoconfirmação de e-mail. As `VITE_*` da imagem `web` usam `API_DOMAIN` e `ANON_KEY` do GitHub.
- O login no GHCR da VPS usa o `GITHUB_TOKEN` do próprio job (com logout no final); não é preciso token pessoal.
- `infra/vps/`: `setup.sh` (Ubuntu 24.04 nova: Docker oficial, usuário deploy, ufw 22/80/443, fail2ban, atualizações automáticas, swap de 2 GB, cron de backup), `deploy.sh` (pull, up com migrações, logs se falhar, limpeza), `backup.sh` (pg_dump como `supabase_admin` + tar do volume do Storage, 14 dias) e `create-admin.sh` (primeiro admin pela API admin do Auth + papel em `user_roles`).
- Guia em `docs/deploy-vps.md`; `infra/README.md` aponta para ele.

**Conferência:** lint, typecheck, formatação, 198 testes do app, testes do banco e da API passando; `docker compose --profile prod config` validado com o `.env` gerado pelo próprio passo do workflow (inclusive senha SMTP com `#` e espaço). Não verificado aqui: build das imagens e execução de `deploy.sh`/`backup.sh`/`create-admin.sh` contra a stack, porque o Docker Hub limitou os downloads nesta sandbox. O build das imagens roda no CI do PR.

**Primeiro deploy (correção):** o `migrate` falhou na VPS em `20261016000001` (`storage.objects.owner_id` não existe): esperava só a tabela `storage.objects`, que o Storage cria antes das próprias migrações terminarem. `scripts/migrate.mjs` agora espera `GET auth:9999/health` e `storage:5000/status` (os serviços só respondem depois de migrar). Reproduzido localmente com as imagens do Supabase (falha com o script antigo, 36 migrações aplicadas com o novo); `create-admin.sh` (conta criada, papel admin, login 200) e `backup.sh` testados na mesma stack.

**Segundo deploy:** migrações todas aplicadas, mas a `api` reiniciava sem parar (`Cannot find module /app/src/lib/contract-clauses.ts`): o `Dockerfile` copiava uma lista fixa de módulos de `src/lib` e o das cláusulas nunca entrou. Agora copia a pasta inteira, e o CI liga a imagem da api e espera o `/health` (503 sem banco) antes de publicar; a publicação da api virou `docker push` depois desse teste. O Caddy não subiu porque o Traefik do Docker Manager da Hostinger (projeto `traefik-4ylg`) ocupava as portas 80/443.

### 2026-10-28 — Olhinho para ocultar valores no Painel e no Financeiro (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme quer um ícone de olho no Painel e no Financeiro para esconder os valores (ex.: com alguém olhando a tela) e mostrar de novo.

**Decisões:** `src/lib/hidden-values.ts` guarda a escolha neste aparelho (localStorage, com try/catch) e oferece `useValuesHidden`/`useBRL`; `src/components/hidden-values.tsx` tem `HideValuesScope` (liga a ocultação só no conteúdo do Painel e do Financeiro) e `HideValuesToggle` (olho aberto/fechado no topo das duas telas). `Money` mostra "R$ •••••" quando oculto; os valores escritos com `fmtBRL` no Painel, Fluxo de Caixa, Recebimentos e Análises usam `useBRL` (gráficos escondem eixo e dica). Fora dessas telas, e nos formulários de lançamento, os valores aparecem sempre. Só aparência: nenhum cálculo mudou.

**Conferência:** navegador: ocultar no Painel, Financeiro abre já oculto, mostrar de novo; checagens passando.

### 2026-10-28 — Menos branco: fundo azulado e faixa de topo nas páginas (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme achou o fundo das páginas claro/branco demais e pediu levar a paleta para todo o contexto (Serviços, Orçamentos etc.), não só o menu.

**Decisões:** tokens claros em `src/styles.css` com o azul da paleta (`--background`, `--muted`, `--secondary`, `--accent`, `--border`, `--input`, `--neutral-soft`, `--primary-soft`, sombra dos cards); cards continuam brancos e se destacam. Novo `PageBand` em `page-header.tsx`: faixa azul → azul-marinho com detalhe dourado (a marca d'água da logo foi retirada a pedido do Guilherme), usada por todo `PageHeader` (todas as páginas de lista e a da obra) e pelo cabeçalho do orçamento; dentro dela a ação principal fica dourada, as secundárias claras e textos/links ajustados ao fundo escuro.

**Conferência:** Serviços, orçamento (rascunho de teste criado e excluído), obra e lista de orçamentos no celular; checagens passando.

### 2026-10-28 — Orçamentos em aberto passam para a precificação nova (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme abriu o orçamento nº 9 e viu as porcentagens antigas (acréscimos, reserva). Ele foi criado antes da precificação nova, que só valia para orçamentos novos.

**Decisões:** migração `20261028000031_open_budgets_direct_cost.sql` passa todo orçamento em elaboração/enviado (fora da lixeira) para `model = "custo_direto"` com os percentuais das Configurações (RT ligada só com arquiteto), registrando em `budget_history`; trigger `budget_direct_cost_default` faz revisões e cópias de orçamentos antigos (copy_budget) já nascerem no modelo novo. Aprovados, recusados e substituídos mantêm o cálculo com que foram fechados.

**Conferência:** nº 9 abriu com a Formação de preço nova (custo R$ 5.207,00 → R$ 8.072,87, sem RT por não ter arquiteto); cópia testada em transação desfeita; checagens passando.

### 2026-10-28 — Orçamento editável até a aprovação e versões salvas com PDF (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme não conseguia abrir o orçamento para editar. Quer editar livremente até aprovar; cada vez que salvar, guardar o PDF como versão; ao aprovar, a última versão salva fica como a aprovada (ex.: "3 versões até a aprovação").

**Decisões:**

- Lista de orçamentos: o card inteiro abre o orçamento (antes só o número era link — regressão do visual novo). A trava já era a combinada: editável em elaboração/enviado, só consulta depois de aprovado (revisões por "Reabrir para edição").
- Tabela `budget_versions` (migração `20261028000030_budget_versions.sql`): número sequencial, PDF no bucket privado (`budget-versions/<orçamento>/`), total, impressão digital do conteúdo, autor e data definidos pelo banco; só admin/financeiro; não aceita versão nova em orçamento fechado; trigger marca a última versão como aprovada quando o status vira aprovado.
- Botão "Salvar versão" no orçamento (fica desabilitado quando nada mudou desde a última versão ou há pendência para o PDF); "Gerar PDF" virou só pré-visualização. Lista "Versões salvas" com data, hora, quem salvou, valor, botão do PDF e selo "Aprovada", e aviso quando há alterações ainda não salvas.
- "Registrar aprovação" salva antes uma versão nova se o conteúdo mudou (`beforeApprove` no `Approval`), para o PDF aprovado ser exatamente o que foi aprovado.
- Impressão digital em `src/lib/budget-versions.ts` (+ testes): ignora situação, aprovação e datas de edição; muda com itens, etapas, preço e condições.

**Conferência:** migração aplicada; no navegador, numa cópia do orçamento nº 9, versão 1 salva, alteração detectada, versão 2 salva; aprovação testada no banco (versão 2 marcada, versão nova recusada depois) em transação desfeita; cópia excluída. lint, typecheck e 198 testes passando.

### 2026-10-28 — Precificação pelo custo direto, negociação e orçado × realizado (branch `feat/fundacao-tecnica`)

**Pedido:** documento do Guilherme "Precificação no módulo de Orçamentos": preço formado só pelo custo direto e 4 percentuais (estrutura 12,5%, RT 10% com chave Sim/Não, impostos 8%, margem 15%), preço sugerido na centena, abertura interna, negociação com margem real, alertas, simulador, padrões nas Configurações, PDF com o preço final e orçado × realizado na obra.

**Decisões:**

- `src/lib/pricing.ts` é a função única (usada pela tela, pelo PDF da API via `proposal.ts`/`clientPriceSheet` e pela obra). `computeBudget` escolhe o modelo por `params.model`: sem `model` = cálculo antigo (orçamentos existentes não mudam de valor); `"custo_direto"` = novo. Preço = custo direto ÷ [1 − soma dos %]; preço final = `negotiated_price` ou o calculado; estrutura, RT e impostos são % do preço final e o lucro é a sobra (bate centavo a centavo: 12.000 → 22.018,35; 2.752,29 / 2.201,83 / 1.761,47 / 3.302,76; negociado 20.000 → lucro 1.900, 9,5%). Erro quando os % somam 100%+.
- Materiais vão ao cliente a custo (sem acréscimo); a mão de obra do PDF é preço final − materiais. Desconto da negociação sai do lucro.
- `pricing_settings` ganhou `structure_rate` e `tax_rate` (migração `20261028000020_pricing_direct_cost.sql`); RT padrão = `architect_commission`, margem-alvo = `desired_margin`, mínima = `min_margin`. Valores ajustados para 10/15/10. Configurações > Precificação mostra só os 5 percentuais com um exemplo de R$ 12.000; os campos antigos (acréscimos, reserva, tributos por base) saíram da tela.
- Orçamento novo copia os padrões em `params` (com `model: "custo_direto"`); RT nasce ligada quando há arquiteto.
- Painel do orçamento (`pricing-panel.tsx`): custo direto por etapa, Formação de preço (4 % + chave de RT, preço calculado, sugerido com "Usar sugerido", abertura), Negociação (preço proposto, desconto R$ e %, lucro, margem inicial → após negociação com selo saudável/atenção/alerta/prejuízo; abaixo da mínima pede "Confirmar mesmo assim"), Simulador 5–20%. Orçamentos antigos mantêm o painel anterior. No editor de itens, acréscimos e desconto por item só aparecem no modelo antigo.
- Custo estrutural entra no custo econômico da obra (`computeWorkResult`).
- Obra, Visão Geral: "Orçado × realizado" (`budget-vs-actual.tsx`) com valor contratado, custo direto orçado/realizado, diferença e tabela por etapa (orçado = `stageCosts`, realizado = saídas pagas da etapa, mais linha "Sem etapa vinculada"); helpers `costVariance`/`unassignedStageSpent` em operations.ts.

**Conferência:** testes com todos os exemplos do documento (pricing.test.ts) e do orçado × realizado; lint, typecheck e 194 testes passando. Navegador: orçamento de teste com custo de R$ 12.000 (preço, abertura, negociação a R$ 20.000 com aviso e confirmação, simulador) e a obra de teste; o orçamento de teste foi excluído depois.

**Observação:** esta sessão e a do novo PDF trabalham no mesmo checkout; parte das mudanças de `types.ts` e `configuracoes.tsx` entrou no commit `eb1e942` daquela sessão.

### 2026-10-28 — Cláusulas do contrato configuráveis (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme mandou o contrato antigo (`CONTRATO.ELIANA.pdf`) para aproveitar todas as cláusulas e quer poder configurar as cláusulas no sistema. Também relatou que o PDF do orçamento ainda saía no modelo antigo.

**Decisões:**

- PDF do orçamento: o botão "Gerar PDF" e a rota `/orcamentos/$id/pdf` já usavam a API desde o commit `eb1e942`; o teste dele foi antes disso ou numa aba aberta antes. A página ganhou "Abrir em nova aba" para quando o navegador não mostrar o PDF dentro da página.
- Tabela `contract_clauses` (migração `20261028000021_contract_clauses.sql`) com título, texto, ordem e ativa; RLS: admin edita, admin/financeiro leem. Carregada com as 10 cláusulas do contrato da Eliana (texto jurídico mantido, com os ajustes já combinados em 4.1, 5.3 e 7.2). O número da cláusula é `{{N}}`, então reordenar renumera tudo.
- `src/lib/contract-clauses.ts` (puro, API e tela): troca marcadores, escapa o texto e recua subitens ("5.1.1." e incisos romanos); `unknownTokens` avisa marcador desconhecido.
- API: o contrato lê as cláusulas ativas na ordem; sem cláusulas, devolve 422 pedindo para cadastrar.
- Configurações → aba "Contrato": editar título e texto, ligar/desligar, subir/descer, incluir e remover, com a lista de marcadores. Editar só afeta contratos gerados depois.

**Conferência:** testes do app e da API, lint, formatação e typecheck passando. Contrato gerado com as cláusulas do banco igual ao anterior. Navegador: aba Contrato, reordenar (e voltar), editar e salvar título (conferido no banco e revertido).

### 2026-10-28 — Modelo oficial de orçamento e contrato em PDF (branch `feat/fundacao-tecnica`)

**Pedido:** integrar o novo modelo oficial de orçamento da JMG Reformas (PDF aprovado `Orcamento-JMG-modelo.pdf`) para todo orçamento gerar esse PDF automaticamente, e gerar o contrato no mesmo visual a partir do orçamento aprovado. O zip com o código do modelo não veio; o Guilherme mandou seguir refazendo a partir do PDF aprovado. Contrato antigo escolhido como base: `CONTRATO.ELIANA.pdf`.

**Decisões:**

- Valores no PDF são preço de venda (confirmado com o Guilherme): materiais a preço de venda (fator venda ÷ custo de materiais do item, unitário arredondado e total = unitário × quantidade) e mão de obra só no total (`saleNet − materiais`), para mão de obra + materiais = valor final. Conta pura `clientPriceSheet` em `pricing.ts`; material fornecido pelo cliente não aparece.
- `src/lib/proposal.ts` (puro, usado pela API e pela tela) monta o documento: número `ORC-<ano da criação>-<0000>`, emissão = data de geração, validade = campo ou emissão + 15 dias, responsável = campo ou quem criou (padrão Guilherme Andriola Mendes), imóvel "Apartamento · 78 m²", cronograma por semanas (`stageWeeks`, término = sexta da última semana), parcelas em centavos (`splitPayments` reescrito em centavos, diferença na última) e pendências que bloqueiam o PDF (`proposalIssues`/`contractIssues`). Padrões: parcelas 30/25/25/20 e as 4 observações. Valores e datas por extenso em `extenso.ts` (com vírgula como no modelo: "cinquenta e três mil, duzentos e …").
- Migração `20261028000008_budget_proposal_model.sql`: orçamento ganha responsável, início previsto, prazo em semanas, tipo de imóvel, metragem e descrição; etapas ganham descrição curta, semana de início e duração. `copy_budget` copia tudo (a validade volta a vazio na cópia). A trava de aprovado já cobre os campos novos.
- API: `POST /v1/orcamentos/:id/pdf` e `POST /v1/orcamentos/:id/contrato` (admin/financeiro; leitura como o usuário, com RLS). HTML em `api/src/pdf/` (capa B azul-marinho com a logo como marca d'água, azul #004AAD, dourado #E8A33D, etapas alternando azul forte/claro), Chromium do Playwright e cabeçalho/rodapé/paginação com pdf-lib (capa sem cabeçalho). Inter e logos embutidas. Imagem Docker da API passou para a base `mcr.microsoft.com/playwright:v1.56.1-noble`. `api/src/pdf/sample.ts` gera exemplos sem banco.
- Contrato: cláusulas do contrato da Eliana com o texto mantido; ajustes necessários: referência ao anexo vira "orçamento ORC-… (Anexo 1)", 1.3 lista as etapas, 5.2 usa o início previsto, 5.3 usa o prazo em semanas, 3.4 cita PIX/transferência/boleto e 4.1/7.2 ressalvam os materiais que o orçamento já inclui.
- Tela: aba "Dados e condições" com cliente/obra (título, descrição, imóvel, metragem), prazos (início, semanas, validade, responsável), parcelas com descrição, "quando" e % (aviso vermelho quando não fecha 100%) e observações uma por linha; nova aba "Cronograma" (descrição curta, semana de início e duração por etapa, com barrinha); botões "Gerar PDF" e "Gerar contrato" (só aprovado) com aviso das pendências; `/orcamentos/$id/pdf` mostra o PDF gerado pela API com "Baixar PDF".

**Conferência:** lint, formatação, typecheck, testes do app e da API passando. Navegador: orçamento nº 9 preenchido pela tela (título, imóvel, início, parcelas padrão, aviso de 90%, cronograma com etapa em paralelo) e PDF gerado e exibido; contrato conferido no PDF de exemplo (não há orçamento aprovado no banco local, então a rota do contrato foi testada com teste automatizado e pelo gerador de exemplo). Encontrado e corrigido: data do banco voltando um dia no fuso de São Paulo. Não verificado: build da imagem Docker da API com Playwright.

**Pendências com o Guilherme:** números reais de "Quem somos" (+120 obras, 10 anos e 100% no prazo são do exemplo, em `ABOUT_STATS`), logo em alta resolução (a atual tem 142 px e fica levemente borrada na capa) e conferir os ajustes de texto do contrato (4.1, 7.2 e 5.3).

### 2026-10-28 — Paleta do modelo de orçamento em toda a plataforma (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme quer a plataforma inteira com a mesma paleta do novo modelo de orçamento (azul da marca #004AAD, azul-marinho #112440, dourado #E8A33D), sem mexer no verde/vermelho de entradas e saídas.

**Decisões:**

- `src/styles.css`: `--primary`, `--ring`, `--chart-*`, menu (`--sidebar*`, textos em azul-marinho) e o card de destaque (`--hero` #004AAD → `--hero-end` #112440, como a capa) na paleta; tema escuro com fundo e cards levemente azul-marinho. Novo token `--gold`/`--gold-soft` só para detalhes.
- Alerta (`--alert`) virou o dourado/âmbar da paleta; aditivos (`--extra`) saíram do violeta para o azul-marinho. `--positive`/`--negative` (entradas/saídas) não mudaram.
- Menu: item ativo em pílula azul → azul-marinho com ícone e marcador dourados; grupos Comercial em azul-marinho (`navy`), demais tons de azul mantidos.
- Card de destaque (`KpiCard hero`) com ícone dourado e a logo branca da JMG como marca d'água, como a capa estilo "B".

**Conferência:** lint, formatação e 173 testes passando; navegador em 1440px claro/escuro e 375px claro. O typecheck acusou só `src/lib/work-budget.ts` por causa dos campos novos que a sessão do modelo de orçamento está adicionando em paralelo (não é desta mudança).

### 2026-10-28 — Checklist de conferência por etapa da obra (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme quer, dentro da obra, um checklist por etapa com os serviços listados na etapa, para conferir em obra marcando cada item, e um PDF de cada etapa junto com o cronograma.

**Decisões:**

- Tabela `work_checklist_items` (migração `20261028000007_work_checklist.sql`). Cada serviço da etapa (`work_stage_services`) vira item sozinho pelo trigger `sync_checklist_from_service` (inclusive os serviços criados na conversão do orçamento e na revisão aprovada); a descrição e a etapa seguem o serviço; excluir o serviço exclui o item (cascata). Os serviços que já existiam entraram pela própria migração.
- A tabela guarda só a descrição: a equipe de campo (RLS igual a `work_stages`) confere sem ver valores de custo dos serviços. A equipe pode incluir e remover itens avulsos; itens de serviço não podem ser editados nem removidos à mão (trigger `guard_checklist_item`).
- Quem e quando marcou (`checked_by`/`checked_at`) são gravados pelo banco; há observação por item. Alterações vão para `work_history`.
- Marcar o checklist **não** muda o avanço da etapa nem o financeiro (o avanço continua vindo dos serviços).
- Tela: aba "Checklist" na obra (`src/components/works/checklist.tsx`), um card por etapa com situação, datas do cronograma, barra de conferidos, botão PDF, itens com caixa grande de marcar e campo de observação. Lógica pura em `src/lib/work-checklist.ts` (+ testes).
- PDF: `/obras/$id/checklist/pdf?stage=<id>` (vazio = todas as etapas): cabeçalho JMG, cliente/local, tabela do cronograma com todas as etapas (a escolhida em destaque, com conferidos), lista da etapa com caixas OK, quem conferiu, observação e linhas de assinatura e data. `workClientOptions` foi movido para `work-data.ts` para servir aos dois PDFs.

**Conferência:** migração aplicada no banco local e testada (item nasce do serviço, acompanha o texto, bloqueios, marcação com data, exclusão em cascata, histórico). lint, formatação, typecheck e 173 testes passando. Navegador: aba em desktop claro e 375px escuro, item avulso incluído, marcado, PDF da etapa conferido e item apagado depois. A obra local não tem serviços nas etapas, então o item vindo de serviço só foi testado no banco.

### 2026-10-28 — Menu lateral colorido e saldo em caixa mais compacto (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme pediu um azul suave de volta no menu, mais cores no menu e o card do saldo em caixa do Painel menor, para aproveitar o espaço.

**Decisões:**

- Tokens `--sidebar*` em `src/styles.css`: fundo azul JMG bem claro (claro) e azul escuro (escuro); item ativo em card branco com sombra.
- Menu só em tons de azul (pedido do Guilherme: nada de várias cores misturadas): cada grupo tem um tom (`color` em `nav-config.ts`: azul em Visão geral/Gestão, anil em Comercial, azul-céu em Execução, azul-acinzentado em Catálogo) no quadradinho do ícone (`NAV_CHIP` em `app-sidebar.tsx`); o fundo é um degradê azul suave (`--sidebar` → `--sidebar-end`) e o item ativo é uma pílula azul JMG cheia (mesmo degradê do card de destaque). As cores financeiras (verde/vermelho/laranja) continuam com significado nas telas.
- Painel: o saldo em caixa ocupa duas colunas e uma linha (antes duas linhas), com valor em 32px; resultado previsto e aditivos ocupam duas colunas cada em tela larga.

**Conferência:** lint, formatação, typecheck e 169 testes passando; navegador em 1440px claro e escuro e menu "Mais" em 375px.

### 2026-10-28 — Cards das obras no Painel (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme quer ver todas as obras no Painel, junto do fluxo de caixa, em cards no estilo de uma referência (ObraCash) que ele mandou: faixa colorida com ícone e situação, nome, valores com barra de uso e cliente/local.

**Decisões:**

- Novo `WorkCard` (`src/components/works/work-card.tsx`) com a identidade JMG: a faixa do topo tem a cor da situação (azul em execução, cinza em planejamento, laranja pausada, verde finalizada), selo de situação e avanço físico; valor da obra (`result.sale`) × recebido (`totals.received`) com barra de `balance.financialProgress` e o "a receber" (`balance.receivable`); custo realizado (`incurred`) com barra do consumo do custo previsto (`progressAttention`, "não conferido" em obra direta sem estimativa); cliente e endereço. Nenhuma conta nova: tudo vem de `dashboard-data`/`work-progress`.
- No Painel (`ExecutivePanel`), seção "Obras" abaixo dos indicadores, usando `selectWorks` (respeita os filtros do Painel e o PILOTO), em ordem execução → planejamento → pausada → finalizada; 1 coluna no celular, 2 no tablet e 3 em tela larga. O card inteiro abre a obra.
- `Meter` ganhou `showValue={false}` para mostrar só a barra.

**Conferência:** lint, formatação, typecheck e 169 testes passando; navegador em 375px claro, 1440px claro e 1024px escuro (só uma obra nos dados locais).

### 2026-10-28 — Novo visual levado a todos os módulos (branch `feat/fundacao-tecnica`)

**Pedido:** o Guilherme aprovou o visual do Painel/Fluxo de Caixa e pediu para replicar. Só visual: nenhuma consulta, cálculo, permissão, `name=` ou aria-label mudou; PDFs e impressões do cliente (`*.pdf.tsx`, contrato impresso, Gantt) ficaram iguais.

**Decisões:**

- Peças compartilhadas novas: `Meter` (barra de avanço) e `Notice` (aviso suave) em `src/components/kpi.tsx`; tons das situações em `src/lib/status-badges.ts` (`BUDGET_STATUS_VARIANT`, `WORK_STATUS_VARIANT`, `STAGE_STATUS_VARIANT`, `CONTRACT_STATUS`). Os rótulos de status da obra continuam por tela, porque já eram diferentes antes ("Em planejamento"/"Finalizada" na lista, "Em contratação"/"Concluída" na obra).
- `KpiCard` aceita props opcionais `undefined` (exactOptionalPropertyTypes). Excluir de registro (`ConfirmRecordAction`) usa a variante `danger`; aviso de registro excluído usa `panelClass`.
- Orçamentos: lista em cards com Badge; página com valor de venda em destaque, custo, resultado e margem em KpiCards; editor de itens sem caixas aninhadas; precificação em grupos.
- Obras: lista em cards até `xl` (tabela só em telas largas), resumo da obra em KpiCards com cores de significado (`Metrics` também alimenta Análises do Financeiro), barras de avanço, aditivos/compras/diário/fotos em painéis.
- Contratos e Cronogramas: listas em cards com Badge, etapas em cards com situação, planejamento e versões em blocos suaves.
- Cadastros, Serviços, Materiais, Etapas e Configurações: abas em pílula, listas com ícone por tipo, perfil da pessoa com resumo em KpiCards.
- Financeiro: "Recebimentos e saldos" com abas em pílula e total colorido; "Análises e resultados" com filtros em painel, gráficos em cards (entradas verdes, saídas vermelhas) e rankings coloridos.

**Conferência:** lint, formatação, typecheck e 169 testes passando. Navegador: obras (lista e página), cronogramas, cadastros, serviços e financeiro em desktop e 375px, claro e escuro. Sem dados locais para ver preenchidos: orçamentos, contratos, contas a receber/pagar, aditivos e compras. No painel do app oculto os gráficos do Recharts não animam (as barras aparecem com o navegador visível).

### 2026-10-28 — Novo visual: base do design system, Painel e Fluxo de Caixa (branch `feat/fundacao-tecnica`)

**Pedido:** visual de dashboard profissional (cards mais arredondados, menos linhas, hierarquia clara e cores financeiras com significado), começando só pelo Painel e pelo Financeiro → Caixa e contas, para o Guilherme validar antes dos outros módulos. Só visual: nenhum cálculo, consulta, permissão ou regra mudou.

**Decisões:**

- Tokens em `src/styles.css`: `--radius` 12px (cards 20px, internos 12–16px); cores com significado `positive` (entradas), `negative` (saídas), `alert` (vencidos/pendências), `neutral-soft`, `extra` (aditivos) e `primary-soft`, cada uma com fundo suave `*-soft`, nos temas claro e escuro; card de destaque `hero`/`hero-end` (azul JMG profundo) e sombra `shadow-hero`.
- Componentes: `src/components/kpi.tsx` (`KpiCard` com variantes destaque/preenchido/neutro, `Money` com R$ menor, sinal e cor sem quebrar linha, `IconBubble`, `Segmented`) e `src/lib/surface.ts` (`panelClass`, `segmentClass`). Badge ganhou `positive/negative/alert/neutral/info`; Button ganhou `danger` (cancelar/excluir discreto) e `soft`, altura 40px; campos sem sombra e mais arredondados; título de página maior.
- Painel: saldo em caixa como card principal; entradas (verde) e saídas (vermelho); a receber/a pagar com fundo suave; obras ativas e valor em obras neutros; resultado previsto com cor pelo sinal; aditivos em violeta discreto. Valores continuam de `executiveComposition`/`indicatorTotal`.
- Fluxo de Caixa (`Finance`, também usado na aba da obra): saldo atual em destaque, a receber/a pagar com vencidos em laranja, contas bancárias como chips, abas em pílulas, filtros num painel, movimentos e contas em lista com ícone ↑/↓ e valor com sinal; status como badges. Totais seguem de `cashSummary`/`accountStatus`.

**Onde está:** `src/styles.css`, `src/components/kpi.tsx`, `src/lib/surface.ts`, `src/components/ui/{button,badge,card,input,textarea,tabs}.tsx`, `src/components/page-header.tsx`, `src/components/management/executive.tsx`, `src/components/works/finance.tsx`, `src/routes/_authenticated/financeiro.tsx`. Conferido no navegador em 1440px e 375px, claro e escuro.

**Pendências:** validação do Guilherme; depois replicar em Orçamentos, Contratos, Cronogramas, Obras, Cadastros, Catálogo e Relatórios. As linhas de contas a receber/pagar não tinham dados no banco local para conferir na tela.

### 2026-10-28 — Avanço da obra pelo valor das etapas (branch `feat/fundacao-tecnica`)

**Decisão do Guilherme:** o "Avanço (% da obra)" das etapas vindas do orçamento é proporcional ao valor previsto de cada etapa.

- `valueWeights` (work-progress.ts, testado): percentuais com duas casas somando 100% exatos (sobra do arredondamento na etapa de maior valor); sem valor nenhum não muda nada.
- `applyValueWeights` (work-budget.ts): valor de cada etapa por `stageCosts(...).planned` (serviços ou valor digitado) e grava `work_stages.weight`. Roda ao converter o orçamento em obra e depois de a revisão aprovada atualizar as etapas; recalcula todas as etapas ativas da obra (etapa sem valor fica 0%).
- Testado no navegador: R$ 3.000 / 5.000 / 2.000 → 30% / 50% / 20%; revisão sem o serviço de R$ 2.000 → 37,5% / 62,5% / 0%, "Avanço distribuído: 100%". Dados de teste apagados.

### 2026-10-28 — Revisão aprovada atualiza os serviços das etapas da obra (branch `feat/fundacao-tecnica`)

**Decisão do Guilherme:** ao aprovar a revisão, as etapas da obra acompanham o orçamento novo.

- Migração `20261028000006_revision_syncs_stage_services.sql`: `budget_items.origin_item_id` (linhagem copiada por `copy_budget` só em revisões; duplicar não leva) e `work_stage_services.budget_item_id` (gravado por `convert_budget`). Nova `sync_budget_stage_services(_budget_id, _services)`: cria etapa para grupo novo, atualiza custo/descrição/etapa mantendo o avanço, cria serviços novos, apaga os que saíram (auditado); serviços manuais ficam.
- Front: `syncBudgetStages` (work-budget.ts) roda depois de registrar a aprovação (approval.tsx), com custo de `computeBudget`, e recalcula o avanço das etapas com `syncStageProgress`. Falha na sincronização aparece em aviso sem desfazer a aprovação; pode ser rodada de novo (idempotente).
- Testado no banco (transação desfeita: Tomadas com novo custo e 50% mantidos, Quadro removido, Hidráulica nova, manual intacto, segunda execução sem mudanças) e no navegador (converter em obra → reabrir → Tomadas 10→20 e tirar Quadro → aprovar: obra na Rev. 1, Tomadas R$ 1.000, Quadro fora). Dados de teste apagados.
- Obras convertidas antes desta migração não têm `budget_item_id`; seus serviços não são atualizados por revisões.

### 2026-10-28 — Custo da etapa no formulário e campos em reais (branch `feat/fundacao-tecnica`)

**Pedido do Guilherme:** o valor da etapa e dos materiais vai no formulário da etapa (junto de datas e responsável), não no card; o card fica só com os totais. Valores digitados aparecem como moeda.

- `MoneyInput` (`src/components/money-input.tsx`) + `parseBRL`/`maskBRL`/`moneyText` (`src/lib/money.ts`, testados): dígitos viram centavos ("1000000" → "R$ 10.000,00").
- Formulário da etapa (`schedule.tsx`, `StageCostFields`): "Valor da etapa (mão de obra / serviço)" e "Valor dos materiais da etapa" para admin/financeiro; gravados com `saveStageValues` ao salvar a etapa. Com serviços na etapa mostra a soma deles em vez dos campos.
- Card (`stage-services.tsx`): só previsto, já pago, restante e contas em aberto; MO/material dos serviços também em reais.
- Conferido no navegador: etapa existente abre com "R$ 2.825,00"; etapa de teste salva R$ 10.000 + R$ 5.000 e foi removida depois.

### 2026-10-28 — Reabrir orçamento aprovado para edição (branch `feat/fundacao-tecnica`)

**Decisão do Guilherme:** opção A — o aprovado continua imutável; "Reabrir para edição" cria a revisão e, ao aprovar de novo, ela substitui a anterior. Com contrato assinado, a mudança vira aditivo.

- Migração `20261028000004_budget_superseded_status.sql`: novo status `substituido` (sozinho porque o valor do enum só vale após o commit).
- Migração `20261028000005_budget_reopen_revision.sql`: `budgets.superseded_by`; `guard_budget_locked` trava também `substituido` e só aceita aprovado → substituído vindo do gatilho (`jmg.budget_supersede`); `registry_guard` deixa trocar `linked_budget_id` só nesse gatilho e dentro da mesma família; gatilho `supersede_previous_budget` (ao aprovar) marca a versão anterior, religa obra e etapas (grupo de mesmo nome), registra `budget_history` e recusa se a obra tiver contrato assinado; `convert_budget` devolve a obra já ligada à família (nunca cria segunda obra).
- Front: `isLockedStatus`, `openRevision`, `approvedVersion` (budget-status.ts, testados) e `budgetFamilyOptions` (budget-api.ts). Tela do orçamento: botão "Reabrir para edição" no aprovado (reaproveita revisão em aberto), aviso "Ao aprovar, esta revisão substitui a Rev. N" na revisão, e "Substituído pela Rev. N" com link na versão antiga.
- Testado no banco (transação desfeita: edição direta bloqueada, substituição, obra e etapa religadas, contrato assinado bloqueia) e no navegador com orçamento nº 99990 (reabrir → remover serviço → aprovar com comprovante → Rev. 0 "Substituído", obra na Rev. 1); dados de teste apagados.

**Limites:** contrato "gerado" ainda não assinado guarda o texto antigo e precisa ser gerado de novo. (Serviços das etapas: resolvido na task seguinte.)

### 2026-10-27 — Valor da etapa e dos materiais digitados na obra (branch `feat/fundacao-tecnica`)

**Pedido do Guilherme:** na obra feita do zero, digitar o valor da etapa (ex.: R$ 10.000) e o valor dos materiais, para calcular quanto já foi pago e quanto falta de cada um; "peso" passa a se chamar avanço.

- Migração `20261028000002_stage_planned_values.sql`: tabela `work_stage_values` (uma linha por etapa: `labor_planned`, `material_planned`), RLS `can_see_costs`, guarda de etapa ativa da mesma obra, auditoria em `work_history`, cascata com etapa/obra.
- `stageCosts` (operations.ts) recebe o valor digitado; com serviços na etapa, o previsto é a soma deles e o digitado não entra (sem dupla contagem). Novos campos `fromServices`, `laborBalance`, `materialBalance`. Testes: R$ 10.000 + R$ 5.000 com R$ 4.000/R$ 2.000 pagos → restante R$ 6.000/R$ 3.000; outras categorias só reduzem o total.
- Card da etapa (`stage-services.tsx`): campos "Valor da etapa (mão de obra / serviço)" e "Valor dos materiais da etapa" (salvam ao sair do campo/Enter; travados mostrando a soma quando há serviços); previsto, já pago e restante separados em etapa e materiais.
- "Peso" renomeado: "Avanço: vale X% da obra" no card e no relatório, "Avanço distribuído" no topo, "Avanço (% da obra)" nos formulários.
- Conferido no navegador com etapa de teste (removida depois). Corrigido: salvar os dois campos em sequência apagava o primeiro; agora cada campo grava só o próprio valor.

### 2026-10-27 — Orçamento vira obra já com serviços e custos nas etapas (branch `feat/fundacao-tecnica`)

**Decisão do Guilherme:** o previsto da etapa vindo do orçamento é o **custo** (o que a JMG paga), não o preço de venda.

- Migração `20261028000003_convert_budget_stage_services.sql`: `convert_budget(_budget_id, _services jsonb default '[]')` substitui a versão de um argumento. Cria um `work_stage_services` por item do orçamento, na etapa do seu grupo (`budget_section_id`), com MO e materiais do custo; descrição/ordem vêm do banco e item de outro orçamento é recusado. Tudo na transação da conversão.
- Front: `convertBudgetToWork` (work-budget.ts) carrega o orçamento, roda `computeBudget` e manda `budgetStageServices(result.items)` (operations.ts, testado). Usado na aprovação do orçamento e em "Nova obra a partir de orçamento".
- Testado no banco (transação desfeita): 3 itens em 2 grupos → serviços nas etapas Elétrica/Pintura com os custos; reconverter devolve a mesma obra; item estranho → "Serviço não pertence a este orçamento.". API responde com e sem `_services`.
- Obras já convertidas antes disso não recebem os serviços retroativamente.

### 2026-10-27 — Etapas da obra num card só (branch `feat/fundacao-tecnica`)

**Pedido do Guilherme:** os valores ficavam num quadro separado embaixo da etapa, com uma barra de avanço no meio; juntar tudo e tirar a barra.

- `schedule.tsx`: cada etapa virou um card (borda, fundo `bg-card`, espaço entre cards). A barra de avanço só aparece quando o quadro de valores não aparece (cronograma ou usuário sem acesso a custos).
- `stage-services.tsx`: valores dentro do card, separados por uma linha: "Valor previsto", "Já pago" (com % do previsto), "Restante a pagar" (previsto − pago, em vermelho quando estoura) e "Contas em aberto". Barra de gasto removida; cálculos continuam em `stageCosts`.
- Conferido no navegador com um serviço de teste (apagado depois): R$ 1.500 MO + R$ 800 material → previsto e restante R$ 2.300.

### 2026-10-28 — Serviços, avanço e valores por etapa da obra (branch `feat/fundacao-tecnica`)

**Decisões do Guilherme:** gasto real vem do financeiro (saídas com etapa); avanço da etapa ponderado pelo valor dos serviços.

- Migração `20261028000001_stage_services_and_costs.sql`: tabela `work_stage_services` (descrição, MO e material previstos, avanço %), RLS `can_see_costs`, guarda de etapa ativa da mesma obra, auditoria em `work_history` (inclusive exclusão), cascata na exclusão definitiva da obra. `financial_entries.stage_id` validado contra a obra; `guard_installment_entry` permite escolher/trocar a etapa de parcelas.
- Cálculos: `servicesProgress`/`statusForProgress` (work-progress.ts) e `stageCosts` (operations.ts: previsto, gasto pago por MO/material/outros, comprometido, saldo). Avanço calculado é gravado em `work_stages.progress`, então cronograma, painel e relatórios usam o mesmo número.
- Tela: painel por etapa na aba Etapas (cards e lista editável de serviços); avanço manual some quando a etapa tem serviços. Financeiro da obra: "Etapa da obra" ao lançar saída/conta a pagar e seletor de etapa em cada saída.
- Etapas novas já existiam ("Nova etapa") e ficam no cronograma porque é a mesma tabela.

**Testado no navegador** com obra de teste (apagada depois): R$ 2.000 a 50% + R$ 1.000 a 100% → 66,67%; saídas de R$ 1.500 MO + R$ 500 material na etapa → previsto R$ 3.000, gasto R$ 2.000, saldo R$ 1.000.

### 2026-10-28 — Financeiro: caixa separado de contas a receber/pagar (branch `feat/fundacao-tecnica`)

**Modelo (sem mover dados):** `financial_entries` são as contas (futuro) e `financial_settlements` são o caixa (realizado). Decisão do Guilherme: saldo atual inclui o saldo inicial das contas bancárias.

- Migração `20261028000000_cash_and_settlement_undo.sql`: `financial_entries.cash_only` (à vista); `financial_settlements.account_id` opcional; `register_cash_movement` cria conta + baixa atômicas (idempotente); `undo_settlement` remove a baixa (e a conta, se à vista) e grava snapshot em `record_deletion_log`; `cancel_financial_entry` cancela o lançamento inteiro (todas as parcelas) só sem baixas, rateio ou compra. `check_financial_group_total` aceita grupo inteiro cancelado; `guard_installment_entry` só libera `canceled` com `jmg.finance_cancel`.
- Cálculos puros em `operations.ts`: `accountStatus` (pendente, vencida, parcial, recebida/paga, cancelada, vence em até 3 dias), `cashMovements`, `cashSummary` (saldo atual, a receber/pagar e vencidos, previsto). Testes cobrem os critérios de aceite.
- Tela `src/components/works/finance.tsx` (Financeiro geral e aba da obra): cards, abas Caixa / Contas a receber / Contas a pagar, filtros (período, categoria, status, tipo), Nova entrada/saída, Recebi/Paguei (pré-preenchido, parcial), Desfazer baixa, Cancelar.

**Testado:** critérios de aceite no navegador (100 → 100/+200 previsto → 300 → 100; o mesmo para pagar e saída à vista) e cancelamento; dados de teste removidos. `test:db`, build e testes da API passam.

### 2026-10-28 — Excluir e editar obras (branch `feat/fundacao-tecnica`)

**Decisão do Guilherme:** obra usa a lixeira com bloqueio, igual a orçamentos e cadastros.

- Migração `20261027000000_work_trash.sql`: `work_registry` ganhou `deleted_at`/`deleted_by` e o `guard_record_deletion`; `manage_record_deletion` aceita `work_registry`. Lixeira leva junto o cabeçalho do cronograma (mesmo horário) e restaurar traz de volta. Exclusão definitiva só para obra sem financeiro, abertura com valores recebidos/pagos, compras, contrato, registros, extras ou estimativas — a mensagem lista o que impede; apaga cronograma, etapas, versões, abertura, histórico e o espelho legado `works`, guardando tudo no `record_deletion_log`.
- Leitores de lista filtram `deleted_at` (obras, painel, cronogramas, seletores do financeiro, perfil da pessoa). Página da obra na lixeira mostra o aviso de restauração.
- "Editar obra" (antes "Dados da obra") passou a editar cliente, arquiteto, tipo de obra, condições de pagamento e observações; cliente na lixeira continua na lista para não perder o vínculo.

**Testado:** fluxo SQL em transação desfeita (lixeira, bloqueio de edição, restaurar, definitiva, bloqueio por valores) e no navegador com obra de teste (editar, excluir, lixeira, excluir definitivamente).

### 2026-10-27 — Serviço avulso no orçamento (branch `feat/fundacao-tecnica`)

**Problema:** serviços usados só numa obra precisavam ser cadastrados no catálogo; o "Item manual" criava um item vazio e não havia como colocar materiais do catálogo em um item.

**Decisões:**

- "Serviço avulso (só neste orçamento)" no diálogo Adicionar serviço: descrição, unidade, quantidade, custo MO/un e materiais do catálogo (consumo e perda). Vira um `budget_items` com `service_id` nulo; nada entra na tela de Serviços. Sem migração.
- Materiais são snapshots do catálogo via `snapshotMaterial` (`src/lib/item-materials.ts`), o mesmo helper usado ao adicionar serviço do catálogo, com rendimento de embalagem incluído. O cálculo continua em `computeBudget`.
- Qualquer item do orçamento (avulso ou do catálogo) ganhou "+ Material" do catálogo e "Remover material".

**Onde está:** `src/lib/item-materials.ts` (+ `.test.ts`), `src/components/budgets/items-editor.tsx`, `activeMaterialsOptions` em `src/lib/budget-api.ts`. Testado no navegador com orçamento de teste (apagado depois): 30 m² com salva-piso → 2 rolos, custo R$ 800.

### 2026-10-26 — Enter salva formulários (branch `feat/fundacao-tecnica`)

**Problema:** vários diálogos (material, serviço, cadastros, novo orçamento, configurações) tinham `Input`s soltos e o botão Salvar com `onClick`, sem `<form>`; o Enter não fazia nada.

**Decisões:**

- Ouvinte global `EnterToSubmit` (montado em `__root.tsx`) decide o Enter em qualquer `<form>`, pela regra pura `enterIntent` em `src/lib/enter-submit.ts`: salva em texto/número/data/select; textarea só com Ctrl/Cmd+Enter; bloqueia quando o campo tem `aria-expanded="true"` (combobox aberto); ignora Enter já tratado (`defaultPrevented`), repetição da tecla e conteúdo em portal. Usa o primeiro botão `type="submit"`; botão desabilitado ou `aria-busy` não salvam. `data-enter-submit="off"` desliga num formulário.
- Diálogos sem `<form>` passaram a usar `SubmitForm` (`src/components/enter-submit.tsx`), com `pending` para não enviar duas vezes. Todo botão que não salva virou `type="button"` (+ Material, lixeira, Cancelar…).
- Campos de edição em linha que salvam no `onBlur` (itens do orçamento, etapas, avanço do cronograma) usam `commitOnEnter`: Enter só confirma o campo (blur), não submete nada.
- Formulários que já existiam (`DraftForm`, obras, cronogramas, compras etc.) não mudaram de estrutura; só ganharam `type="submit"` explícito. A movimentação de material e o "Adicionar serviço" do orçamento ganharam trava de ocupado contra duplo envio.

**Onde está:** `src/lib/enter-submit.ts` (+ `.test.ts`), `src/components/enter-submit.tsx` (+ `.test.tsx`). Testado no navegador: login, material (Enter no nome e no select), cadastros (Enter na textarea quebra linha; Cmd+Enter salva) e serviços (Enter não aciona "+ Material").

### 2026-10-25 — Rendimento de embalagem dos materiais (branch `feat/fundacao-tecnica`)

**Problema:** material vendido em embalagem (ex.: salva-piso em rolo de 25 m²) era cobrado 1 unidade de compra por unidade de serviço quando a conversão ficava no padrão 1 — 100 m² de proteção viravam 100 rolos.

**Decisões:**

- O vínculo `service_materials` já tinha `consumption` (consumo por unidade) e `loss_pct` (perda %). Por decisão do Guilherme, **reaproveitamos essas colunas** em vez de criar `consumo_por_unidade`/`perda_percentual` duplicadas. O default de `consumption` passou de 0 para 1.
- `materials` ganhou `rendimento_embalagem` (numeric, nulo, > 0) e `unidade_rendimento` (text, nulo — usa a unidade de consumo quando vazio).
- **Arredondamento por serviço** (decisão do Guilherme): `embalagens = ⌈qtd × consumo × (1 + perda/100) ÷ rendimento⌉`, `custo = embalagens × preço da embalagem`. Dois serviços de 30 m² dão 2 + 2 rolos, não 3.
- Rendimento nulo mantém o cálculo antigo (fracionado por `conversion`), então orçamentos existentes não mudam.

**Onde está:**

- Migração: `supabase/migrations/20261025000002_material_package_yield.sql`.
- Cálculo: `src/lib/pricing.ts` — `materialPackages`, `materialPurchaseQty`, `materialCost`. Testes em `pricing.test.ts` (100 m² → 4, 30 m² → 2, 100 m² + 10% → 5, arredondamento por serviço, sem rendimento).
- Snapshot do item (`budget_items.materials`): campos `package_yield` e `yield_unit`, copiados do catálogo ao adicionar o serviço ao orçamento.
- UI: campos no cadastro de material (`materiais.tsx`); exemplo "100 m² → N rolos" na composição do serviço (`servicos.tsx`); linha do item mostra "100 m² → 4 rolo" (`items-editor.tsx`); resumo de materiais e consolidação de compras (`operations.ts`) somam as embalagens por serviço.

**Pendências:**

- Migração não aplicada em banco local nesta sessão (Docker indisponível no PATH). Rodar `npm run stack:up` / `npm run db:migrate` para conferir.
- Itens de orçamento já criados não recebem o rendimento retroativamente (é snapshot); para aplicar, readicionar o serviço ao orçamento.
