import { supabase } from "@/integrations/supabase/client";
import { loadBudget, type Budget } from "./budget-data";
import { emptyParams, computeBudget, directContractBase } from "./pricing";
import { budgetStageServices, stageCosts } from "./operations";
import { valueWeights } from "./work-progress";
import { syncStageProgress } from "./stage-services-data";
import { businessDate } from "./dashboard-math";
import { stageDates } from "./proposal";
import {
  contractInstallmentPlan,
  matchExisting,
  stageWindows,
  type PlannedInstallment,
} from "./contract-installments";

/** Converte orçamento aprovado em obra levando, para cada etapa, os serviços com o custo
 * previsto de mão de obra e materiais (calculado por computeBudget). */
export async function convertBudgetToWork(budgetId: string) {
  const b = await loadBudget(budgetId);
  const result = computeBudget(b.items, b.params, b.budget.general_discount);
  const r = await supabase.rpc("convert_budget", {
    _budget_id: budgetId,
    _services: budgetStageServices(result.items),
  });
  if (r.error) throw r.error;
  await applyValueWeights(r.data);
  // Parcelas do orçamento já entram como contas a receber (R0-2). Se não der (condições que não
  // somam 100%, sem permissão), a obra é criada do mesmo jeito e a Visão geral oferece o botão.
  try {
    const draft = await contractInstallmentDraft(r.data);
    if (draft.plan.length && !draft.generated && !draft.existing.length)
      await createContractInstallments(r.data, draft.plan, crypto.randomUUID());
  } catch (e) {
    console.warn("Parcelas do contrato não geradas na conversão.", e);
  }
  return r.data;
}

export type InstallmentDraftRow = PlannedInstallment & { matchedEntryId: string | null };

/**
 * Parcelas do contrato de uma obra vinda de orçamento: valores e vencimentos das condições de
 * pagamento (datas das etapas da obra) e as entradas já lançadas à mão que batem com alguma.
 */
export async function contractInstallmentDraft(workId: string) {
  const wr = await supabase.from("work_registry").select("*").eq("id", workId).single();
  if (wr.error) throw wr.error;
  const [groups, entries, stages] = await Promise.all([
    supabase.from("financial_groups").select("id").eq("work_id", workId).eq("source", "contract"),
    supabase
      .from("financial_entries")
      .select("id, amount, description, due_date, group_id")
      .eq("work_id", workId)
      .eq("direction", "entrada")
      .eq("canceled", false),
    supabase
      .from("work_stages")
      .select("budget_section_id, planned_start, planned_end")
      .eq("work_id", workId)
      .eq("removed", false),
  ]);
  if (groups.error) throw groups.error;
  if (entries.error) throw entries.error;
  if (stages.error) throw stages.error;
  const generated = groups.data.length > 0;
  const existing = entries.data.filter((e) => !e.group_id);
  const empty = { generated, existing, plan: [] as InstallmentDraftRow[], total: 0, terms: 0 };
  if (!wr.data.linked_budget_id) return empty;
  const b = await loadBudget(wr.data.linked_budget_id);
  const total = computeBudget(b.items, b.params, b.budget.general_discount).saleNet;
  const fallback = b.budget.start_date ? stageDates(b.budget.start_date, b.sections) : [];
  const windows = stageWindows(b.sections, stages.data, fallback);
  const ends = windows.map((w) => w.end).filter((d): d is string => !!d);
  const plan = contractInstallmentPlan(total, b.terms, {
    approval: (b.budget.approval_date ?? businessDate()).slice(0, 10),
    stages: windows,
    end: wr.data.planned_end ?? (ends.length ? [...ends].sort().at(-1)! : null),
  });
  const matched = matchExisting(plan, existing);
  return {
    ...empty,
    total,
    terms: b.terms.length,
    plan: plan.map((p, i) => ({ ...p, matchedEntryId: matched[i] ?? null })),
  };
}

/** Grava as parcelas do contrato como contas a receber da obra (uma geração por obra). */
export async function createContractInstallments(
  workId: string,
  rows: Pick<PlannedInstallment, "description" | "amount" | "due_date" | "when">[],
  requestId: string,
) {
  const r = await supabase.rpc("create_contract_installments", {
    _request_id: requestId,
    _work_id: workId,
    _rows: rows.map((row) => ({
      description: row.description,
      amount: row.amount,
      due_date: row.due_date,
      notes: row.when || null,
    })),
  });
  if (r.error) throw r.error;
  return r.data;
}
/** Revisão aprovada: atualiza os serviços das etapas da obra ligada (custo de MO e materiais por
 * item, via computeBudget) e recalcula o avanço das etapas. Devolve a obra, ou null se não há. */
