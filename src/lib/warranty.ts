// Regras da Garantia (puras, testadas em warranty.test.ts): prazo a partir da entrega, dias que
// faltam, prazo de atendimento em dias úteis (cláusula do contrato), situação de cada chamado e
// os números do relatório (por etapa, por quem executou, por obra, avaliação e tempos).

/** Prazo padrão da garantia em meses (cláusula "Garantia" do contrato). */
export const WARRANTY_MONTHS = 12;
/** A JMG inicia o atendimento em até 5 dias úteis após o aviso (cláusula do contrato). */
export const SLA_BUSINESS_DAYS = 5;
/** Garantia "vence em breve" quando faltam até 30 dias. */
export const SOON_DAYS = 30;

const DAY = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Dias corridos de `a` até `b` (negativo se `b` vem antes). */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);

/** Soma meses mantendo o dia; 31/01 + 1 mês = 28/02 (ou 29 no bissexto). */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d!, last));
  return iso(target.getTime());
}

const weekend = (ms: number) => {
  const wd = new Date(ms).getUTCDay();
  return wd === 0 || wd === 6;
};

/** Data `n` dias úteis (segunda a sexta) depois de `date`. */
export function addBusinessDays(date: string, n: number) {
  let ms = utc(date);
  let left = n;
  while (left > 0) {
    ms += DAY;
    if (!weekend(ms)) left--;
  }
  return iso(ms);
}

/** Dias úteis depois de `a` até `b`, inclusive (0 se `b` não vem depois de `a`). */
export function businessDaysBetween(a: string, b: string) {
  let n = 0;
  for (let ms = utc(a) + DAY; ms <= utc(b); ms += DAY) if (!weekend(ms)) n++;
  return n;
}

export type WarrantyPhase = "futura" | "ativa" | "vencendo" | "encerrada";

export const PHASE_LABEL: Record<WarrantyPhase, string> = {
  futura: "Ainda não iniciada",
  ativa: "Ativa",
  vencendo: "Vence em breve",
  encerrada: "Encerrada",
};

/** "3 meses e 9 dias" a partir de uma quantidade de dias. */
export function spanLabel(days: number) {
  const abs = Math.abs(days);
  const months = Math.floor(abs / 30.44);
  const rest = Math.round(abs - months * 30.44);
  if (!months) return `${abs} ${abs === 1 ? "dia" : "dias"}`;
  const m = `${months} ${months === 1 ? "mês" : "meses"}`;
  return rest ? `${m} e ${rest} ${rest === 1 ? "dia" : "dias"}` : m;
}

/** Situação da garantia hoje: dias que faltam, % do prazo já passado e a fase. */
export function warrantyState(w: { start_date: string; end_date: string }, today: string) {
  const total = Math.max(1, daysBetween(w.start_date, w.end_date));
  const left = daysBetween(today, w.end_date);
  const sinceStart = daysBetween(w.start_date, today);
  const elapsed = Math.max(0, Math.min(100, Math.round((sinceStart / total) * 100)));
  const phase: WarrantyPhase =
    sinceStart < 0 ? "futura" : left < 0 ? "encerrada" : left <= SOON_DAYS ? "vencendo" : "ativa";
  const label =
    phase === "futura"
      ? `Começa em ${-sinceStart} ${-sinceStart === 1 ? "dia" : "dias"}`
      : phase === "encerrada"
        ? `Encerrada há ${-left} ${-left === 1 ? "dia" : "dias"}`
        : left === 0
          ? "Vence hoje"
          : `Faltam ${left} ${left === 1 ? "dia" : "dias"}`;
  return { total, left, elapsed, phase, label, span: spanLabel(left) };
}

/** Data sugerida para a vistoria final: um mês antes do fim (no 11º mês de 12). */
export const finalInspectionDate = (w: {
  end_date: string;
  final_inspection_date?: string | null;
}) => w.final_inspection_date || addMonths(w.end_date, -1);

/** Prazo padrão em meses → data de fim a partir da entrega. */
export const warrantyEnd = (start: string, months = WARRANTY_MONTHS) => addMonths(start, months);

export type Evaluation =
  | "a_avaliar"
  | "procedente"
  | "mau_uso"
  | "desgaste"
  | "terceiros"
  | "preexistente"
  | "material_cliente";

