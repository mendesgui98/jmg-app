-- Custos fixos e Caixa da Estrutura (Financeiro › Estrutura).
-- Um custo fixo é um modelo (aluguel, pró-labore, contas, sistemas...) que gera, mês a mês, uma
-- conta a pagar comum da empresa (financial_entries sem obra, categoria "Custo fixo"). Pagamento,
-- boleto e comprovante seguem o Financeiro (baixa com conta, anexos no bucket privado). O caixa da
-- estrutura é calculado no app a partir dos recebimentos (parte de estrutura de cada orçamento) e
-- das saídas gerais pagas, nunca digitado à mão.

CREATE TABLE public.fixed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  category text NOT NULL DEFAULT 'outros'
    CHECK (category IN ('ocupacao','utilidades','pessoal','sistemas','servicos','impostos_taxas','veiculo','outros')),
  amount numeric NOT NULL CHECK (amount > 0),
  recurrence text NOT NULL DEFAULT 'mensal' CHECK (recurrence IN ('mensal','trimestral','anual')),
  due_day int NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 31),
  -- Mês do vencimento dos anuais (e do primeiro dos trimestrais).
  due_month int CHECK (due_month BETWEEN 1 AND 12),
  variable boolean NOT NULL DEFAULT false,
  supplier_id uuid REFERENCES public.people(id),
  payment_method text,
  active boolean NOT NULL DEFAULT true,
  starts_on date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  ends_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (recurrence = 'mensal' OR due_month IS NOT NULL),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixed_costs_access ON public.fixed_costs FOR ALL TO authenticated
  USING (public.can_see_costs(auth.uid())) WITH CHECK (public.can_see_costs(auth.uid()));
CREATE TRIGGER fixed_costs_audit BEFORE INSERT OR UPDATE ON public.fixed_costs
  FOR EACH ROW EXECUTE FUNCTION public.touch_audit();
-- Custo fixo não é apagado (as contas geradas apontam para ele): desativa-se.
GRANT SELECT, INSERT, UPDATE ON public.fixed_costs TO authenticated;
GRANT ALL ON public.fixed_costs TO service_role;

-- Conta do mês gerada por um custo fixo: competência AAAA-MM, uma só por custo e mês.
ALTER TABLE public.financial_entries
  ADD COLUMN fixed_cost_id uuid REFERENCES public.fixed_costs(id),
  ADD COLUMN competence text CHECK (competence ~ '^\d{4}-(0[1-9]|1[0-2])$');
CREATE UNIQUE INDEX financial_entries_fixed_cost_month
  ON public.financial_entries(fixed_cost_id, competence) WHERE fixed_cost_id IS NOT NULL;

-- Gera as contas a pagar do mês de `_month` para cada custo fixo ativo (idempotente).
-- Valor variável (luz, água): média das 3 últimas contas pagas desse custo, ou o valor previsto.
CREATE OR REPLACE FUNCTION public.generate_fixed_cost_entries(_month date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  c public.fixed_costs;
  ym text := to_char(_month, 'YYYY-MM');
  first date := date_trunc('month', _month)::date;
  last date := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
  m int := extract(month FROM _month)::int;
  due date;
  value numeric;
  n integer := 0;
BEGIN
  IF NOT public.can_see_costs(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  FOR c IN
    SELECT * FROM public.fixed_costs
    WHERE active AND starts_on <= last AND (ends_on IS NULL OR ends_on >= first)
  LOOP
    CONTINUE WHEN c.recurrence = 'anual' AND m <> c.due_month;
    CONTINUE WHEN c.recurrence = 'trimestral' AND ((m - c.due_month + 12) % 3) <> 0;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.financial_entries WHERE fixed_cost_id = c.id AND competence = ym
    );
    due := first + (least(c.due_day, extract(day FROM last)::int) - 1);
    value := c.amount;
    IF c.variable THEN
      SELECT coalesce(avg(x.paid), c.amount) INTO value FROM (
        SELECT sum(s.amount) AS paid
        FROM public.financial_entries e JOIN public.financial_settlements s ON s.entry_id = e.id
        WHERE e.fixed_cost_id = c.id AND NOT e.canceled
        GROUP BY e.id, e.competence ORDER BY e.competence DESC LIMIT 3
      ) x;
    END IF;
    INSERT INTO public.financial_entries(
      work_id, direction, category, description, person_id, amount, due_date,
      incurred, payment_method, fixed_cost_id, competence
    ) VALUES (
      NULL, 'saida', 'Custo fixo', c.name, c.supplier_id, round(value, 2), due,
      true, c.payment_method, c.id, ym
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.generate_fixed_cost_entries(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_fixed_cost_entries(date) TO authenticated;

INSERT INTO public.cost_categories(name)
SELECT 'Custo fixo' WHERE NOT EXISTS (SELECT 1 FROM public.cost_categories WHERE name = 'Custo fixo');

NOTIFY pgrst, 'reload schema';
