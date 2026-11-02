// Custos fixos e Caixa da Estrutura (Financeiro › Estrutura). Módulo puro e testado.
//
// - Custo fixo mensal: mensais pelo valor, trimestrais ÷ 3 e anuais ÷ 12 (provisionados).
// - Entrada na estrutura: cada recebimento de obra separa a mesma fração que a estrutura tem no
//   valor de venda do orçamento daquela obra (estrutura ÷ venda), igual à precificação.
// - Saída da estrutura: tudo o que a empresa paga sem obra (custos fixos, veículo sem obra...),
//   menos impostos e comissão, que têm a própria fatia do preço.
// - Saldo = entradas de estrutura + aportes (entradas sem obra) − saídas gerais pagas, desde o
//   início (retroativo). Previsão: parcelas a receber × fração − custo fixo mensal, 6 meses.

import { cents } from "./operations";

export type FixedCostLike = {
  id: string;
  name: string;
  category: string;
  amount: number;
  recurrence: string;
  due_day: number;
  due_month: number | null;
  variable?: boolean;
  active: boolean;
  starts_on: string;
  ends_on: string | null;
};

export const FIXED_COST_CATEGORY: Record<string, string> = {
  ocupacao: "Ocupação",
  pessoal: "Pessoal",
  utilidades: "Utilidades",
  sistemas: "Sistemas",
  servicos: "Serviços",
  impostos_taxas: "Impostos e taxas",
  veiculo: "Veículo",
  outros: "Outros",
};

export const RECURRENCE_LABEL: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

/** Saídas gerais que não são da estrutura (têm a própria fatia no preço do orçamento). */
export const NOT_STRUCTURE_CATEGORIES = ["Impostos", "Tributos", "Comissão da arquiteta"];