export const EVALUATION_LABEL: Record<Evaluation, string> = {
  a_avaliar: "A avaliar",
  procedente: "Procedente",
  mau_uso: "Não coberto: mau uso",
  desgaste: "Não coberto: desgaste natural",
  terceiros: "Não coberto: intervenção de terceiros",
  preexistente: "Não coberto: problema preexistente",
  material_cliente: "Não coberto: material do cliente",
};

/** Motivo curto (para o relatório) dos não cobertos. */
export const NOT_COVERED_SHORT: Partial<Record<Evaluation, string>> = {
  mau_uso: "mau uso",
  desgaste: "desgaste natural",
  terceiros: "intervenção de terceiros",
  preexistente: "problema preexistente",
  material_cliente: "material do cliente",
};

export const isCovered = (e: string) => e === "a_avaliar" || e === "procedente";

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  email: "E-mail",
  visita: "Visita",
  outro: "Outro",
};

export const OUTCOME_LABEL: Record<string, string> = {
  avaliacao: "Só avaliação",
  reparo: "Reparo feito",
  voltar: "Precisa voltar",
  resolvido: "Resolvido",
};

export type ClaimStatus = "aberto" | "agendado" | "em_atendimento" | "resolvido" | "nao_coberto";

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  aberto: "Aberto",
  agendado: "Agendado",
  em_atendimento: "Em atendimento",
  resolvido: "Resolvido",
  nao_coberto: "Não coberto",
};

export interface ClaimLike {
  id: string;
  reported_at: string;
  evaluation: string;
  resolved_at: string | null;
}
export interface VisitLike {
  claim_id: string;
  visit_date: string;
  done: boolean;
  outcome: string | null;
}

const visitsOf = <V extends VisitLike>(claimId: string, visits: V[]) =>
  visits
    .filter((v) => v.claim_id === claimId)
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date));

/** Situação do chamado a partir da avaliação e das visitas. */
export function claimStatus(c: ClaimLike, visits: VisitLike[]): ClaimStatus {
  if (!isCovered(c.evaluation)) return "nao_coberto";
  if (c.resolved_at) return "resolvido";
  const vs = visitsOf(c.id, visits);
  if (vs.some((v) => v.done)) return "em_atendimento";
  if (vs.length) return "agendado";
  return "aberto";
}

export const isOpenClaim = (c: ClaimLike, visits: VisitLike[]) => {
  const s = claimStatus(c, visits);
  return s !== "resolvido" && s !== "nao_coberto";
};

/**
 * Prazo de atendimento: 1ª visita feita em até 5 dias úteis do aviso. `state`:
 * "no_prazo" (aberto, ainda dá tempo), "fora_do_prazo" (aberto e passou), "cumprido" (visitou a
 * tempo) ou "atrasou" (visitou depois do prazo). Não coberto sem visita não conta.
 */
export function claimSla(c: ClaimLike, visits: VisitLike[], today: string) {
  const deadline = addBusinessDays(c.reported_at, SLA_BUSINESS_DAYS);
  const first = visitsOf(c.id, visits).find((v) => v.done)?.visit_date ?? null;
  const nextScheduled =
    visitsOf(c.id, visits).find((v) => !v.done && v.visit_date >= today)?.visit_date ?? null;
  if (first) {
    const days = businessDaysBetween(c.reported_at, first);
    return {
      deadline,
      first,
      nextScheduled,
      days,
      state: (first <= deadline ? "cumprido" : "atrasou") as SlaState,
      late: Math.max(0, businessDaysBetween(deadline, first)),
      left: 0,
    };
  }
  if (!isCovered(c.evaluation) || c.resolved_at)
    return {
      deadline,
      first,
      nextScheduled,
      days: null,
      state: "nao_conta" as SlaState,
      late: 0,
      left: 0,
    };
  const late = businessDaysBetween(deadline, today);
  return {
    deadline,
    first,
    nextScheduled,
    days: null,
    state: (today > deadline ? "fora_do_prazo" : "no_prazo") as SlaState,
    late,
    left: today > deadline ? 0 : businessDaysBetween(today, deadline),
  };
}
export type SlaState = "no_prazo" | "fora_do_prazo" | "cumprido" | "atrasou" | "nao_conta";

