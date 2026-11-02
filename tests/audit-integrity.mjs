import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const db = new PGlite();
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,status text);
GRANT USAGE ON SCHEMA auth,storage,public TO authenticated,anon; GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
-- Como a imagem do Supabase: tudo do schema public liberado por padrão para anon/authenticated.
-- As migrações precisam fechar isso (20261102000042_security_hardening).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;`);
for (const name of (await readdir("supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  try {
    await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
    console.log("migration OK", name);
  } catch (e) {
    console.error("migration FAILED", name, e.message);
    process.exit(1);
  }
}
const admin = "00000000-0000-0000-0000-000000000001",
  team = "00000000-0000-0000-0000-000000000002",
  pending = "00000000-0000-0000-0000-000000000003";
const value = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0] ?? {})[0];
const rejects = async (sql, args = [], message) =>
  assert.rejects(() => db.query(sql, args), message);
await db.query(
  "INSERT INTO auth.users(id,email) VALUES($1,'admin@local'),($2,'team@local'),($3,'pending@local')",
  [admin, team, pending],
);
assert.equal(
  await value("SELECT count(*)::int FROM public.user_roles"),
  0,
  "Registration must not grant a role, even on an empty installation",
);
await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin'),($2,'equipe')", [
  admin,
  team,
]);
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [pending]);
await db.exec("SET ROLE authenticated");
assert.equal(await value("SELECT count(*)::int FROM public.people"), 0);
assert.equal(await value("SELECT count(*)::int FROM public.company_settings"), 0);
assert.equal(await value("SELECT count(*)::int FROM public.profiles"), 1);
await rejects(
  "INSERT INTO public.people(kind,name) VALUES('cliente','Unapproved')",
  [],
  /row-level security/i,
);
await db.exec("RESET ROLE");
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
await db.exec("SET ROLE authenticated");
const client = await value(
  "INSERT INTO public.people(kind,name) VALUES('cliente','Cliente teste') RETURNING id",
);
await rejects("INSERT INTO public.budgets(status) VALUES('aprovado')", [], /elaboração/);
const b1 = await value("INSERT INTO public.budgets(title) VALUES('Draft one') RETURNING id");
const b2 = await value("INSERT INTO public.budgets(title) VALUES('Draft two') RETURNING id");
// Orçamentos novos e revisões abertas: percentuais só sobre a mão de obra.
assert.equal(
  await value("SELECT params->>'rates_base' FROM public.budgets WHERE id=$1", [b1]),
  "mao_de_obra",
);
assert.equal(
  await value(
    `INSERT INTO public.budgets(title, params) VALUES('Direct', '{"model":"custo_direto","desired_margin":20}')
     RETURNING params->>'rates_base' || '/' || (params->>'desired_margin')`,
  ),
  "mao_de_obra/20",
);
await db.query("DELETE FROM public.budgets WHERE title='Direct'");
const section = await value(
  "INSERT INTO public.budget_sections(budget_id,title) VALUES($1,'Scope') RETURNING id",
  [b1],
);
await rejects(
  "INSERT INTO public.budget_items(budget_id,section_id,description) VALUES($1,$2,'Wrong scope')",
  [b2, section],
  /item_section_same_budget/,
);
await db.query(
  "INSERT INTO public.budget_items(budget_id,section_id,description) VALUES($1,$2,'Valid scope')",
  [b1, section],
);
await rejects("UPDATE public.budgets SET status='aprovado' WHERE id=$1", [b1], /comprovante/);
await db.query(
  "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('jmg-documents','approvals/proof.pdf',$1),('jmg-documents','approvals/orphan.pdf',$1)",
  [admin],
);
await db.query(
  "UPDATE public.budgets SET status='aprovado',approval_date='2026-10-25',approval_path='approvals/proof.pdf' WHERE id=$1",
  [b1],
);
assert.equal(
  (await db.query("DELETE FROM storage.objects WHERE name='approvals/proof.pdf' RETURNING id")).rows
    .length,
  0,
  "Referenced evidence must be retained",
);
assert.equal(
  (await db.query("DELETE FROM storage.objects WHERE name='approvals/orphan.pdf' RETURNING id"))
    .rows.length,
  1,
  "Unreferenced owner uploads may be deleted",
);
await rejects("UPDATE public.budgets SET title='Changed' WHERE id=$1", [b1], /bloqueado/);
const work = await value("SELECT public.convert_budget($1)", [b1]);
assert.equal(await value("SELECT public.convert_budget($1)", [b1]), work);
const revision1 = await value("SELECT public.copy_budget($1,true)", [b1]);
const revision2 = await value("SELECT public.copy_budget($1,true)", [b1]);
assert.equal(await value("SELECT revision FROM public.budgets WHERE id=$1", [revision1]), 1);
assert.equal(await value("SELECT revision FROM public.budgets WHERE id=$1", [revision2]), 2);
await rejects(
  "UPDATE public.budgets SET revision=1 WHERE id=$1",
  [revision2],
  /budget_revision_identity/,
);
const entry = await value(
  "INSERT INTO public.financial_entries(description,direction,amount,due_date) VALUES('Shared','saida',100,'2026-10-25') RETURNING id",
);
await db.query(
  "INSERT INTO public.expense_allocations(entry_id,work_id,amount,rule) VALUES($1,$2,80,'Fixed')",
  [entry, work],
);
await rejects("UPDATE public.financial_entries SET amount=50 WHERE id=$1", [entry], /rateado/);
await rejects("UPDATE public.financial_entries SET canceled=true WHERE id=$1", [entry], /rateado/);
await rejects(
  "UPDATE public.financial_entries SET work_id=$2 WHERE id=$1",
  [entry, work],
  /rateado/,
);
await db.query("UPDATE public.financial_entries SET amount=120 WHERE id=$1", [entry]);
// Contas da empresa: conta obrigatória, correção da conta e conta padrão do contrato.
const c6 = await value("SELECT id FROM public.financial_accounts WHERE is_contract_default");
assert.ok(c6, "A conta C6 nasce como padrão do contrato");
assert.equal(
  await value("SELECT bank FROM public.financial_accounts WHERE id=$1", [c6]),
  "Banco C6",
);
const other = await value(
  "INSERT INTO public.financial_accounts(name,bank,agency,account_number,pix_key_type,pix_key,is_contract_default) VALUES('Itaú PJ','Itaú','1234','5678-9','email','f@jmg.local',true) RETURNING id",
);
assert.equal(
  await value("SELECT is_contract_default FROM public.financial_accounts WHERE id=$1", [c6]),
  false,
);
const cash = await value(
  "INSERT INTO public.financial_accounts(name,kind,bank,is_contract_default) VALUES('Caixa','caixa','X',true) RETURNING id",
);
assert.equal(
  await value(
    "SELECT bank IS NULL AND NOT is_contract_default FROM public.financial_accounts WHERE id=$1",
    [cash],
  ),
  true,
);
await rejects(
  "INSERT INTO public.financial_accounts(name,is_contract_default) VALUES('Sem dados',true)",
  [],
  /banco e conta ou de uma chave PIX/,
);
const receivable = await value(
  "INSERT INTO public.financial_entries(description,direction,amount,due_date,work_id) VALUES('Parcela','entrada',300,'2026-10-25',$1) RETURNING id",
  [work],
);
await rejects(
  "INSERT INTO public.financial_settlements(entry_id,amount,paid_date) VALUES($1,100,'2026-10-26')",
  [receivable],
  /Selecione a conta/,
);
await rejects(
  "SELECT public.register_cash_movement(gen_random_uuid(),'saida','2026-10-26','Sem conta',10,'Outras','',NULL,NULL,NULL,'')",
  [],
  /Selecione a conta/,
);
const settled = await value(
  "INSERT INTO public.financial_settlements(entry_id,account_id,amount,paid_date) VALUES($1,$2,100,'2026-10-26') RETURNING id",
  [receivable, c6],
);
await rejects(
  "UPDATE public.financial_settlements SET account_id=$2 WHERE id=$1",
  [settled, other],
  /permission denied/,
);
await db.query("SELECT public.set_settlement_account($1,$2)", [settled, other]);
assert.equal(
  await value("SELECT account_id FROM public.financial_settlements WHERE id=$1", [settled]),
  other,
);
assert.equal(
  await value(
    "SELECT old_account_id FROM public.settlement_account_changes WHERE settlement_id=$1",
    [settled],
  ),
  c6,
);
await db.query("UPDATE public.financial_accounts SET active=false WHERE id=$1", [cash]);
await rejects("SELECT public.set_settlement_account($1,$2)", [settled, cash], /conta ativa/);
await rejects(
  "INSERT INTO public.financial_settlements(entry_id,account_id,amount,paid_date) VALUES($1,$2,10,'2026-10-26')",
  [receivable, cash],
  /inativa/,
);
// Contrato gerado com a conta escolhida: registra e guarda a cópia dos dados bancários.
await db.query(
  "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('jmg-documents','contracts/generated/b1/c.pdf',$1)",
  [admin],
);
const generated = await value("SELECT public.register_generated_contract($1,$2,$3,$4)", [
  b1,
  "contracts/generated/b1/c.pdf",
  "CT-2026-0001",
  other,
]);
assert.equal(
  await value("SELECT bank_account->>'bank' FROM public.contracts WHERE id=$1", [generated]),
  "Itaú",
);
assert.equal(
  await value("SELECT public.register_generated_contract($1,$2,$3)", [
    b1,
    "contracts/generated/b1/c.pdf",
    "CT-2026-0001",
  ]),
  generated,
);
for (const action of ["trash", "permanent"])
  await db.query("SELECT public.manage_record_deletion('contracts',$1,$2)", [generated, action]);
// Planejamento: dependências sem ciclo, conclusão só depois das anteriores e das pendências.
const task = async (title) =>
  value(
    "INSERT INTO public.work_tasks(work_id,title,planned_date) VALUES($1,$2,'2026-11-03') RETURNING id",
    [work, title],
  );
const pipes = await task("Tubulação");
const waterproof = await task("Impermeabilizar");
const tiles = await task("Revestimento");
await db.query(
  "INSERT INTO public.work_task_dependencies(task_id,depends_on_id) VALUES($1,$2),($3,$1)",
  [waterproof, pipes, tiles],
);
await rejects(
  "INSERT INTO public.work_task_dependencies(task_id,depends_on_id) VALUES($1,$2)",
  [pipes, tiles],
  /esperarem uma pela outra/,
);
await rejects(
  "UPDATE public.work_tasks SET status='concluida' WHERE id=$1",
  [waterproof],
  /Conclua antes a tarefa "Tubulação"/,
);
await db.query("UPDATE public.work_tasks SET status='concluida' WHERE id=$1", [pipes]);
assert.equal(await value("SELECT done_by FROM public.work_tasks WHERE id=$1", [pipes]), admin);
await db.query("UPDATE public.work_tasks SET status='concluida' WHERE id=$1", [waterproof]);
const issue = await value(
  "INSERT INTO public.work_issues(work_id,title,owner_kind,blocks_task_id) VALUES($1,'Cliente escolher piso','cliente',$2) RETURNING id",
  [work, tiles],
);
await rejects(
  "UPDATE public.work_tasks SET status='concluida' WHERE id=$1",
  [tiles],
  /Resolva antes a pendência/,
);
await db.query(
  "UPDATE public.work_issues SET status='resolvida', resolution='Escolhido' WHERE id=$1",
  [issue],
);
assert.ok(await value("SELECT resolved_at FROM public.work_issues WHERE id=$1", [issue]));
await db.query("UPDATE public.work_tasks SET status='concluida' WHERE id=$1", [tiles]);
await db.query("UPDATE public.work_tasks SET status='a_fazer' WHERE id=$1", [tiles]);
assert.equal(await value("SELECT done_at FROM public.work_tasks WHERE id=$1", [tiles]), null);
assert.ok(
  (await value("SELECT count(*)::int FROM public.work_history WHERE entity='work_tasks'")) >= 3,
  "Tarefas ficam no histórico da obra",
);
const material = await value(
  "INSERT INTO public.materials(name,purchase_unit,consumption_unit) VALUES('M','un','un') RETURNING id",
);
const payload = { description: "Original", unit: "un", labor_cost: 10, active: true };
const service = await value("SELECT public.save_service_composition(NULL,$1,$2)", [
  payload,
  [{ material_id: material, consumption: 2, loss_pct: 5 }],
]);
await rejects(
  "SELECT public.save_service_composition($1,$2,$3)",
  [
    service,
    { ...payload, description: "Should rollback" },
    [{ material_id: material, consumption: -1, loss_pct: 0 }],
  ],
  /consumo/,
);
assert.equal(
  await value("SELECT description FROM public.services WHERE id=$1", [service]),
  "Original",
);
assert.equal(
  await value("SELECT consumption::int FROM public.service_materials WHERE service_id=$1", [
    service,
  ]),
  2,
);
await db.exec("RESET ROLE");
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [team]);
await db.exec("SET ROLE authenticated");
assert.equal(await value("SELECT count(*)::int FROM public.work_registry"), 1);
assert.equal(await value("SELECT count(*)::int FROM public.budgets"), 0);
assert.equal(
  await value("SELECT count(*)::int FROM public.work_tasks"),
  3,
  "Equipe vê o planejamento",
);
assert.equal(
  await value("SELECT count(*)::int FROM public.work_issues"),
  1,
  "Equipe vê as pendências",
);
await db.query("UPDATE public.work_tasks SET status='concluida' WHERE title='Revestimento'");
await rejects("SELECT public.save_service_composition(NULL,$1,$2)", [payload, []], /Sem permissão/);
await db.exec("RESET ROLE");
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [pending]);
await db.exec("SET ROLE authenticated");
assert.equal(await value("SELECT count(*)::int FROM public.work_registry"), 0);
assert.equal(await value("SELECT count(*)::int FROM storage.objects"), 0);
assert.equal(await value("SELECT count(*)::int FROM public.work_tasks"), 0);
await db.exec("RESET ROLE");
console.log(
  "PASS: registration, RLS profiles, approval, scoped items, evidence retention, locked budgets, conversion, revision uniqueness, allocations, company accounts, work planning, atomic composition and operational access",
);
// Trash and permanent deletion exercise the same RPC used by the interface.
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
await db.exec("SET ROLE authenticated");
const manage = async (entity, id, action) =>
  db.query("SELECT public.manage_record_deletion($1,$2,$3)", [entity, id, action]);
await rejects(
  "SELECT public.manage_record_deletion($1,$2,$3)",
  ["people", client, "permanent"],
  /lixeira/,
);
await rejects(
  "UPDATE public.people SET deleted_at=now() WHERE id=$1",
  [client],
  /operação da lixeira/,
);
await rejects(
  "SELECT public.manage_record_deletion($1,$2,$3)",
  ["financial_entries", entry, "trash"],
  /inválida/,
);
await manage("budgets", b1, "trash");
await rejects("SELECT public.convert_budget($1)", [b1], /Restaure/);
await rejects("SELECT public.copy_budget($1,true)", [b1], /Restaure/);
await rejects(
  "UPDATE public.budget_items SET description='Changed' WHERE budget_id=$1",
  [b1],
  /Restaure/,
);
assert.ok(await value("SELECT deleted_at FROM public.budgets WHERE id=$1", [b1]));
assert.equal(
  await value("SELECT linked_budget_id FROM public.work_registry WHERE id=$1", [work]),
  b1,
);
await rejects(
  "SELECT public.manage_record_deletion($1,$2,$3)",
  ["budgets", b1, "permanent"],
  /vínculos/,
);
assert.equal(
  await value("SELECT count(*)::int FROM public.budget_items WHERE budget_id=$1", [b1]),
  1,
);
await manage("budgets", b1, "restore");
assert.equal(await value("SELECT deleted_at FROM public.budgets WHERE id=$1", [b1]), null);
await rejects("UPDATE public.budgets SET title='Changed' WHERE id=$1", [b1], /bloqueado/);
await db.query("INSERT INTO public.budget_sections(budget_id,title) VALUES($1,'Disposable')", [b2]);
const disposableSection = await value("SELECT id FROM public.budget_sections WHERE budget_id=$1", [
  b2,
]);
await db.query(
  "INSERT INTO public.budget_items(budget_id,section_id,description) VALUES($1,$2,'Disposable')",
  [b2, disposableSection],
);
await manage("budgets", b2, "trash");
await manage("budgets", b2, "permanent");
assert.equal(await value("SELECT count(*)::int FROM public.budgets WHERE id=$1", [b2]), 0);
assert.equal(
  await value("SELECT count(*)::int FROM public.budget_items WHERE budget_id=$1", [b2]),
  0,
);
// An approved but unconverted proposal can also be permanently removed from trash.
const disposableApproved = await value(
  "INSERT INTO public.budgets(title) VALUES('Approved disposable') RETURNING id",
);
const approvedSection = await value(
  "INSERT INTO public.budget_sections(budget_id,title) VALUES($1,'Approved scope') RETURNING id",
  [disposableApproved],
);
await db.query(
  "INSERT INTO public.budget_items(budget_id,section_id,description) VALUES($1,$2,'Scope')",
  [disposableApproved, approvedSection],
);
await db.query(
  "UPDATE public.budgets SET status='aprovado',approval_date='2026-10-25',approval_path='approvals/proof.pdf' WHERE id=$1",
  [disposableApproved],
);
await manage("budgets", disposableApproved, "trash");
await manage("budgets", disposableApproved, "permanent");
assert.equal(
  await value("SELECT count(*)::int FROM public.budgets WHERE id=$1", [disposableApproved]),
  0,
);
const contract = await value(
  "INSERT INTO public.contracts(work_id,body) VALUES($1,'Texto original') RETURNING id",
  [work],
);
await db.query(
  "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('jmg-documents','contracts/signed.pdf',$1)",
  [admin],
);
await db.query(
  "UPDATE public.contracts SET status='assinado',signed_path='contracts/signed.pdf',signed_date='2026-10-25' WHERE id=$1",
  [contract],
);
await manage("contracts", contract, "trash");
await manage("contracts", contract, "restore");
assert.equal(
  await value("SELECT body FROM public.contracts WHERE id=$1", [contract]),
  "Texto original",
);
await rejects("UPDATE public.contracts SET body='Changed' WHERE id=$1", [contract], /assinado/);
await manage("contracts", contract, "trash");
await manage("contracts", contract, "permanent");
assert.equal(await value("SELECT count(*)::int FROM public.work_registry WHERE id=$1", [work]), 1);
const linkedSchedule = await value("SELECT id FROM public.schedules WHERE work_id=$1", [work]);
await manage("schedules", linkedSchedule, "trash");
await db.query("UPDATE public.work_registry SET name='Renamed while in trash' WHERE id=$1", [work]);
assert.ok(await value("SELECT deleted_at FROM public.schedules WHERE id=$1", [linkedSchedule]));
await manage("schedules", linkedSchedule, "restore");
await manage("schedules", linkedSchedule, "trash");
await manage("schedules", linkedSchedule, "permanent");
await db.query("UPDATE public.work_registry SET name='Renamed after removal' WHERE id=$1", [work]);
assert.equal(await value("SELECT count(*)::int FROM public.schedules WHERE work_id=$1", [work]), 0);
assert.equal(
  await value("SELECT count(*)::int FROM public.work_stages WHERE work_id=$1", [work]),
  1,
);
const standalone = await value("SELECT public.create_schedule($1)", [{ name: "Avulso" }]);
await db.query("SELECT public.save_standalone_schedule($1,$2,$3,$4,true)", [
  standalone,
  [
    {
      id: "00000000-0000-0000-0000-000000000010",
      name: "Stage",
      planned_start: "2026-10-25",
      planned_end: "2026-10-26",
    },
  ],
  "",
  "",
]);
await manage("schedules", standalone, "trash");
await manage("schedules", standalone, "permanent");
assert.equal(
  await value("SELECT count(*)::int FROM public.schedule_versions WHERE schedule_id=$1", [
    standalone,
  ]),
  0,
);
await db.query("UPDATE public.work_registry SET client_id=$1 WHERE id=$2", [client, work]);
await manage("people", client, "trash");
await rejects(
  "SELECT public.manage_record_deletion($1,$2,$3)",
  ["people", client, "permanent"],
  /vínculos/,
);
await manage("people", client, "restore");
const removablePerson = await value(
  "INSERT INTO public.people(kind,name) VALUES('cliente','Disposable client') RETURNING id",
);
await manage("people", removablePerson, "trash");
await manage("people", removablePerson, "permanent");
assert.equal(
  await value("SELECT count(*)::int FROM public.people WHERE id=$1", [removablePerson]),
  0,
);
assert.equal(
  await value("SELECT count(*)::int FROM public.record_deletion_log WHERE action='permanent'"),
  7, // 6 desta seção + o contrato gerado de teste (contas da empresa)
);
await db.exec("RESET ROLE");
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [team]);
await db.exec("SET ROLE authenticated");
await rejects(
  "SELECT public.manage_record_deletion($1,$2,$3)",
  ["people", client, "trash"],
  /administrador/,
);
assert.equal(await value("SELECT count(*)::int FROM public.record_deletion_log"), 0);
await db.exec("RESET ROLE");
console.log(
  "PASS: trash/restore, permanent deletion, signed contracts, approved proposals, linked records, schedule versions, no header resurrection and administrator-only access",
);
// Segurança: permissões exatas (o padrão do Supabase liberava tudo), 2FA no banco e anon sem acesso.
const fin = "00000000-0000-0000-0000-000000000004";
await db.query("INSERT INTO auth.users(id,email) VALUES($1,'fin@local')", [fin]);
await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'financeiro')", [fin]);
const as = async (uid, claims = null) => {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
    claims ? JSON.stringify({ sub: uid, role: "authenticated", ...claims }) : "",
  ]);
  await db.exec("SET ROLE authenticated");
};
await as(fin);
for (const [sql, args] of [
  ["DELETE FROM public.financial_settlements WHERE id=$1", [settled]],
  ["UPDATE public.financial_settlements SET amount=1 WHERE id=$1", [settled]],
  ["DELETE FROM public.financial_entries WHERE id=$1", [entry]],
  ["DELETE FROM public.expense_allocations WHERE entry_id=$1", [entry]],
  ["DELETE FROM public.work_openings", []],
  ["DELETE FROM public.work_history", []],
  ["DELETE FROM public.work_registry WHERE id=$1", [work]],
  ["UPDATE public.budget_history SET summary='{}'", []],
  ["TRUNCATE public.financial_settlements", []],
]) {
  await rejects(sql, args, /permission denied/);
}
// Parcelamento trava o grupo (FOR UPDATE) sem precisar de UPDATE liberado nos grupos.
const group = await value(
  `SELECT public.create_financial_installments(gen_random_uuid(),null,'manual','Parcelado','saida','Outros',null,100,$1::jsonb,false,null,null,null,null)`,
  [
    JSON.stringify([
      { amount: 60, due_date: "2026-11-10" },
      { amount: 40, due_date: "2026-12-10" },
    ]),
  ],
);
assert.equal(
  await value("SELECT count(*)::int FROM public.financial_entries WHERE group_id=$1", [group]),
  2,
);
await rejects(
  "UPDATE public.financial_groups SET total=1 WHERE id=$1",
  [group],
  /permission denied/,
);
await as(team);
await rejects("DELETE FROM public.work_stages WHERE work_id=$1", [work], /permission denied/);
await rejects("DELETE FROM public.work_records WHERE work_id=$1", [work], /permission denied/);
await rejects("UPDATE public.profiles SET email='x@evil' WHERE id=$1", [team], /permission denied/);
await db.query("UPDATE public.profiles SET full_name='Equipe' WHERE id=$1", [team]);
await rejects("SELECT public.capture_schedule_version($1,'x')", [work], /permission denied/);
await db.exec("RESET ROLE");
await db.exec("SET ROLE anon");
await rejects("SELECT public.can_see_costs($1)", [admin], /permission denied/);
await rejects("SELECT public.has_role($1,'admin')", [admin], /permission denied/);
await rejects("SELECT count(*) FROM public.people", [], /permission denied/);
await rejects("SELECT nextval('public.budget_number_seq')", [], /permission denied/);
// 2FA: com segundo fator verificado, sessão aal1 não exerce papel (nem lê custos); aal2 sim.
await db.exec("RESET ROLE");
await db.query("INSERT INTO auth.mfa_factors(user_id,status) VALUES($1,'verified')", [fin]);
await as(fin, { aal: "aal1" });
assert.equal(await value("SELECT public.can_see_costs(auth.uid())"), false);
assert.equal(await value("SELECT count(*)::int FROM public.financial_entries"), 0);
await rejects(
  "INSERT INTO public.people(kind,name) VALUES('cliente','Sem 2FA')",
  [],
  /row-level security/i,
);
await as(fin, { aal: "aal2" });
assert.equal(await value("SELECT public.can_see_costs(auth.uid())"), true);
assert.ok((await value("SELECT count(*)::int FROM public.financial_entries")) > 0);
await as(team, { aal: "aal1" }); // sem fator cadastrado: aal1 basta
assert.equal(await value("SELECT public.has_role(auth.uid(),'equipe')"), true);
await db.exec("RESET ROLE");
await db.query("SELECT set_config('request.jwt.claims','',false)");
console.log("PASS: exact grants, anon without access and 2FA enforced by the database");
await db.close();