const MONTHS_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const MONTHS_LONG = [
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

/** "2026-11" + 2 → "2027-01". */
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const monthShort = (ym: string) =>
  `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
export const monthLong = (ym: string) => MONTHS_LONG[Number(ym.slice(5, 7)) - 1] ?? ym;

/** O custo fixo vence (gera conta) no mês `ym`? */
export function dueInMonth(c: FixedCostLike, ym: string) {
  if (!c.active) return false;
  const first = `${ym}-01`;
  const last = `${ym}-31`;
  if (c.starts_on > last || (c.ends_on && c.ends_on < first)) return false;
  const m = Number(ym.slice(5, 7));
  if (c.recurrence === "anual") return m === c.due_month;
  if (c.recurrence === "trimestral") return (m - (c.due_month ?? m) + 12) % 3 === 0;
  return true;
}

/** Quanto o custo pesa por mês: anuais ÷ 12 e trimestrais ÷ 3. */
export const monthlyShare = (c: Pick<FixedCostLike, "amount" | "recurrence">) =>
  c.recurrence === "anual"
    ? c.amount / 12
    : c.recurrence === "trimestral"
      ? c.amount / 3
      : c.amount;

/** Custo fixo mensal (custos ativos hoje; anuais e trimestrais rateados). */
export function monthlyCost(costs: FixedCostLike[], today: string) {
  return cents(
    costs
      .filter((c) => c.active && c.starts_on <= today && (!c.ends_on || c.ends_on >= today))
      .reduce((t, c) => t + monthlyShare(c), 0),
  );
}

/** Fração do valor de venda que é estrutura (estrutura ÷ venda do orçamento). */
export const structureShare = (base: { structure?: number | null | undefined; saleNet: number }) =>
  base.saleNet > 0 && (base.structure ?? 0) > 0 ? (base.structure ?? 0) / base.saleNet : 0;

type Entry = {
  id: string;
  work_id: string | null;
  direction: string;
  category: string;
  description: string;
  canceled: boolean;
  amount: number;
  due_date: string;
};
type Settlement = { id: string; entry_id: string; amount: number; paid_date: string };

export type LedgerRow = {
  id: string;
  date: string;
  kind: "entrada_obra" | "aporte" | "saida";
  description: string;
  workId: string | null;
  /** Valor recebido/pago na conta (a parcela inteira). */
  base: number;
  /** Quanto disso é da estrutura (+ entra, − sai). */
  amount: number;
};

/** Extrato e saldo do caixa da estrutura, desde o início (retroativo). */
export function structureLedger(
  shares: Map<string, number>,
  entries: Entry[],
  settlements: Settlement[],
) {
  const rows: LedgerRow[] = [];
  for (const e of entries) {
    if (e.canceled) continue;
    const isStructureOut =
      e.direction === "saida" && !e.work_id && !NOT_STRUCTURE_CATEGORIES.includes(e.category);
    const share = e.work_id ? (shares.get(e.work_id) ?? 0) : 0;
    for (const s of settlements.filter((x) => x.entry_id === e.id)) {
      if (e.direction === "entrada" && e.work_id && share > 0)
        rows.push({
          id: s.id,
          date: s.paid_date,
          kind: "entrada_obra",
          description: e.description,
          workId: e.work_id,
          base: s.amount,
          amount: cents(s.amount * share),
        });
      else if (e.direction === "entrada" && !e.work_id)
        rows.push({
          id: s.id,
          date: s.paid_date,
          kind: "aporte",
          description: e.description,
          workId: null,
          base: s.amount,
          amount: s.amount,
        });
      else if (isStructureOut)
        rows.push({
          id: s.id,
          date: s.paid_date,
          kind: "saida",
          description: e.description,
          workId: null,
          base: s.amount,
          amount: -s.amount,
        });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const sum = (k: LedgerRow["kind"]) =>
    cents(rows.filter((r) => r.kind === k).reduce((t, r) => t + Math.abs(r.amount), 0));
  const fromWorks = sum("entrada_obra");
  const contributions = sum("aporte");
  const spent = sum("saida");
  return {
    rows,
    fromWorks,
    contributions,
    spent,
    balance: cents(fromWorks + contributions - spent),
  };
}

export type Receivable = {
  id: string;
  workId: string;
  description: string;
  due_date: string;
  /** Quanto ainda falta receber da parcela. */
  pending: number;
};

export type ForecastMonth = {
  ym: string;
  /** Parcelas de obra previstas no mês (inteiras). */
  receipts: number;
  /** Parte delas que vai para a estrutura. */
  inflow: number;
  /** Custos fixos do mês (no mês atual, só o que falta pagar). */
  cost: number;
  balance: number;
};

/**
 * Saldo projetado mês a mês. Parcelas já vencidas e ainda abertas entram no mês atual; o mês
 * atual desconta só o custo fixo que ainda falta pagar (o já pago está no saldo).
 */
export function structureForecast(input: {
  balance: number;
  monthlyCost: number;
  paidThisMonth: number;
  receivables: Receivable[];
  shares: Map<string, number>;
  today: string;
  months?: number;
}): ForecastMonth[] {
  const start = input.today.slice(0, 7);
  const n = input.months ?? 6;
  let balance = input.balance;
  const out: ForecastMonth[] = [];
  for (let i = 0; i < n; i++) {
    const ym = addMonths(start, i);
    const inMonth = input.receivables.filter((r) =>
      i === 0 ? r.due_date.slice(0, 7) <= ym : r.due_date.slice(0, 7) === ym,
    );
    const receipts = cents(inMonth.reduce((t, r) => t + r.pending, 0));
    const inflow = cents(
      inMonth.reduce((t, r) => t + r.pending * (input.shares.get(r.workId) ?? 0), 0),
    );
    const cost =
      i === 0 ? Math.max(0, cents(input.monthlyCost - input.paidThisMonth)) : input.monthlyCost;
    balance = cents(balance + inflow - cost);
    out.push({ ym, receipts, inflow, cost, balance });
  }
  return out;
}

/** Meses de custo fixo que o saldo cobre. */
export const coverageMonths = (balance: number, monthly: number) =>
  monthly > 0 ? Math.max(0, balance) / monthly : null;

/** Verde com 3+ meses, amarelo de 1 a 3, vermelho abaixo de 1 ou com mês negativo à frente. */
export function coverageTone(months: number | null, forecast: ForecastMonth[]) {
  if (forecast.some((m) => m.balance < 0)) return "critico" as const;
  if (months === null || months >= 3) return "confortavel" as const;
  return months >= 1 ? ("atencao" as const) : ("critico" as const);
}

export const firstNegative = (forecast: ForecastMonth[]) =>
  forecast.find((m) => m.balance < 0) ?? null;

/** Simula antecipar uma parcela para o mês `ym` (cobrar uma etapa antes). */
export function anticipate(receivables: Receivable[], id: string, ym: string) {
  return receivables.map((r) => (r.id === id ? { ...r, due_date: `${ym}-15` } : r));
}

/**
 * Obra nova mínima para pagar `months` meses de estrutura: com `downPct` de entrada e o resto em
 * `duration` meses, só uma fração do valor entra dentro do período.
 */
export function minimumWork(input: {
  monthly: number;
  months: number;
  share: number;
  downPct: number;
  duration: number;
}) {
  const months = Math.max(1, Math.round(input.months));
  const down = Math.min(1, Math.max(0.05, input.downPct / 100));
  const duration = Math.max(1, Math.round(input.duration));
  const needed = cents(input.monthly * months);
  const fraction = Math.min(1, down + ((1 - down) * Math.min(months - 1, duration)) / duration);
  if (input.share <= 0) return { needed, fraction, sale: null, saleUpfront: null };
  return {
    needed,
    fraction,
    sale: cents(needed / input.share / fraction),
    saleUpfront: cents(needed / input.share),
  };
}

/** Recebimento de obra por mês para a estrutura se pagar sozinha. */
export const breakEven = (monthly: number, share: number) =>
  share > 0 ? cents(monthly / share) : null;

/** Fração média de estrutura das obras (ponderada pelo valor), para os simuladores. */
export function averageShare(works: { sale: number; share: number }[], fallback: number) {
  const sale = works.reduce((t, w) => t + w.sale, 0);
  const structure = works.reduce((t, w) => t + w.sale * w.share, 0);
  return sale > 0 && structure > 0 ? structure / sale : fallback;
}
