-- Datas de negócio no horário de Brasília. `current_date` usa o fuso do servidor (UTC): um
-- orçamento criado depois das 21h saía com a emissão do dia seguinte (e, em 31/12 à noite, com o
-- número do ano seguinte). Os padrões passam a usar a data de São Paulo.
ALTER TABLE public.budgets
  ALTER COLUMN issue_date SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
ALTER TABLE public.materials
  ALTER COLUMN price_updated_at SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
ALTER TABLE public.work_records
  ALTER COLUMN record_date SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
ALTER TABLE public.material_movements
  ALTER COLUMN record_date SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
