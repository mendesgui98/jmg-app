-- Recarrega o cache da API do banco (PostgREST) depois da troca de assinatura de
-- register_generated_contract (parâmetro _account_id, migração 20261101000039). Sem mudança de schema.
NOTIFY pgrst, 'reload schema';