export async function syncBudgetStages(budgetId: string) {
  const b = await loadBudget(budgetId);
  const result = computeBudget(b.items, b.params, b.budget.general_discount);
  const r = await supabase.rpc("sync_budget_stage_services", {
    _budget_id: budgetId,
    _services: budgetStageServices(result.items),
  });
  if (r.error) throw r.error;
  const workId = r.data;
  if (!workId) return null;
  const [stages, services] = await Promise.all([
    supabase.from("work_stages").select("*").eq("work_id", workId).eq("removed", false),
    supabase.from("work_stage_services").select("*").eq("work_id", workId),
  ]);
  if (stages.error) throw stages.error;
  if (services.error) throw services.error;
  for (const st of stages.data)
    await syncStageProgress(
      st,
      services.data.filter((s) => s.stage_id === st.id),
    );
  await applyValueWeights(workId);
  return workId;
}

/** Avanço (% da obra) de cada etapa proporcional ao valor previsto (serviços ou valor digitado).
 * Usado quando o orçamento vira obra e quando uma revisão aprovada atualiza as etapas. */
export async function applyValueWeights(workId: string) {
  const [stages, services, values] = await Promise.all([
    supabase.from("work_stages").select("id, weight").eq("work_id", workId).eq("removed", false),
    supabase
      .from("work_stage_services")
      .select("stage_id, labor_planned, material_planned")
      .eq("work_id", workId),
    supabase.from("work_stage_values").select("*").eq("work_id", workId),
  ]);
  if (stages.error) throw stages.error;
  if (services.error) throw services.error;
  if (values.error) throw values.error;
  const weights = valueWeights(
    stages.data.map((st) => ({
      id: st.id,
      value: stageCosts(
        st.id,
        services.data,
        [],
        [],
        values.data.find((v) => v.stage_id === st.id),
      ).planned,
    })),
  );
  if (!weights) return;
  for (const st of stages.data) {
    const weight = weights.get(st.id) ?? 0;
    if (weight === Number(st.weight)) continue;
    const r = await supabase.from("work_stages").update({ weight }).eq("id", st.id);
    if (r.error) throw r.error;
  }
}

export async function loadWorkBudget(workId: string) {
  const wr = await supabase.from("work_registry").select("*").eq("id", workId).single();
  if (wr.error) throw wr.error;
  const w = wr.data;
  if (w.linked_budget_id) return loadBudget(w.linked_budget_id);
  const op = await supabase.from("work_openings").select("*").eq("work_id", workId).single();
  if (op.error) throw op.error;
  // In-memory display adapter only: never inserts a fictitious budget or invents markup/tax rates.
  const budget: Budget = {
    id: workId,
    number: 0,
    revision: 0,
    parent_budget_id: null,
    superseded_by: null,
    refusal_reason: null,
    title: w.name,
    client_id: w.client_id,
    architect_id: w.architect_id,
    client_display: null,
    endereco: w.address,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    status: "aprovado",
    issue_date: op.data.reference_date,
    validity_date: null,
    estimated_term: null,
    params: {},
    general_discount: 0,
    payment_terms: [],
    notes: w.notes,
    exclusions: null,
    closing_text: null,
    archived: w.archived,
    created_by: w.created_by,
    updated_by: w.updated_by,
    created_at: w.created_at,
    updated_at: w.updated_at,
    approval_date: null,
    approval_path: null,
    deleted_at: null,
    deleted_by: null,
    responsible: w.responsible ?? null,
    start_date: null,
    estimated_weeks: null,
    property_type: null,
    property_area: null,
    description: null,
  };
  return {
    budget,
    params: emptyParams,
    terms: [],
    sections: [],
    items: [],
    directValue: op.data.original_value,
    paymentConditions: w.payment_conditions,
    scope: w.notes,
  };
}
export function workBase(b: Awaited<ReturnType<typeof loadWorkBudget>>) {
  const r = computeBudget(b.items, b.params, b.budget.general_discount);
  if ("directValue" in b) return directContractBase(b.directValue);
  return r;
}
