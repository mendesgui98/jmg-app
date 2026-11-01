import { supabase } from "@/integrations/supabase/client";

// Consulta única do módulo financeiro (lançamentos, baixas, contas, transferências e rateios).
// Contas vêm todas (inativas também, para o saldo e o nome nas movimentações antigas); os
// seletores de lançamento mostram só as ativas.
export const financeOptions = {
  queryKey: ["finance"],
  queryFn: async () => {
    const [e, s, a, t, w, p, c, l, op] = await Promise.all([
      supabase.from("financial_entries").select("*").order("due_date"),
      supabase.from("financial_settlements").select("*"),
      supabase.from("financial_accounts").select("*").order("created_at"),
      supabase.from("account_transfers").select("*"),
      supabase.from("work_registry").select("id,name,deleted_at"),
      supabase.from("people").select("id,name,deleted_at"),
      supabase.from("cost_categories").select("name").eq("active", true),
      supabase.from("expense_allocations").select("*"),
      supabase.from("work_openings").select("*"),
    ]);
    for (const r of [e, s, a, t, w, p, c, l, op]) if (r.error) throw r.error;
    return {
      entries: e.data ?? [],
      settlements: s.data ?? [],
      accounts: a.data ?? [],
      transfers: t.data ?? [],
      works: w.data ?? [],
      people: p.data ?? [],
      categories: c.data ?? [],
      allocations: l.data ?? [],
      openings: op.data ?? [],
    };
  },
};

// Contas ativas para escolher a conta do contrato.
export const contractAccountsOptions = {
  queryKey: ["contract-accounts"],
  queryFn: async () => {
    const r = await supabase
      .from("financial_accounts")
      .select("*")
      .eq("active", true)
      .order("created_at");
    if (r.error) throw r.error;
    return r.data;
  },
};
