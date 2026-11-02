// Painel inicial (visão executiva): saudação, fluxo de caixa por mês (realizado e previsto a
// receber), último lançamento e a lista "Atenção". Módulo puro; os valores vêm das composições
// de executive.ts (mesmas linhas dos cartões), então gráfico, cartões e detalhes não divergem.

import type { CompositionRow } from "./executive";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "Bom dia" até 12h, "Boa tarde" até 18h, depois "Boa noite". */
export function greeting(hour: number) {
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

/** "Sexta-feira, 30 de outubro de 2026" a partir de aaaa-mm-dd. */
export function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return `${WEEKDAYS[day]}, ${d} de ${MONTH_NAMES[m! - 1]} de ${y}`;
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y! * 12 + (m! - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

export interface CashMonth {
  month: string;
  label: string;
  received: number;
  spent: number;
  /** A receber com vencimento no mês (parcelas em aberto). */
  forecast: number;
  current: boolean;
}

/**
 * Fluxo de caixa de `back` meses antes até `ahead` meses depois do mês de `today`: entradas e
 * saídas realizadas e o previsto a receber pelo vencimento (vencidos em aberto contam no mês atual).
 */
export function cashFlowMonths(
  rows: { received: CompositionRow[]; spent: CompositionRow[]; receivable: CompositionRow[] },
  today: string,
  back = 3,
  ahead = 3,
): CashMonth[] {
  const now = today.slice(0, 7);
  const months = Array.from({ length: back + ahead + 1 }, (_, i) => addMonths(now, i - back));
  const sum = (list: CompositionRow[], month: string, overdueHere = false) =>
    list
      .filter((r) => {
        const m = (r.date ?? "").slice(0, 7);
        return m === month || (overdueHere && !!m && m < month);
      })
      .reduce((n, r) => n + Math.abs(r.amount ?? 0), 0);
  return months.map((month) => ({
    month,
    label: MONTHS[Number(month.slice(5)) - 1]!,
    received: Math.round(sum(rows.received, month) * 100) / 100,
    spent: Math.round(sum(rows.spent, month) * 100) / 100,
    forecast: month < now ? 0 : Math.round(sum(rows.receivable, month, month === now) * 100) / 100,
    current: month === now,
  }));
}

/** Lançamento mais recente (data e, no mesmo dia, o último da lista). */
export function lastRow(rows: CompositionRow[]) {
  return [...rows].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).at(0) ?? null;
}

export type AttentionKind = "margem" | "custo" | "cronograma" | "atraso" | "vencido";
export interface AttentionItem {
  kind: AttentionKind;
  workId: string;
  title: string;
  detail: string;
  action: string;
  tab: string;
}

/** Itens de atenção por obra, do mais grave ao mais leve. */
export function attentionItems(
  works: {
    id: string;
    name: string;
    status: string;
    overdue: number;
    margin: number | null;
    minMargin: number;
    costConfirmed: boolean;
    datedStages: number;
    lateStages: number;
  }[],
  money: (n: number) => string,
): AttentionItem[] {
  const out: AttentionItem[] = [];
  const active = works.filter((w) => w.status !== "concluida");
  for (const w of active) {
    if (w.overdue > 0)
      out.push({
        kind: "vencido",
        workId: w.id,
        title: `${money(w.overdue)} a receber vencido`,
        detail: w.name,
        action: "Ver financeiro",
        tab: "financeiro",
      });
    if (w.lateStages > 0)
      out.push({
        kind: "atraso",
        workId: w.id,
        title: `${w.lateStages} ${w.lateStages === 1 ? "etapa atrasada" : "etapas atrasadas"}`,
        detail: w.name,
        action: "Ver cronograma",
        tab: "cronograma",
      });
    if (w.margin !== null && w.minMargin > 0 && w.margin * 100 < w.minMargin - 1e-9)
      out.push({
        kind: "margem",
        workId: w.id,
        title: `Margem ${(w.margin * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% abaixo da mínima`,
        detail: `${w.name} · mínima de ${w.minMargin}%`,
        action: "Abrir obra",
        tab: "resumo",
      });
    if (!w.costConfirmed)
      out.push({
        kind: "custo",
        workId: w.id,
        title: "Custo previsto não conferido",
        detail: w.name,
        action: "Conferir",
        tab: "resumo",
      });
    if (!w.datedStages)
      out.push({
        kind: "cronograma",
        workId: w.id,
        title: "Sem cronograma",
        detail: w.name,
        action: "Criar cronograma",
        tab: "cronograma",
      });
  }
  const order: AttentionKind[] = ["vencido", "atraso", "margem", "custo", "cronograma"];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
