-- Endurecimento de segurança (varredura nov/2026).
--
-- 1) Permissões exatas. A imagem do Supabase concede, por padrão, TODOS os privilégios em tabelas,
--    funções e sequências do schema public para anon e authenticated. Com isso os GRANTs estreitos
--    das migrações não valiam nada: a equipe podia apagar etapas/registros e o financeiro podia
--    alterar/apagar baixas, lançamentos, extras e aberturas que deveriam ser imutáveis (a RLS
--    filtrava as linhas, mas não a operação). Aqui o padrão é desligado e cada tabela recebe só as
--    operações previstas. Migração nova que criar tabela precisa do seu GRANT explícito.
-- 2) 2FA também no banco: quem cadastrou o segundo fator só exerce papel (admin/financeiro/equipe)
--    com a sessão em aal2. Antes só a tela e a API exigiam; pelo PostgREST direto dava para pular.
-- 3) Visitante sem login (anon) não executa nenhuma função do schema public.
-- 4) O próprio usuário só altera o nome no perfil (não o e-mail exibido aos administradores).

DO $$
BEGIN
  -- Objetos futuros criados pelas migrações (rodam como postgres).
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
END $$;

-- Objetos existentes: zera e concede só o previsto.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
-- Funções internas (chamadas só por outras funções SECURITY DEFINER).
REVOKE EXECUTE ON FUNCTION public.capture_schedule_version(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_standalone_stages(jsonb) FROM authenticated;

GRANT USAGE ON SEQUENCE public.budget_number_seq TO authenticated;

GRANT INSERT, SELECT ON public.account_transfers TO authenticated;
GRANT INSERT, SELECT ON public.budget_history TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.budget_items TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.budget_sections TO authenticated;
GRANT INSERT, SELECT ON public.budget_versions TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.budgets TO authenticated;
GRANT INSERT, SELECT ON public.catalog_history TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.company_settings TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.contract_clauses TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.contracts TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.cost_categories TO authenticated;
GRANT INSERT, SELECT ON public.expense_allocations TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.financial_accounts TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.financial_entries TO authenticated;
GRANT INSERT, SELECT ON public.financial_groups TO authenticated;
GRANT INSERT, SELECT ON public.financial_settlements TO authenticated;
GRANT INSERT, SELECT ON public.material_movements TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.materials TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.people TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.pricing_settings TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.purchase_lines TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.purchase_orders TO authenticated;
GRANT SELECT ON public.record_deletion_log TO authenticated;
GRANT SELECT ON public.schedule_versions TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.schedules TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.service_materials TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.services TO authenticated;
GRANT SELECT ON public.settlement_account_changes TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.stages TO authenticated;
GRANT DELETE, INSERT, SELECT ON public.user_roles TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.work_checklist_items TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.work_client_materials TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.work_estimates TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.work_extras TO authenticated;
GRANT SELECT ON public.work_history TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.work_issues TO authenticated;
GRANT INSERT, SELECT ON public.work_openings TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.work_records TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.work_registry TO authenticated;
GRANT SELECT ON public.work_schedule_versions TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.work_stage_services TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.work_stage_values TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.work_stages TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.work_task_dependencies TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.work_tasks TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.works TO authenticated;
-- O gatilho de parcelas trava o grupo (SELECT ... FOR UPDATE), o que exige UPDATE no grupo. Em vez
-- de liberar UPDATE nos grupos, o gatilho (só valida, não devolve dados) roda como dono.
ALTER FUNCTION public.guard_installment_entry() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.guard_installment_entry() FROM PUBLIC, anon;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- 2FA no banco ---------------------------------------------------------------------------------
-- Verdadeiro quando não há sessão de usuário (migrações, API interna), quando a sessão já está em
-- aal2 ou quando o usuário não tem segundo fator verificado.
CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  uid uuid;
BEGIN
  IF c IS NULL OR c->>'role' = 'service_role' OR c->>'aal' = 'aal2' THEN
    RETURN true;
  END IF;
  uid := nullif(c->>'sub', '')::uuid;
  IF uid IS NULL THEN
    RETURN true;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = uid AND f.status::text = 'verified'
  );
EXCEPTION WHEN undefined_table THEN
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mfa_satisfied()
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_see_costs(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mfa_satisfied()
     AND EXISTS (
       SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'financeiro')
     )
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_costs(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
