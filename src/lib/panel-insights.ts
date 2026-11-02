// Blocos do Painel que juntam dados já carregados: gráfico de caixa (meses realizados + saldo
// projetado), agenda dos próximos dias, linha do tempo das etapas de cada obra, propostas para
// follow-up e margem por obra. Módulo puro: recebe as composições de executive.ts, a projeção de
// business-indicators.ts, as etapas e os orçamentos, e só organiza.

import type { CompositionRow } from "./executive";
import type { cashProjection } from "./business-indicators";
import { lateStages } from "./schedule-dashboard";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const abs = (r: CompositionRow) => Math.abs(r.amount ?? 0);
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const k = y! * 12 + (m! - 1) + n;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
};

/* ---------------- Fluxo de caixa + projeção ---------------- */

export interface CashChartMonth {
  month: string;
  label: string;
  /** Entradas e saídas realizadas no mês (0 nos meses futuros). */
  received: number;
  spent: number;
  /** Saldo no fim do mês (mês atual: hoje; futuros: projetado pelos vencimentos). */
  balance: number;
  current: boolean;
  future: boolean;
}

/**
 * Meses de `back` meses atrás até o atual com o realizado e o saldo de fim de mês (reconstituído a
 * partir do saldo de hoje desfazendo o que entrou e saiu depois), e os meses seguintes cobertos
 * pela projeção semanal com o saldo projetado da última semana de cada mês. `low` é a semana de
 * menor saldo projetado.
 */
export function cashChart(
  rows: { received: CompositionRow[]; spent: CompositionRow[] },
  cashNow: number,
  projection: ReturnType<typeof cashProjection>,
  today: string,
  back = 4,
) {
  const now = today.slice(0, 7);
  const after = (list: CompositionRow[], month: string) =>
    list.filter((r) => (r.date ?? "").slice(0, 7) > month).reduce((n, r) => n + abs(r), 0);
  const inMonth = (list: CompositionRow[], month: string) =>
    list.filter((r) => (r.date ?? "").slice(0, 7) === month).reduce((n, r) => n + abs(r), 0);
  const months: CashChartMonth[] = [];
  for (let i = back; i >= 0; i--) {
    const month = addMonths(now, -i);
    months.push({
      month,
      label: MONTHS[Number(month.slice(5)) - 1]!,
      received: r2(inMonth(rows.received, month)),
      spent: r2(inMonth(rows.spent, month)),
      balance: r2(
        month === now ? cashNow : cashNow - after(rows.received, month) + after(rows.spent, month),
      ),
      current: month === now,
      future: false,
    });
  }
  const futureMonths = [
    ...new Set(projection.weeks.map((w) => w.start.slice(0, 7)).filter((m) => m > now)),
  ];
  for (const month of futureMonths) {
    // Última semana que termina dentro do mês (a que atravessa a virada conta no mês seguinte).
    const last = projection.weeks
      .filter((w) => iso(t(w.start) + 6 * DAY).slice(0, 7) <= month)
      .at(-1);
    if (!last) continue;
    months.push({
      month,
      label: MONTHS[Number(month.slice(5)) - 1]!,
      received: 0,
      spent: 0,
      balance: last.balance,
      current: false,
      future: true,
    });
  }
  const low = projection.weeks.length
    ? projection.weeks.reduce((m, w) => (w.balance < m.balance ? w : m))
    : null;
  return { months, low: low && { date: low.start, balance: low.balance } };
}

/* ---------------- Próximos dias ---------------- */

export type AgendaKind = "entrada" | "saida" | "etapa";
export interface AgendaItem {
  date: string;
  day: string;
  weekday: string;
  kind: AgendaKind;
  title: string;
  detail: string;
  amount: number | null;
  workId: string | null;
  tab: string;
}

/**
 * O que vence ou começa de hoje até `days` dias à frente: parcelas a receber, contas a pagar e
 * etapas com início previsto ainda não começadas. Vencidos ficam de fora (estão nos avisos).
 */
