-- Contas da empresa: dados bancários nas contas, conta obrigatória em toda movimentação nova,
-- correção da conta de movimentações antigas e escolha da conta que vai no contrato.

-- 1) Dados bancários e conta padrão do contrato.
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'corrente',
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS agency text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS holder text,
  ADD COLUMN IF NOT EXISTS holder_document text,
  ADD COLUMN IF NOT EXISTS pix_key_type text,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS is_contract_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_kind_check;
ALTER TABLE public.financial_accounts ADD CONSTRAINT financial_accounts_kind_check
  CHECK (kind IN ('corrente','poupanca','caixa'));
ALTER TABLE public.financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_pix_type_check;
ALTER TABLE public.financial_accounts ADD CONSTRAINT financial_accounts_pix_type_check
  CHECK (pix_key_type IS NULL OR pix_key_type IN ('cnpj','cpf','email','telefone','aleatoria'));
CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_one_contract_default
  ON public.financial_accounts ((true)) WHERE is_contract_default;
COMMENT ON COLUMN public.financial_accounts.is_contract_default IS
  'Conta que vem marcada ao gerar um contrato (no máximo uma).';

-- Caixa em dinheiro não tem dados bancários nem pode ser a padrão do contrato; conta padrão ativa.
CREATE OR REPLACE FUNCTION public.guard_financial_account() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  new.name := trim(new.name);
  IF new.name = '' THEN RAISE EXCEPTION 'Informe o nome da conta.'; END IF;
  IF new.kind = 'caixa' THEN
    new.bank := NULL; new.agency := NULL; new.account_number := NULL;
    new.pix_key_type := NULL; new.pix_key := NULL; new.is_contract_default := false;
  END IF;
  IF NOT new.active THEN new.is_contract_default := false; END IF;
  IF new.is_contract_default AND nullif(trim(coalesce(new.pix_key,'')),'') IS NULL
     AND (nullif(trim(coalesce(new.bank,'')),'') IS NULL OR nullif(trim(coalesce(new.account_number,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'A conta do contrato precisa de banco e conta ou de uma chave PIX.';
  END IF;
  -- Marcar uma conta como padrão desmarca a anterior.
  IF new.is_contract_default AND (TG_OP='INSERT' OR NOT old.is_contract_default) THEN
    UPDATE public.financial_accounts SET is_contract_default=false WHERE is_contract_default AND id<>new.id;
  END IF;
  new.updated_at := now();
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS financial_accounts_guard ON public.financial_accounts;
CREATE TRIGGER financial_accounts_guard BEFORE INSERT OR UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_account();

-- Conta atual da JMG (Banco C6, que até aqui estava fixa no código do contrato e do recibo):
-- completa uma conta "C6" já cadastrada ou cria a conta quando ainda não há nenhuma.
DO $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.financial_accounts WHERE active AND name ILIKE '%c6%' ORDER BY created_at LIMIT 1;
  IF cid IS NULL AND NOT EXISTS(SELECT 1 FROM public.financial_accounts) THEN
    INSERT INTO public.financial_accounts(name) VALUES('C6 Empresa') RETURNING id INTO cid;
  END IF;
  IF cid IS NOT NULL THEN
    UPDATE public.financial_accounts SET kind='corrente',
      bank=coalesce(bank,'Banco C6'), agency=coalesce(agency,'0001'), account_number=coalesce(account_number,'39813290-9'),
      holder=coalesce(holder,'JMG Reformas LTDA'), holder_document=coalesce(holder_document,'62.780.542/0001-81'),
      pix_key_type=coalesce(pix_key_type,'cnpj'), pix_key=coalesce(pix_key,'62.780.542/0001-81'),
      is_contract_default=NOT EXISTS(SELECT 1 FROM public.financial_accounts WHERE is_contract_default AND id<>cid)
    WHERE id=cid;
  END IF;
END $$;

-- 2) Toda movimentação nova (baixa ou lançamento à vista) informa a conta, ativa.
CREATE OR REPLACE FUNCTION public.require_settlement_account() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF new.account_id IS NULL THEN
    RAISE EXCEPTION 'Selecione a conta em que o dinheiro entrou ou de onde saiu.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.financial_accounts WHERE id=new.account_id AND active) THEN
    RAISE EXCEPTION 'Conta inativa ou inexistente.';
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS settlements_require_account ON public.financial_settlements;
CREATE TRIGGER settlements_require_account BEFORE INSERT ON public.financial_settlements
  FOR EACH ROW EXECUTE FUNCTION public.require_settlement_account();

CREATE OR REPLACE FUNCTION public.register_cash_movement(
  _request_id uuid, _direction text, _movement_date date, _description text, _amount numeric,
  _category text, _payment_method text, _account_id uuid, _work_id uuid, _person_id uuid, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT public.can_see_costs(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,0));
 IF EXISTS(SELECT 1 FROM public.financial_entries WHERE id=_request_id) THEN RETURN _request_id; END IF;
 IF _direction NOT IN ('entrada','saida') OR coalesce(_amount,0)<=0 OR _movement_date IS NULL OR nullif(trim(_description),'') IS NULL THEN
   RAISE EXCEPTION 'Informe tipo, data, descrição e valor.';
 END IF;
 IF _account_id IS NULL THEN RAISE EXCEPTION 'Selecione a conta em que o dinheiro entrou ou de onde saiu.'; END IF;
 IF _direction='entrada' AND _work_id IS NULL THEN RAISE EXCEPTION 'Selecione a obra do recebimento.'; END IF;
 INSERT INTO public.financial_entries(id,work_id,description,direction,category,person_id,amount,due_date,incurred,payment_method,notes,cash_only)
 VALUES(_request_id,_work_id,trim(_description),_direction,coalesce(nullif(_category,''),'Outras'),_person_id,_amount,_movement_date,_direction='saida',nullif(_payment_method,''),nullif(_notes,''),true);
 INSERT INTO public.financial_settlements(entry_id,account_id,amount,paid_date,payment_method,notes)
 VALUES(_request_id,_account_id,_amount,_movement_date,nullif(_payment_method,''),nullif(_notes,''));
 RETURN _request_id;
END $$;

-- 3) Corrigir a conta de uma movimentação já lançada (acerta o saldo das contas), com registro
-- do valor anterior. Só a conta muda; valor, data e lançamento ficam como estão.
CREATE TABLE IF NOT EXISTS public.settlement_account_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.financial_settlements(id) ON DELETE CASCADE,
  old_account_id uuid REFERENCES public.financial_accounts(id),
  new_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  changed_by uuid DEFAULT auth.uid(),
  changed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS settlement_account_changes_settlement_idx ON public.settlement_account_changes(settlement_id);
CREATE INDEX IF NOT EXISTS settlement_account_changes_old_idx ON public.settlement_account_changes(old_account_id);
CREATE INDEX IF NOT EXISTS settlement_account_changes_new_idx ON public.settlement_account_changes(new_account_id);
ALTER TABLE public.settlement_account_changes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.settlement_account_changes TO authenticated; GRANT ALL ON public.settlement_account_changes TO service_role;
CREATE POLICY settlement_account_changes_read ON public.settlement_account_changes FOR SELECT TO authenticated
  USING (public.can_see_costs(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_settlement_account(_settlement_id uuid, _account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.financial_settlements; BEGIN
 IF NOT public.can_see_costs(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF _account_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.financial_accounts WHERE id=_account_id AND active) THEN
   RAISE EXCEPTION 'Selecione uma conta ativa.';
 END IF;
 SELECT * INTO s FROM public.financial_settlements WHERE id=_settlement_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimentação não encontrada.'; END IF;
 IF s.account_id IS NOT DISTINCT FROM _account_id THEN RETURN; END IF;
 INSERT INTO public.settlement_account_changes(settlement_id,old_account_id,new_account_id)
 VALUES(s.id,s.account_id,_account_id);
 UPDATE public.financial_settlements SET account_id=_account_id WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.set_settlement_account(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_settlement_account(uuid,uuid) TO authenticated;

-- 4) Conta escolhida no contrato: referência e cópia dos dados no momento da geração (editar a
-- conta depois não muda contrato já gerado).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.financial_accounts(id),
  ADD COLUMN IF NOT EXISTS bank_account jsonb;
CREATE INDEX IF NOT EXISTS contracts_bank_account_idx ON public.contracts(bank_account_id);

DROP FUNCTION IF EXISTS public.register_generated_contract(uuid,text,text);
CREATE OR REPLACE FUNCTION public.register_generated_contract(_budget_id uuid, _path text, _code text, _account_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wid uuid; cid uuid; st text; acc jsonb;
BEGIN
  IF NOT public.can_see_costs(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.budgets WHERE id=_budget_id AND status='aprovado') THEN
    RAISE EXCEPTION 'O contrato só é gerado para orçamento aprovado.';
  END IF;
  IF _account_id IS NOT NULL THEN
    SELECT jsonb_build_object('name',name,'bank',bank,'agency',agency,'account_number',account_number,
      'holder',holder,'holder_document',holder_document,'pix_key_type',pix_key_type,'pix_key',pix_key)
      INTO acc FROM public.financial_accounts WHERE id=_account_id AND kind<>'caixa';
    IF acc IS NULL THEN RAISE EXCEPTION 'Conta do contrato inválida.'; END IF;
  END IF;
  SELECT id INTO wid FROM public.work_registry WHERE linked_budget_id=_budget_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  IF wid IS NULL THEN RETURN NULL; END IF;
  SELECT id, status INTO cid, st FROM public.contracts WHERE work_id=wid FOR UPDATE;
  IF st='assinado' THEN RETURN cid; END IF;
  IF cid IS NULL THEN
    INSERT INTO public.contracts(work_id,budget_id,code,generated_path,generated_at,status,created_by,bank_account_id,bank_account)
    VALUES(wid,_budget_id,_code,_path,now(),'aguardando_assinatura',auth.uid(),_account_id,acc) RETURNING id INTO cid;
  ELSE
    UPDATE public.contracts SET budget_id=_budget_id, code=_code, generated_path=_path, generated_at=now(),
      bank_account_id=_account_id, bank_account=acc, deleted_at=NULL, deleted_by=NULL
    WHERE id=cid;
  END IF;
  RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.register_generated_contract(uuid,text,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_generated_contract(uuid,text,text,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
