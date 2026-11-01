-- Planejamento (menu Execução): tarefas das obras por dia, com prioridade e dependências
-- ("só começa depois de…"), e Pendências: o que alguém (JMG, cliente, arquiteto, fornecedor,
-- condomínio) precisa resolver, podendo travar uma tarefa. Registros operacionais, sem valores:
-- admin/financeiro e equipe leem e escrevem, como etapas e materiais do cliente. Concluir uma
-- tarefa não altera o avanço das etapas (que continua sendo lançado no cronograma).

CREATE TABLE public.work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.work_registry(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.work_stages(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (nullif(trim(title),'') IS NOT NULL),
  notes text,
  planned_date date,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  responsible text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgente')),
  status text NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer','em_andamento','concluida','cancelada')),
  done_at timestamptz,
  done_by uuid,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_tasks_work_idx ON public.work_tasks(work_id, planned_date);
CREATE INDEX work_tasks_date_idx ON public.work_tasks(planned_date);
CREATE INDEX work_tasks_stage_idx ON public.work_tasks(stage_id);
CREATE INDEX work_tasks_person_idx ON public.work_tasks(person_id);

CREATE TABLE public.work_task_dependencies (
  task_id uuid NOT NULL REFERENCES public.work_tasks(id) ON DELETE CASCADE,
  depends_on_id uuid NOT NULL REFERENCES public.work_tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);
CREATE INDEX work_task_dependencies_dep_idx ON public.work_task_dependencies(depends_on_id);

CREATE TABLE public.work_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.work_registry(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (nullif(trim(title),'') IS NOT NULL),
  notes text,
  owner_kind text NOT NULL DEFAULT 'jmg' CHECK (owner_kind IN ('jmg','cliente','arquiteto','fornecedor','condominio','outro')),
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  responsible text,
  due_date date,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgente')),
  blocks_task_id uuid REFERENCES public.work_tasks(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','resolvida')),
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_issues_work_idx ON public.work_issues(work_id, status, due_date);
CREATE INDEX work_issues_task_idx ON public.work_issues(blocks_task_id);
CREATE INDEX work_issues_person_idx ON public.work_issues(person_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_tasks, public.work_task_dependencies, public.work_issues TO authenticated;
GRANT ALL ON public.work_tasks, public.work_task_dependencies, public.work_issues TO service_role;
ALTER TABLE public.work_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_tasks_access ON public.work_tasks FOR ALL TO authenticated
  USING (public.can_see_costs(auth.uid()) OR public.has_role(auth.uid(),'equipe'))
  WITH CHECK (public.can_see_costs(auth.uid()) OR public.has_role(auth.uid(),'equipe'));
CREATE POLICY work_task_dependencies_access ON public.work_task_dependencies FOR ALL TO authenticated
  USING (public.can_see_costs(auth.uid()) OR public.has_role(auth.uid(),'equipe'))
  WITH CHECK (public.can_see_costs(auth.uid()) OR public.has_role(auth.uid(),'equipe'));
CREATE POLICY work_issues_access ON public.work_issues FOR ALL TO authenticated
  USING (public.can_see_costs(auth.uid()) OR public.has_role(auth.uid(),'equipe'))
  WITH CHECK (public.can_see_costs(auth.uid()) OR public.has_role(auth.uid(),'equipe'));
CREATE TRIGGER work_tasks_audit BEFORE INSERT OR UPDATE ON public.work_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_audit();
CREATE TRIGGER work_issues_audit BEFORE INSERT OR UPDATE ON public.work_issues
  FOR EACH ROW EXECUTE FUNCTION public.touch_audit();

-- Tarefa: etapa da mesma obra; não muda de obra; só conclui quando as anteriores terminaram e
-- nenhuma pendência aberta a trava. Quem concluiu e quando são gravados pelo banco.
CREATE FUNCTION public.guard_work_task() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE blocker text;
BEGIN
 new.title := trim(new.title);
 new.responsible := nullif(trim(coalesce(new.responsible,'')),'');
 IF TG_OP='UPDATE' AND new.work_id<>old.work_id THEN
   RAISE EXCEPTION 'A tarefa não pode mudar de obra.';
 END IF;
 IF new.stage_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.work_stages WHERE id=new.stage_id AND work_id=new.work_id AND NOT removed) THEN
   RAISE EXCEPTION 'A etapa da tarefa deve ser uma etapa ativa da obra.';
 END IF;
 IF new.status='concluida' AND (TG_OP='INSERT' OR old.status<>'concluida') THEN
   SELECT t.title INTO blocker FROM public.work_task_dependencies d
     JOIN public.work_tasks t ON t.id=d.depends_on_id
    WHERE d.task_id=new.id AND t.status NOT IN ('concluida','cancelada') LIMIT 1;
   IF blocker IS NOT NULL THEN
     RAISE EXCEPTION 'Conclua antes a tarefa "%".', blocker;
   END IF;
   SELECT i.title INTO blocker FROM public.work_issues i
    WHERE i.blocks_task_id=new.id AND i.status='aberta' LIMIT 1;
   IF blocker IS NOT NULL THEN
     RAISE EXCEPTION 'Resolva antes a pendência "%".', blocker;
   END IF;
   new.done_at := now();
   new.done_by := auth.uid();
 ELSIF new.status<>'concluida' THEN
   new.done_at := NULL;
   new.done_by := NULL;
 ELSIF TG_OP='UPDATE' THEN
   new.done_at := old.done_at;
   new.done_by := old.done_by;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER work_tasks_guard BEFORE INSERT OR UPDATE ON public.work_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_work_task();

-- Dependência: tarefas da mesma obra e sem ciclo (A depende de B que depende de A).
CREATE FUNCTION public.guard_task_dependency() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (SELECT work_id FROM public.work_tasks WHERE id=new.task_id)
    IS DISTINCT FROM (SELECT work_id FROM public.work_tasks WHERE id=new.depends_on_id) THEN
   RAISE EXCEPTION 'A tarefa anterior deve ser da mesma obra.';
 END IF;
 IF EXISTS(
   WITH RECURSIVE chain(id) AS (
     SELECT new.depends_on_id
     UNION
     SELECT d.depends_on_id FROM public.work_task_dependencies d JOIN chain c ON d.task_id=c.id
   ) SELECT 1 FROM chain WHERE id=new.task_id) THEN
   RAISE EXCEPTION 'Essa dependência faria as tarefas esperarem uma pela outra.';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER work_task_dependencies_guard BEFORE INSERT OR UPDATE ON public.work_task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_dependency();

-- Pendência: tarefa travada da mesma obra; resolver grava quem e quando.
CREATE FUNCTION public.guard_work_issue() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 new.title := trim(new.title);
 new.responsible := nullif(trim(coalesce(new.responsible,'')),'');
 IF TG_OP='UPDATE' AND new.work_id<>old.work_id THEN
   RAISE EXCEPTION 'A pendência não pode mudar de obra.';
 END IF;
 IF new.blocks_task_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.work_tasks WHERE id=new.blocks_task_id AND work_id=new.work_id) THEN
   RAISE EXCEPTION 'A tarefa travada deve ser da mesma obra.';
 END IF;
 IF new.status='resolvida' AND (TG_OP='INSERT' OR old.status<>'resolvida') THEN
   new.resolved_at := now();
   new.resolved_by := auth.uid();
 ELSIF new.status='aberta' THEN
   new.resolved_at := NULL;
   new.resolved_by := NULL;
 ELSIF TG_OP='UPDATE' THEN
   new.resolved_at := old.resolved_at;
   new.resolved_by := old.resolved_by;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER work_issues_guard BEFORE INSERT OR UPDATE ON public.work_issues
  FOR EACH ROW EXECUTE FUNCTION public.guard_work_issue();

-- Auditoria em work_history, como etapas, checklist e materiais do cliente.
CREATE FUNCTION public.log_planning_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.work_history(work_id,entity,entity_id,before,after)
 VALUES(coalesce(new.work_id,old.work_id),TG_TABLE_NAME,coalesce(new.id,old.id),
   CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(old) END,
   CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(new) END);
 RETURN coalesce(new,old);
END $$;
CREATE TRIGGER work_tasks_history AFTER INSERT OR UPDATE OR DELETE ON public.work_tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_planning_change();
CREATE TRIGGER work_issues_history AFTER INSERT OR UPDATE OR DELETE ON public.work_issues
  FOR EACH ROW EXECUTE FUNCTION public.log_planning_change();

NOTIFY pgrst, 'reload schema';
