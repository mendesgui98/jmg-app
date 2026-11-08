-- Parcelas do contrato a partir das condições de pagamento do orçamento (roteiro R0-2).
-- Cada parcela vira uma conta a receber da obra com descrição própria ("Entrada na assinatura",
-- "1ª medição"…). Diferente de create_financial_installments, aceita obra que já tem entradas
-- lançadas à mão: a tela marca as parcelas já lançadas e manda só as que faltam.
CREATE OR REPLACE FUNCTION public.create_contract_installments(_request_id uuid, _work_id uuid, _rows jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  r jsonb;
  n integer;
  idx integer := 0;
  total numeric;
  existing uuid;
  client uuid;
BEGIN
  IF NOT public.can_see_costs(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF _request_id IS NULL OR _work_id IS NULL THEN RAISE EXCEPTION 'Selecione a obra.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 0));
  SELECT id INTO existing FROM public.financial_groups WHERE id = _request_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  -- Uma geração por obra de cada vez.
  PERFORM pg_advisory_xact_lock(hashtextextended(_work_id::text, 46));
  SELECT client_id INTO client FROM public.work_registry WHERE id = _work_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obra não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.financial_groups WHERE work_id = _work_id AND source = 'contract') THEN
    RAISE EXCEPTION 'As parcelas do contrato desta obra já foram geradas.';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' THEN RAISE EXCEPTION 'Parcelas inválidas.'; END IF;
  n := jsonb_array_length(_rows);
  IF n < 1 OR n > 120 THEN RAISE EXCEPTION 'Informe entre 1 e 120 parcelas.'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    IF coalesce((r->>'amount')::numeric, 0) <= 0
       OR round((r->>'amount')::numeric, 2) <> (r->>'amount')::numeric
       OR nullif(r->>'due_date', '') IS NULL
       OR nullif(trim(r->>'description'), '') IS NULL THEN
      RAISE EXCEPTION 'Informe descrição, valor positivo (em centavos) e vencimento de cada parcela.';
    END IF;
  END LOOP;
  SELECT sum((value->>'amount')::numeric) INTO total FROM jsonb_array_elements(_rows);
  INSERT INTO public.financial_groups(id, work_id, source, total) VALUES (_request_id, _work_id, 'contract', total);
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    idx := idx + 1;
    INSERT INTO public.financial_entries(work_id, group_id, description, direction, category, person_id,
      amount, due_date, incurred, installment_index, installment_count, notes)
    VALUES (_work_id, _request_id, trim(r->>'description'), 'entrada', 'Contrato', client,
      (r->>'amount')::numeric, (r->>'due_date')::date, false, idx, n, nullif(trim(r->>'notes'), ''));
  END LOOP;
  RETURN _request_id;
END $$;
REVOKE ALL ON FUNCTION public.create_contract_installments(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contract_installments(uuid, uuid, jsonb) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
