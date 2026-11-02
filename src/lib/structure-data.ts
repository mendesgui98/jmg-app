import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type FixedCost = Database["public"]["Tables"]["fixed_costs"]["Row"];

// Custos fixos cadastrados, o % de estrutura padrão e os fornecedores/prestadores (para o campo
// "Fornecedor"). Recebimentos, contas e obras vêm das consultas do Financeiro e do Painel.
export const structureOptions = queryOptions({
  queryKey: ["structure"],
  queryFn: async () => {
    const [c, p, s] = await Promise.all([
      supabase.from("fixed_costs").select("*").order("name"),
      supabase
        .from("people")
        .select("id,name,kind,deleted_at")
        .in("kind", ["fornecedor", "prestador"])
        .is("deleted_at", null)
        .order("name"),
      supabase.from("pricing_settings").select("structure_rate").limit(1).maybeSingle(),
    ]);
    for (const r of [c, p, s]) if (r.error) throw r.error;
    return {
      costs: c.data ?? [],
      suppliers: p.data ?? [],
      structureRate: Number(s.data?.structure_rate) || 0,
    };
  },
});