/** Texto curto do prazo de atendimento. */
export function slaLabel(s: ReturnType<typeof claimSla>) {
  const d = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
  switch (s.state) {
    case "no_prazo":
      return s.left ? `No prazo · faltam ${d(s.left)}` : "No prazo · vence hoje";
    case "fora_do_prazo":
      return `Fora do prazo · ${d(s.late)} de atraso`;
    case "cumprido":
      return `Atendido em ${d(s.days ?? 0)}`;
    case "atrasou":
      return `Atendido com ${d(s.late)} de atraso`;
    default:
      return "";
  }
}

/** Nº do chamado para a tela: GAR-0004. */
export const claimCode = (n: number) => `GAR-${String(n).padStart(4, "0")}`;

/** Quantas vezes a mesma etapa já deu chamado nesta garantia até este chamado (1 = primeira). */
export function repeatIndex<
  C extends { id: string; warranty_id: string; stage_id: string | null; reported_at: string },
>(c: C, claims: C[]) {
  if (!c.stage_id) return 1;
  return claims.filter(
    (x) =>
      x.warranty_id === c.warranty_id &&
      x.stage_id === c.stage_id &&
      (x.reported_at < c.reported_at || (x.reported_at === c.reported_at && x.id <= c.id)),
  ).length;
}

export interface ReportClaim extends ClaimLike {
  warranty_id: string;
  stage_id: string | null;
  executor_kind: string;
  executor_id: string | null;
  lesson: string | null;
  description: string;
}

/**
 * Números do relatório para os chamados avisados no período [from, to]: totais, por etapa (com
 * visitas, custo e quantas obras), por quem executou (chamados por obra entregue), por obra,
 * avaliação (procedentes × motivos de não cobertura) e tempos (1ª visita e resolução).
 */
export function warrantyReport<C extends ReportClaim>({
  claims,
  visits,
  costs,
  from,
  to,
  stageName,
  executorName,
  warrantyName,
}: {
  claims: C[];
  visits: VisitLike[];
  /** Custo lançado por chamado (contas a pagar ligadas ao chamado, sem canceladas). */
  costs: Map<string, number>;
  from: string;
  to: string;
  stageName: (id: string | null) => string;
  executorName: (kind: string, id: string | null) => string;
  warrantyName: (id: string) => string;
}) {
  const inPeriod = claims.filter((c) => c.reported_at >= from && c.reported_at <= to);
  const ids = new Set(inPeriod.map((c) => c.id));
  const vs = visits.filter((v) => ids.has(v.claim_id) && v.done);
  const cost = (c: C) => costs.get(c.id) ?? 0;
  const covered = inPeriod.filter((c) => isCovered(c.evaluation));
  const slas = covered.map((c) => claimSla(c, visits, to));
  const firstDays = slas.filter((s) => s.days !== null).map((s) => s.days!);
  const onTime = slas.filter((s) => s.state === "cumprido").length;
  const measured = slas.filter(
    (s) => s.state === "cumprido" || s.state === "atrasou" || s.state === "fora_do_prazo",
  ).length;
  const resolveDays = covered
    .filter((c) => c.resolved_at)
    .map((c) => businessDaysBetween(c.reported_at, c.resolved_at!));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const group = <K extends string>(key: (c: C) => K) => {
    const m = new Map<K, C[]>();
    for (const c of inPeriod) m.set(key(c), [...(m.get(key(c)) ?? []), c]);
    return m;
  };
  const visitsOfClaims = (cs: C[]) => {
    const s = new Set(cs.map((c) => c.id));
    return vs.filter((v) => s.has(v.claim_id)).length;
  };
  const total = inPeriod.length;
  const share = (n: number) => (total ? n / total : 0);

  const byStage = [...group((c) => (c.stage_id ?? "") as string)]
    .map(([id, cs]) => ({
      id,
      name: stageName(id || null),
      claims: cs.length,
      covered: cs.filter((c) => isCovered(c.evaluation)).length,
      visits: visitsOfClaims(cs),
      works: new Set(cs.map((c) => c.warranty_id)).size,
      cost: cs.reduce((a, c) => a + cost(c), 0),
      share: share(cs.length),
    }))
    .sort((a, b) => b.claims - a.claims || b.cost - a.cost);

  const byExecutor = [...group((c) => `${c.executor_kind}:${c.executor_id ?? ""}`)]
    .map(([key, cs]) => {
      const [kind, id] = key.split(":");
      const works = new Set(cs.map((c) => c.warranty_id)).size;
      return {
        key,
        name: executorName(kind!, id || null),
        claims: cs.length,
        works,
        perWork: works ? cs.length / works : 0,
        cost: cs.reduce((a, c) => a + cost(c), 0),
      };
    })
    .sort((a, b) => b.claims - a.claims);

  const byWarranty = [...group((c) => c.warranty_id)]
    .map(([id, cs]) => ({
      id,
      name: warrantyName(id),
      claims: cs.length,
      visits: visitsOfClaims(cs),
      cost: cs.reduce((a, c) => a + cost(c), 0),
    }))
    .sort((a, b) => b.claims - a.claims || b.cost - a.cost);

  const reasons = Object.entries(NOT_COVERED_SHORT)
    .map(([k, label]) => ({
      key: k,
      label: label!,
      count: inPeriod.filter((c) => c.evaluation === k).length,
    }))
    .filter((r) => r.count);

  return {
    total,
    visits: vs.length,
    visitsPerClaim: total ? vs.length / total : 0,
    open: inPeriod.filter((c) => isOpenClaim(c, visits)).length,
    covered: inPeriod.filter((c) => c.evaluation === "procedente").length,
    pending: inPeriod.filter((c) => c.evaluation === "a_avaliar").length,
    notCovered: inPeriod.filter((c) => !isCovered(c.evaluation)).length,
    reasons,
    onTimeRate: measured ? onTime / measured : null,
    avgFirstVisit: avg(firstDays),
    avgResolution: avg(resolveDays),
    cost: inPeriod.reduce((a, c) => a + cost(c), 0),
    byStage,
    byExecutor,
    byWarranty,
    lessons: inPeriod
      .filter((c) => c.lesson?.trim())
      .sort((a, b) => b.reported_at.localeCompare(a.reported_at))
      .map((c) => ({ id: c.id, stage: stageName(c.stage_id), lesson: c.lesson!.trim() })),
  };
}

