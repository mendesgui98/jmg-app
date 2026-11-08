// Parcelas do contrato a partir das condições de pagamento do orçamento (roteiro R0-2).
// Puro e testado: valores em centavos por splitPayments (o mesmo do PDF) e vencimento lido do
// texto de cada condição ("Na aprovação", "Ao concluir as etapas 1 a 4", "No início da etapa 3",
// "Na entrega") usando as datas das etapas da obra (ou, sem obra, as do cronograma do orçamento).

import { addDays } from "./proposal.ts";
import { splitPayments } from "./pricing.ts";

export interface InstallmentTerm {
  label: string;
  when?: string | undefined;
  pct: number;
}

/** Datas de cada etapa, na ordem do orçamento (etapa 1 = primeira seção). */
export interface StageWindow {
  start: string | null;
  end: string | null;
}

export interface PlanContext {
  /** Data da aprovação (ou hoje): parcelas "na assinatura/aprovação". */
  approval: string;
  stages: StageWindow[];
  /** Término previsto da obra: parcelas "na entrega". */
  end: string | null;
}

export interface PlannedInstallment {
  description: string;
  when: string;
  pct: number;
  amount: number;
  due_date: string;
  /** Como o vencimento foi encontrado, para mostrar na conferência. */
  basis: "aprovacao" | "inicio_etapa" | "fim_etapa" | "entrega" | "dias" | "estimado";
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Números de etapa citados: "etapas 1 a 4" → [1,2,3,4]; "etapas 5 e 6" → [5,6]; "etapa 3" → [3]. */
export function stageNumbers(text: string): number[] {
  const t = plain(text);
  const m = t.match(/etapas?\s+((?:\d+\s*(?:a|ate|e|,|-|\/)?\s*)+)/);
  if (!m) return [];
  const out = new Set<number>();
  const part = m[1]!;
  const range = /(\d+)\s*(?:a|ate|-)\s*(\d+)/g;
  let r: RegExpExecArray | null;
  let rest = part;
  while ((r = range.exec(part))) {
    const a = Number(r[1]),
      b = Number(r[2]);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    rest = rest.replace(r[0], " ");
  }
  for (const d of rest.match(/\d+/g) ?? []) out.add(Number(d));
  return [...out].filter((n) => n > 0).sort((a, b) => a - b);
}

/** Vencimento de uma condição de pagamento, ou null quando o texto não diz. */
export function termDueDate(
  term: Pick<InstallmentTerm, "label" | "when">,
  ctx: PlanContext,
): { date: string; basis: PlannedInstallment["basis"] } | null {
  const text = plain(`${term.when ?? ""} ${term.label}`);
  const nums = stageNumbers(text);
  if (nums.length) {
    const opening = /\b(inicio|comeco|iniciar|inicia|abertura|antes)\b/.test(text);
    if (opening) {
      const st = ctx.stages[nums[0]! - 1];
      if (st?.start) return { date: st.start, basis: "inicio_etapa" };
    } else {
      const st = ctx.stages[nums[nums.length - 1]! - 1];
      if (st?.end) return { date: st.end, basis: "fim_etapa" };
    }
  }
  if (
    /\b(entrega|vistoria|termo de entrega|final da obra|fim da obra|conclusao da obra|termino da obra)\b/.test(
      text,
    ) &&
    ctx.end
  )
    return { date: ctx.end, basis: "entrega" };
  const days = text.match(/(\d+)\s*dias/);
  if (days) return { date: addDays(ctx.approval, Number(days[1])), basis: "dias" };
  if (/\b(aprovacao|assinatura|entrada|sinal|contrato|fechamento|ato)\b/.test(text))
    return { date: ctx.approval, basis: "aprovacao" };
  return null;
}

/**
 * Parcelas do contrato: valor de cada condição (centavos, resto na última, igual ao PDF) e
 * vencimento lido do texto. Sem data no texto, vence 30 dias depois da parcela anterior.
 * Exige que as condições somem 100%.
 */
export function contractInstallmentPlan(
  total: number,
  terms: InstallmentTerm[],
  ctx: PlanContext,
): PlannedInstallment[] {
  const { rows, pctSum } = splitPayments(total, terms);
  if (!rows.length || Math.abs(pctSum - 100) > 1e-9 || !(total > 0)) return [];
  let previous = ctx.approval;
  return rows.map((r) => {
    const found = termDueDate(r, ctx);
    const due = found ?? { date: addDays(previous, 30), basis: "estimado" as const };
    previous = due.date;
    return {
      description: r.label.trim() || "Parcela",
      when: r.when?.trim() ?? "",
      pct: r.pct,
      amount: r.value,
      due_date: due.date,
      basis: due.basis,
    };
  });
}

/**
 * Entradas já lançadas à mão que correspondem a uma parcela (mesmo valor, ao centavo):
 * essas parcelas vêm marcadas como "já lançada" e não são geradas de novo.
 * Cada entrada casa com no máximo uma parcela, na ordem.
 */
export function matchExisting(
  plan: { amount: number }[],
  existing: { id: string; amount: number }[],
) {
  const free = existing.map((e) => ({ ...e, cents: Math.round(Number(e.amount) * 100) }));
  return plan.map((p) => {
    const cents = Math.round(p.amount * 100);
    const i = free.findIndex((e) => e.cents === cents);
    if (i < 0) return null;
    const [hit] = free.splice(i, 1);
    return hit!.id;
  });
}

/** Etapas da obra na ordem do orçamento: cada seção pega as datas da etapa ligada a ela. */
export function stageWindows(
  sections: { id: string }[],
  workStages: {
    budget_section_id: string | null;
    planned_start: string | null;
    planned_end: string | null;
  }[],
  fallback: StageWindow[] = [],
): StageWindow[] {
  return sections.map((s, i) => {
    const st = workStages.find((w) => w.budget_section_id === s.id);
    return {
      start: st?.planned_start ?? fallback[i]?.start ?? null,
      end: st?.planned_end ?? fallback[i]?.end ?? null,
    };
  });
}

export const BASIS_LABEL: Record<PlannedInstallment["basis"], string> = {
  aprovacao: "na aprovação",
  inicio_etapa: "início da etapa",
  fim_etapa: "fim da etapa",
  entrega: "entrega da obra",
  dias: "dias após a aprovação",
  estimado: "estimado (+30 dias)",
};
