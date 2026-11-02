// Indicadores de gestão do Painel (roteiro R2-1, R2-2, R2-3): caixa projetado, funil comercial
// e inadimplência. Módulo puro: recebe as linhas já filtradas (composições de executive.ts,
// orçamentos com o valor de computeBudget e contas a receber) e só agrega.

import type { CompositionRow } from "./executive";

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------- R2-1 · Caixa projetado ---------------- */

export interface ProjectionWeek {
  start: string;
  inflow: number;
  outflow: number;
  balance: number;
}

/**
 * Saldo projetado por semana nos próximos `weeks` (13 ≈ 90 dias): saldo atual + a receber − a
 * pagar pelo vencimento. Vencidos em aberto entram na primeira semana (podem acontecer a qualquer
 * momento); linhas sem data ficam de fora.
 */
export function cashProjection(
  cash: number,
  receivable: CompositionRow[],
  payable: CompositionRow[],
  today: string,
  weeks = 13,
) {
  const first = t(today) - ((new Date(t(today)).getUTCDay() + 6) % 7) * DAY;
  const weekOf = (d: string) => Math.max(0, Math.floor((t(d) - first) / (7 * DAY)));
  const list: ProjectionWeek[] = Array.from({ length: weeks }, (_, i) => ({
    start: iso(first + i * 7 * DAY),
    inflow: 0,
    outflow: 0,
    balance: 0,
  }));
  for (const r of receivable)
    if (r.date && weekOf(r.date) < weeks) list[weekOf(r.date)]!.inflow += Math.abs(r.amount ?? 0);
  for (const r of payable)
    if (r.date && weekOf(r.date) < weeks) list[weekOf(r.date)]!.outflow += Math.abs(r.amount ?? 0);
  let balance = cash;
  for (const w of list) {
    w.inflow = r2(w.inflow);
    w.outflow = r2(w.outflow);
    balance = r2(balance + w.inflow - w.outflow);
    w.balance = balance;
  }
  const min = list.reduce((m, w) => Math.min(m, w.balance), cash);
  return {
    weeks: list,
    end: list.at(-1)?.balance ?? cash,
    min: r2(min),
    /** Primeira semana com saldo projetado negativo, se houver. */
    firstNegative: list.find((w) => w.balance < 0) ?? null,
    inflow: r2(list.reduce((n, w) => n + w.inflow, 0)),
    outflow: r2(list.reduce((n, w) => n + w.outflow, 0)),
  };
}

/* ---------------- R2-2 · Funil comercial ---------------- */

export type FunnelStage = "elaboracao" | "enviado" | "aprovado" | "recusado";
export const FUNNEL_LABEL: Record<FunnelStage, string> = {
  elaboracao: "Em elaboração",
  enviado: "Enviados",
  aprovado: "Aprovados",
  recusado: "Recusados",
};
export const REFUSAL_REASONS = [
  "Preço",
  "Prazo",
  "Escolheu outra empresa",
  "Desistiu da obra",
  "Sem retorno do cliente",
  "Outro",
] as const;

export interface FunnelBudget {
  number: number;
  revision: number;
  status: string;
  issue_date: string;
  approval_date: string | null;
  refusal_reason?: string | null;
  value: number;
}

/**
 * Funil dos orçamentos: só a última revisão de cada número conta (revisões não duplicam a
 * proposta; havendo uma revisão aprovada, é ela que conta) e orçamentos substituídos/cancelados ficam fora. Conversão = aprovados ÷ decididos
 * (aprovados + recusados); tempo até aprovação = emissão → aprovação, em dias.
 */