/**
 * Avisos de garantia do Painel ("Precisa de você"): chamados com a 1ª visita fora do prazo e
 * garantias que vencem em até 30 dias sem a vistoria final feita. Mais graves primeiro.
 */
export function warrantyAlerts<
  W extends {
    id: string;
    start_date: string;
    end_date: string;
    final_inspection_date?: string | null;
    final_inspection_done: boolean;
  },
  C extends ClaimLike & { warranty_id: string; description: string },
>(warranties: W[], claims: C[], visits: VisitLike[], today: string, name: (w: W) => string) {
  const byId = new Map(warranties.map((w) => [w.id, w]));
  const late = claims
    .filter((c) => byId.has(c.warranty_id))
    .map((c) => ({ c, sla: claimSla(c, visits, today) }))
    .filter((x) => x.sla.state === "fora_do_prazo")
    .sort((a, b) => b.sla.late - a.sla.late)
    .map(({ c, sla }) => ({
      kind: "atendimento" as const,
      warrantyId: c.warranty_id,
      title: "Chamado de garantia fora do prazo",
      detail: `${name(byId.get(c.warranty_id)!)} · ${c.description.split("\n")[0]} · ${sla.late} ${
        sla.late === 1 ? "dia útil" : "dias úteis"
      } de atraso na 1ª visita`,
    }));
  const expiring = warranties
    .map((w) => ({ w, s: warrantyState(w, today) }))
    .filter((x) => x.s.phase === "vencendo" && !x.w.final_inspection_done)
    .sort((a, b) => a.s.left - b.s.left)
    .map(({ w, s }) => ({
      kind: "vencimento" as const,
      warrantyId: w.id,
      title:
        s.left === 0
          ? "Garantia vence hoje"
          : `Garantia vence em ${s.left} ${s.left === 1 ? "dia" : "dias"}`,
      detail: `${name(w)} · vence em ${w.end_date.split("-").reverse().join("/")} · vistoria final ainda não feita`,
    }));
  return [...late, ...expiring];
}
