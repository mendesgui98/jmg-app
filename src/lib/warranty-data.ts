import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Warranty = Database["public"]["Tables"]["warranties"]["Row"];
export type WarrantyClaim = Database["public"]["Tables"]["warranty_claims"]["Row"];
export type WarrantyVisit = Database["public"]["Tables"]["warranty_visits"]["Row"];

// Consulta única da Garantia (menu, aba da obra e Painel). Operacional: a equipe também lê; os
// custos (contas a pagar ligadas aos chamados) só voltam para quem vê custos (RLS do Financeiro).
export const warrantyOptions = queryOptions({
  queryKey: ["warranty"],
  queryFn: async () => {
    const [w, c, v, works, people, stages, costs] = await Promise.all([
      supabase.from("warranties").select("*").order("end_date"),
      supabase.from("warranty_claims").select("*").order("reported_at", { ascending: false }),
      supabase.from("warranty_visits").select("*").order("visit_date"),
      supabase
        .from("work_registry")
        .select("id,name,status,address,client_id,actual_end,planned_end,deleted_at")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("people")
        .select("id,name,kind,phone,deleted_at")
        .is("deleted_at", null)
        .order("name"),
      supabase.from("stages").select("id,name,active,sort").order("sort").order("name"),
      supabase
        .from("financial_entries")
        .select("id,warranty_claim_id,amount,canceled,description,due_date")
        .not("warranty_claim_id", "is", null)
        .eq("canceled", false),
    ]);
    for (const x of [w, c, v, works, people, stages, costs]) if (x.error) throw x.error;
    const workIds = [...new Set((w.data ?? []).map((x) => x.work_id).filter(Boolean))] as string[];
    const ws = workIds.length
      ? await supabase
          .from("work_stages")
          .select("id,work_id,name,sort,removed")
          .in("work_id", workIds)
          .eq("removed", false)
          .order("sort")
      : { data: [], error: null };
    if (ws.error) throw ws.error;
    const liveWorks = new Set((works.data ?? []).map((x) => x.id));
    // Garantia de obra que foi para a lixeira some junto com a obra.
    const warranties = (w.data ?? []).filter((x) => !x.work_id || liveWorks.has(x.work_id));
    const ids = new Set(warranties.map((x) => x.id));
    const claims = (c.data ?? []).filter((x) => ids.has(x.warranty_id));
    const claimIds = new Set(claims.map((x) => x.id));
    return {
      warranties,
      claims,
      visits: (v.data ?? []).filter((x) => claimIds.has(x.claim_id)),
      works: works.data ?? [],
      people: people.data ?? [],
      stages: stages.data ?? [],
      workStages: ws.data ?? [],
      costs: costs.data ?? [],
    };
  },
});

export type WarrantyData = Awaited<ReturnType<NonNullable<typeof warrantyOptions.queryFn>>>;

/** Nome, cliente e endereço da garantia (da obra da plataforma ou do cadastro avulso). */
export function warrantyInfo(w: Warranty, data: Pick<WarrantyData, "works" | "people">) {
  const work = w.work_id ? data.works.find((x) => x.id === w.work_id) : undefined;
  const clientId = work?.client_id ?? w.client_id;
  return {
    name: work?.name ?? w.name ?? "Obra",
    client: data.people.find((p) => p.id === clientId)?.name ?? null,
    address: work?.address ?? w.address ?? null,
    work,
    legacy: !w.work_id,
  };
}

/** Custo lançado por chamado (contas a pagar ligadas, sem canceladas). */
export function claimCosts(data: Pick<WarrantyData, "costs">) {
  const m = new Map<string, number>();
  for (const e of data.costs)
    if (e.warranty_claim_id)
      m.set(e.warranty_claim_id, (m.get(e.warranty_claim_id) ?? 0) + Number(e.amount));
  return m;
}

export const stageNameOf = (data: Pick<WarrantyData, "stages">) => (id: string | null) =>
  (id && data.stages.find((s) => s.id === id)?.name) || "Sem etapa";

export const executorNameOf =
  (data: Pick<WarrantyData, "people">) => (kind: string, id: string | null) =>
    kind === "equipe"
      ? "Equipe própria"
      : (id && data.people.find((p) => p.id === id)?.name) || "Prestador não informado";