export function commercialFunnel(budgets: FunnelBudget[]) {
  // A revisão aprovada vale enquanto existir: reabrir para edição cria uma revisão nova em
  // elaboração, mas a obra continua contratada (não volta para "em aberto" no funil).
  const latest = new Map<number, FunnelBudget>();
  for (const b of budgets) {
    const cur = latest.get(b.number);
    const approved = (x: FunnelBudget) => x.status === "aprovado";
    if (
      !cur ||
      (approved(b) && !approved(cur)) ||
      (approved(b) === approved(cur) && b.revision > cur.revision)
    )
      latest.set(b.number, b);
  }
  const list = [...latest.values()].filter((b) =>
    ["elaboracao", "enviado", "aprovado", "recusado"].includes(b.status),
  );
  const stages = (Object.keys(FUNNEL_LABEL) as FunnelStage[]).map((stage) => {
    const rows = list.filter((b) => b.status === stage);
    return { stage, count: rows.length, value: r2(rows.reduce((n, b) => n + b.value, 0)) };
  });
  const by = (s: FunnelStage) => stages.find((x) => x.stage === s)!;
  const decided = by("aprovado").count + by("recusado").count;
  const days = list
    .filter((b) => b.status === "aprovado" && b.approval_date)
    .map((b) => Math.max(0, Math.round((t(b.approval_date!) - t(b.issue_date)) / DAY)));
  const reasons = new Map<string, number>();
  for (const b of list.filter((b) => b.status === "recusado"))
    reasons.set(
      b.refusal_reason || "Não informado",
      (reasons.get(b.refusal_reason || "Não informado") ?? 0) + 1,
    );
  return {
    stages,
    total: list.length,
    conversion: decided ? Math.round((by("aprovado").count / decided) * 1000) / 10 : null,
    avgDaysToApprove: days.length
      ? Math.round(days.reduce((a, b) => a + b, 0) / days.length)
      : null,
    openValue: r2(by("elaboracao").value + by("enviado").value),
    averageTicket: by("aprovado").count ? r2(by("aprovado").value / by("aprovado").count) : null,
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ---------------- R2-3 · Inadimplência ---------------- */

export interface ReceivableEntry {
  id: string;
  amount: number;
  due_date: string;
  /** Nome do cliente (da obra ou da pessoa da conta). */
  client: string;
  clientId: string | null;
}

/**
 * Inadimplência: do que já venceu (vencimento antes de hoje), quanto segue em aberto. Taxa =
 * vencido em aberto ÷ total que já deveria ter sido recebido; dias de atraso ponderados pelo valor
 * em aberto; ranking por cliente.
 */
export function delinquency(
  entries: ReceivableEntry[],
  settlements: { entry_id: string; amount: number }[],
  today: string,
) {
  const due = entries.filter((e) => e.due_date < today);
  const paid = (id: string) =>
    settlements.filter((s) => s.entry_id === id).reduce((n, s) => n + Number(s.amount), 0);
  const rows = due
    .map((e) => ({
      ...e,
      pending: r2(Math.max(0, Number(e.amount) - paid(e.id))),
      days: Math.round((t(today) - t(e.due_date)) / DAY),
    }))
    .filter((e) => e.pending > 0.005);
  const expected = r2(due.reduce((n, e) => n + Number(e.amount), 0));
  const overdue = r2(rows.reduce((n, e) => n + e.pending, 0));
  const clients = new Map<
    string,
    { client: string; clientId: string | null; overdue: number; weighted: number; count: number }
  >();
  for (const e of rows) {
    const key = e.clientId ?? e.client;
    const c = clients.get(key) ?? {
      client: e.client,
      clientId: e.clientId,
      overdue: 0,
      weighted: 0,
      count: 0,
    };
    c.overdue += e.pending;
    c.weighted += e.pending * e.days;
    c.count += 1;
    clients.set(key, c);
  }
  return {
    expected,
    overdue,
    rate: expected ? Math.round((overdue / expected) * 1000) / 10 : 0,
    avgDaysLate: overdue
      ? Math.round(rows.reduce((n, e) => n + e.pending * e.days, 0) / overdue)
      : 0,
    count: rows.length,
    byClient: [...clients.values()]
      .map((c) => ({
        client: c.client,
        clientId: c.clientId,
        overdue: r2(c.overdue),
        count: c.count,
        avgDays: Math.round(c.weighted / c.overdue),
      }))
      .sort((a, b) => b.overdue - a.overdue),
  };
}