export function weekAgenda(
  receivable: CompositionRow[],
  payable: CompositionRow[],
  stages: {
    workId: string;
    work: string;
    name: string;
    planned_start: string | null;
    progress: number;
  }[],
  today: string,
  days = 7,
) {
  const end = iso(t(today) + days * DAY);
  const inRange = (d: string | null) => !!d && d >= today && d < end;
  const at = (date: string) => ({
    date,
    day: date.slice(8, 10),
    weekday: WEEKDAYS[new Date(t(date)).getUTCDay()]!,
  });
  const money = (kind: AgendaKind, r: CompositionRow): AgendaItem => ({
    ...at(r.date!),
    kind,
    // Nome do lançamento; a parcela ("2/4") só quando há mais de uma.
    title:
      [
        r.description,
        r.installment && !/^1\/1$/.test(r.installment) ? `parcela ${r.installment}` : "",
      ]
        .filter(Boolean)
        .join(" · ") || (kind === "entrada" ? "Receber" : "Pagar"),
    detail: [r.work, r.client].filter(Boolean).join(" · "),
    amount: r2(abs(r)),
    workId: r.workId,
    tab: "financeiro",
  });
  const items: AgendaItem[] = [
    ...receivable.filter((r) => inRange(r.date)).map((r) => money("entrada", r)),
    ...payable.filter((r) => inRange(r.date)).map((r) => money("saida", r)),
    ...stages
      .filter((s) => (s.progress ?? 0) === 0 && inRange(s.planned_start))
      .map((s): AgendaItem => ({
        ...at(s.planned_start!),
        kind: "etapa",
        title: `${s.name} começa`,
        detail: s.work,
        amount: null,
        workId: s.workId,
        tab: "cronograma",
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  const sum = (k: AgendaKind) =>
    r2(items.filter((i) => i.kind === k).reduce((n, i) => n + (i.amount ?? 0), 0));
  return { items, inflow: sum("entrada"), outflow: sum("saida") };
}

/* ---------------- Linha do tempo das etapas ---------------- */

export type StageState = "concluida" | "andamento" | "atrasada" | "afazer";
export const STAGE_STATE_LABEL: Record<StageState, string> = {
  concluida: "concluída",
  andamento: "em andamento",
  atrasada: "atrasada",
  afazer: "a fazer",
};

/**
 * Etapas da obra na ordem do cronograma, cada uma com a situação de hoje e o tamanho do trecho
 * (o "Avanço % da obra"; sem pesos, todas iguais). Atrasada = mesma regra de lateStages.
 */
export function stageTimeline(
  stages: {
    id: string;
    name: string;
    sort?: number;
    planned_start: string | null;
    planned_end: string | null;
    progress: number;
    weight?: number;
  }[],
  today: string,
) {
  const late = new Set(lateStages(stages, today).map((s) => s.id));
  const anyWeight = stages.some((s) => (s.weight ?? 0) > 0);
  return [...stages]
    .sort(
      (a, b) =>
        (a.sort ?? 0) - (b.sort ?? 0) ||
        (a.planned_start ?? "9999").localeCompare(b.planned_start ?? "9999"),
    )
    .map((s) => {
      const state: StageState =
        (s.progress ?? 0) >= 100
          ? "concluida"
          : late.has(s.id)
            ? "atrasada"
            : (s.progress ?? 0) > 0 || (!!s.planned_start && s.planned_start <= today)
              ? "andamento"
              : "afazer";
      return { id: s.id, name: s.name, state, size: anyWeight ? Math.max(s.weight ?? 0, 0.5) : 1 };
    });
}

/** Próxima etapa a acompanhar: a primeira atrasada, senão a em andamento, senão a próxima. */
export function nextStage(timeline: ReturnType<typeof stageTimeline>) {
  return (
    timeline.find((s) => s.state === "atrasada") ??
    timeline.find((s) => s.state === "andamento") ??
    timeline.find((s) => s.state === "afazer") ??
    null
  );
}

/* ---------------- Follow-up comercial ---------------- */

export interface FollowUpBudget {
  id: string;
  number: number;
  revision: number;
  status: string;
  issue_date: string;
  title: string;
  client: string;
  phone: string | null;
  value: number;
}

/**
 * Propostas enviadas (última revisão de cada número) emitidas há `minDays` dias ou mais, sem
 * aprovação nem recusa, da mais antiga para a mais nova.
 */
export function followUps(budgets: FollowUpBudget[], today: string, minDays = 7) {
  const latest = new Map<number, FollowUpBudget>();
  for (const b of budgets) {
    const cur = latest.get(b.number);
    if (!cur || b.revision > cur.revision) latest.set(b.number, b);
  }
  return [...latest.values()]
    .filter((b) => b.status === "enviado")
    .map((b) => ({ ...b, days: Math.round((t(today) - t(b.issue_date)) / DAY) }))
    .filter((b) => b.days >= minDays)
    .sort((a, b) => b.days - a.days);
}

/** Link de WhatsApp para um telefone brasileiro (só dígitos; DDI 55 quando faltar). */
export function whatsappLink(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

/* ---------------- Margem por obra ---------------- */

export type MarginTone = "meta" | "atencao" | "abaixo";

/** Obras com margem conferida, da maior para a menor, com a faixa em relação à meta e à mínima. */
export function marginRanking(
  works: { id: string; name: string; margin: number | null; target: number; min: number }[],
) {
  return works
    .filter((w): w is typeof w & { margin: number } => w.margin !== null)
    .map((w) => {
      const pct = w.margin * 100;
      const tone: MarginTone =
        pct < 0 || (w.min > 0 && pct < w.min - 1e-9)
          ? "abaixo"
          : w.target > 0 && pct < w.target - 1e-9
            ? "atencao"
            : "meta";
      return { ...w, pct: Math.round(pct * 10) / 10, tone };
    })
    .sort((a, b) => b.pct - a.pct);
}

/* ---------------- Ritmo de recebimento ---------------- */

/**
 * Recebido do contrato × avanço físico (em pontos percentuais): "atras" quando o recebido fica
 * `tolerance` pontos ou mais atrás do que já foi executado.
 */
export function receiptPace(physical: number, received: number, tolerance = 5) {
  const gap = Math.round((physical - received) * 10) / 10;
  return { gap, behind: gap >= tolerance };
}
