import type { WorkSummary } from "./dashboard-data";
import type { Database } from "@/integrations/supabase/types";
import { entryState, inPeriod, periodRange } from "./dashboard-math";
export type ExecutiveFilter = {
  period?: string;
  from?: string;
  to?: string;
  work?: string;
  client?: string;
  status?: string;
  pilot?: boolean;
};
export type Indicator =
  | "active"
  | "value"
  | "extras"
  | "received"
  | "receivable"
  | "spent"
  | "payable"
  | "cash"
  | "result";
export type CompositionRow = {
  id: string;
  workId: string | null;
  personId?: string | null;
  work: string;
  client: string;
  description: string;
  date: string | null;
  amount: number | null;
  status: string;
  installment?: string;
  method?: string | null;
  entryId?: string;
  recordId?: string;
  tab: string;
  paid?: number | null;
  pending?: number | null;
};
type Entry = Database["public"]["Tables"]["financial_entries"]["Row"];
type Settlement = Database["public"]["Tables"]["financial_settlements"]["Row"];
export type ExecutiveData = {
  works: WorkSummary[];
  finance: {
    entries: Entry[];
    settlements: Settlement[];
    people: { id: string; name: string }[];
    /** Contas da empresa: o saldo inicial delas entra no caixa da empresa (como no Financeiro). */
    accounts?: { opening_balance: number }[];
  };
};
export function selectWorks(works: WorkSummary[], filter: ExecutiveFilter) {
  return works.filter(
    (s) =>
      (filter.pilot || !s.work.is_pilot) &&
      (!filter.work || s.work.id === filter.work) &&
      (!filter.client || s.work.client_id === filter.client) &&
      (!filter.status || s.work.status === filter.status),
  );
}
export function indicatorTotal(rows: CompositionRow[]) {
  return rows.some((r) => r.amount === null)
    ? null
    : Math.round(rows.reduce((s, r) => s + (r.amount ?? 0), 0) * 100) / 100;
}
export function executiveComposition(
  data: ExecutiveData,
  filter: ExecutiveFilter,
  now = new Date(),
): Record<Indicator, CompositionRow[]> {
  const works = selectWorks(data.works, filter);
  const ids = new Set(works.map((w) => w.work.id));
  const range =
    filter.period === "personalizado"
      ? { from: filter.from || "", to: filter.to || "" }
      : periodRange(filter.period || "todos", now);
  const bounded = !!(range.from || range.to);
  const company = !filter.work && !filter.client && !filter.status;
  const rows: Record<Indicator, CompositionRow[]> = {
    active: [],
    value: [],
    extras: [],
    received: [],
    receivable: [],
    spent: [],
    payable: [],
    cash: [],
    result: [],
  };
  const base = (s: WorkSummary): CompositionRow => ({
    id: s.work.id,
    workId: s.work.id,
    personId: s.work.client_id,
    work: s.work.name,
    client: s.client,
    description: s.work.name,
    date: s.work.planned_start,
    amount: 0,
    status: s.work.status,
    tab: "resumo",
  });
  for (const s of works) {
    const b = base(s);
    if (["execucao", "contratacao"].includes(s.work.status)) {
      rows.active.push({ ...b, amount: 1 });
      rows.value.push({ ...b, amount: s.result.sale });
    }
    rows.result.push({
      ...b,
      amount: s.work.origin === "direto" && !s.result.estimateConfirmed ? null : s.result.result,
      description: `Contrato ${s.result.sale} · custos ${s.result.cost}`,
      tab: "resultado",
    });
    for (const x of s.extras.filter((x) => x.approved))
      rows.extras.push({
        ...b,
        id: x.id,
        recordId: x.id,
        description: x.description,
        date: x.approval_date,
        amount: x.price,
        status: x.approved ? "aprovado" : "pendente",
        tab: "resultado",
        paid: null,
        pending: null,
      });
    if (s.opening?.existing_extras)
      rows.extras.push({
        ...b,
        id: `extras-${s.work.id}`,
        description: "Aditivos da posição inicial",
        date: s.opening.reference_date,
        amount: s.opening.existing_extras,
        tab: "resultado",
        status: "posição inicial",
        paid: null,
        pending: null,
      });
    const opening = s.opening;
    if (opening && inPeriod(opening.reference_date, range.from, range.to)) {
      if (opening.received)
        rows.received.push({
          ...b,
          id: `received-${s.work.id}`,
          description: "Recebimentos da posição inicial",
          amount: opening.received,
          date: opening.reference_date,
          status: "posição inicial",
          tab: "financeiro",
        });
      if (opening.paid)
        rows.spent.push({
          ...b,
          id: `paid-${s.work.id}`,
          description: "Despesas pagas da posição inicial",
          amount: opening.paid,
          date: opening.reference_date,
          status: "posição inicial",
          tab: "financeiro",
        });
    }
    if (opening?.pending_payable && !bounded)
      rows.payable.push({
        ...b,
        id: `payable-${s.work.id}`,
        amount: opening.pending_payable,
        description: "Contas a pagar da posição inicial · sem vencimentos detalhados",
        date: opening.reference_date,
        status: "posição inicial",
        tab: "financeiro",
      });
    if (!bounded) {
      const entries = data.finance.entries.filter(
        (e) => !e.canceled && e.work_id === s.work.id && e.direction === "entrada",
      );
      const pending = entries.reduce(
        (t, e) => t + entryState(e, data.finance.settlements).pending,
        0,
      );
      const unallocated = Math.max(0, s.balance.receivable - pending);
      if (unallocated)
        rows.receivable.push({
          ...b,
          id: `unallocated-${s.work.id}`,
          amount: unallocated,
          description: "Saldo contratual ainda sem parcelas",
          date: null,
          status: "sem vencimento",
          tab: "resumo",
        });
    }
  }
  const entries = data.finance.entries.filter(
    (e) => !e.canceled && (e.work_id ? ids.has(e.work_id) : company),
  );
  for (const e of entries) {
    const s = works.find((w) => w.work.id === e.work_id);
    const person = data.finance.people.find((p) => p.id === e.person_id);
    const b: CompositionRow = {
      id: e.id,
      workId: e.work_id,
      personId: e.person_id,
      work: s?.work.name || "Geral JMG",
      client: person?.name || s?.client || "—",
      description: e.description,
      date: e.due_date,
      amount: 0,
      status: entryState(e, data.finance.settlements).status,
      installment: `${e.installment_index}/${e.installment_count}`,
      entryId: e.id,
      tab: "financeiro",
    };
    const state = entryState(e, data.finance.settlements);
    if (state.pending > 0 && inPeriod(e.due_date, range.from, range.to))
      rows[e.direction === "entrada" ? "receivable" : "payable"].push({
        ...b,
        amount: state.pending,
        paid: state.paid,
        pending: state.pending,
      });
    for (const settlement of data.finance.settlements.filter(
      (x) => x.entry_id === e.id && inPeriod(x.paid_date, range.from, range.to),
    ))
      rows[e.direction === "entrada" ? "received" : "spent"].push({
        ...b,
        id: settlement.id,
        date: settlement.paid_date,
        amount: settlement.amount,
        method: settlement.payment_method,
        status: e.direction === "entrada" ? "recebido" : "pago",
      });
  }
  if (company) {
    // Caixa da empresa = o dinheiro nas contas, igual ao Financeiro: saldo inicial das contas +
    // todas as baixas (inclusive de obras-piloto ou na lixeira, porque o dinheiro se moveu).
    // A posição inicial das obras é história da obra, não dinheiro nas contas de hoje.
    const opening = (data.finance.accounts ?? []).reduce(
      (t, a) => t + Number(a.opening_balance),
      0,
    );
    if (opening && !bounded)
      rows.cash.push({
        id: "accounts-opening",
        workId: null,
        personId: null,
        work: "Geral JMG",
        client: "—",
        description: "Saldo inicial das contas da empresa",
        date: null,
        amount: opening,
        status: "saldo inicial",
        tab: "financeiro",
      });
    for (const e of data.finance.entries.filter((x) => !x.canceled))
      for (const st of data.finance.settlements.filter(
        (x) => x.entry_id === e.id && inPeriod(x.paid_date, range.from, range.to),
      )) {
        const w = data.works.find((x) => x.work.id === e.work_id);
        rows.cash.push({
          id: st.id,
          workId: e.work_id,
          personId: e.person_id,
          work: w?.work.name || "Geral JMG",
          client: data.finance.people.find((p) => p.id === e.person_id)?.name || w?.client || "—",
          description: `${e.direction === "entrada" ? "Entrada" : "Saída"} · ${e.description}`,
          date: st.paid_date,
          amount: e.direction === "entrada" ? st.amount : -st.amount,
          method: st.payment_method,
          status: e.direction === "entrada" ? "recebido" : "pago",
          entryId: e.id,
          tab: "financeiro",
        });
      }
  } else
    rows.cash = [
      ...rows.received.map((r) => ({ ...r, description: `Entrada · ${r.description}` })),
      ...rows.spent.map((r) => ({
        ...r,
        amount: -(r.amount ?? 0),
        description: `Saída · ${r.description}`,
      })),
    ];
  return rows;
}
