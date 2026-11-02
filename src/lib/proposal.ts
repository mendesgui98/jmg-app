// Dados do PDF oficial de orçamento e do contrato (modelo JMG aprovado). Módulo puro: monta o
// documento a partir das linhas do banco e é usado pela API (api/) para gerar o PDF e pelo app
// para avisar o que falta antes de gerar. Imports com extensão .ts porque a API roda o
// TypeScript direto no Node. Nenhum custo interno sai daqui: só preço de venda.

import { formatCep, formatCpfCnpj, formatRg } from "./documents.ts";
import { diaMesCurto, reaisPorExtenso } from "./extenso.ts";
import {
  clientPriceSheet,
  splitPayments,
  type ClientMaterialLine,
  type ItemMaterial,
  type PricingParams,
} from "./pricing.ts";

export const COMPANY = {
  name: "JMG Reformas LTDA",
  shortName: "JMG Reformas",
  cnpj: "62.780.542/0001-81",
  street: "Rua da Turquesa, 43",
  district: "Refúgio dos Bandeirantes",
  city: "Santana de Parnaíba – SP",
  cep: "06506-055",
  phone: "(11) 99893-7694",
  instagram: "@jmg.reformas",
  responsible: "Guilherme Andriola Mendes",
  bank: "Banco C6",
  agency: "0001",
  account: "39813290-9",
  pix: "62.780.542/0001-81",
};

export const VALIDITY_DAYS = 15;
export const PAYMENT_METHODS = "PIX, transferência bancária ou boleto.";

export type ProposalTerm = { label: string; when?: string; pct: number };

export const DEFAULT_TERMS: ProposalTerm[] = [
  { label: "Entrada na assinatura", when: "Na aprovação do orçamento", pct: 30 },
  { label: "1ª medição", when: "Ao concluir as etapas 1 a 4", pct: 25 },
  { label: "2ª medição", when: "Ao concluir as etapas 5 e 6", pct: 25 },
  { label: "Entrega da obra", when: "Na vistoria final e termo de entrega", pct: 20 },
];

export const DEFAULT_NOTES = [
  "Materiais de acabamento (porcelanato, revestimentos, louças e metais) cotados em padrão médio-alto; a troca de modelo pelo cliente pode alterar o valor.",
  "Louças, metais, bancadas de pedra e luminárias decorativas não estão inclusos, apenas sua instalação.",
  "Serviços não descritos neste orçamento serão orçados à parte, mediante aditivo aprovado pelo cliente.",
  "Horário de execução conforme regulamento do condomínio, de segunda a sexta-feira.",
].join("\n");

/** Formato do PDF: página única contínua (padrão) ou em folhas (blocos inteiros, folha do tamanho do conteúdo). */
export type PdfLayout = "continuo" | "paginado";
export const pdfLayout = (v: unknown): PdfLayout => (v === "paginado" ? "paginado" : "continuo");

export const SCHEDULE_DISCLAIMER =
  "O cronograma pode ser ajustado por fatores externos à JMG, como liberação do condomínio, entrega de materiais escolhidos pelo cliente ou alterações de escopo. Qualquer ajuste é comunicado previamente ao cliente.";

const UNIT: Record<string, string> = { m2: "m²", ml: "m", un: "un", diaria: "diária", vb: "vb" };

export interface ProposalBudgetRow {
  number: number;
  revision: number;
  status: string;
  title: string;
  description: string | null;
  client_display: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  issue_date: string;
  validity_date: string | null;
  start_date: string | null;
  estimated_weeks: number | null;
  property_type: string | null;
  property_area: number | null;
  responsible: string | null;
  notes: string | null;
  general_discount: number;
  params: PricingParams;
  payment_terms: ProposalTerm[];
}

export interface ProposalSectionRow {
  id: string;
  title: string;
  description: string | null;
  start_week: number | null;
  duration_weeks: number | null;
}

export interface ProposalItemRow {
  section_id: string;
  description: string;
  unit: string;
  quantity: number;
  labor_cost_unit: number;
  materials: ItemMaterial[];
  labor_markup_override: number | null;
  materials_markup_override: number | null;
  item_discount: number;
}

export interface ProposalClientRow {
  name: string;
  document: string | null;
  rg: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}

export interface ProposalInput {
  budget: ProposalBudgetRow;
  sections: ProposalSectionRow[];
  items: ProposalItemRow[];
  client: ProposalClientRow | null;
  /** Nome do usuário que criou o orçamento (responsável quando o campo está vazio). */
  creatorName?: string | null;
  /** Data de emissão = data da geração (aaaa-mm-dd). */
  today: string;
}

export interface ProposalStage {
  number: number;
  title: string;
  description: string;
  services: { description: string; unit: string; quantity: number }[];
  materialsCount: number;
  startWeek: number;
  weeks: number;
}

export interface ProposalData {
  number: string;
  revision: number;
  status: string;
  title: string;
  description: string;
  property: string | null;
  /** Área do imóvel, ex.: "78 m²" (null sem área). */
  area: string | null;
  issueDate: string;
  /** Data de emissão do orçamento (budgets.issue_date), citada no contrato. */
  budgetDate: string;
  validUntil: string;
  validityDays: number;
  startDate: string | null;
  endDate: string | null;
  weeks: number;
  scheduleWeeks: { label: string; date: string | null }[];
  responsible: string;
  client: {
    name: string;
    document: string | null;
    documentLabel: string;
    rg: string | null;
    address: string[];
  };
  site: { line1: string; line2: string; full: string; city: string };
  stages: ProposalStage[];
  materials: { stage: number; title: string; total: number; lines: ClientMaterialLine[] }[];
  materialsCount: number;
  totals: { labor: number; materials: number; total: number; totalWords: string };
  payments: { label: string; when: string; pct: number; value: number }[];
  paymentsPct: number;
  paymentMethods: string;
  notes: string[];
  company: typeof COMPANY;
}

/** Número do documento, ex.: ORC-2026-0147 (ano da criação do orçamento + número sequencial). */
export function proposalNumber(number: number, issueDate: string) {
  return `ORC-${issueDate.slice(0, 4)}-${String(number).padStart(4, "0")}`;
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Posição de cada etapa no cronograma em semanas. Etapa sem semana de início começa logo depois
 * da anterior; sem duração, dura 1 semana.
 */
export function stageWeeks(sections: Pick<ProposalSectionRow, "start_week" | "duration_weeks">[]) {
  let prevEnd = 0;
  return sections.map((s) => {
    const startWeek = s.start_week && s.start_week > 0 ? s.start_week : prevEnd + 1;
    const weeks = s.duration_weeks && s.duration_weeks > 0 ? s.duration_weeks : 1;
    prevEnd = startWeek + weeks - 1;
    return { startWeek, weeks };
  });
}

/**
 * Datas de cada etapa a partir do início previsto do orçamento: mesma conta do banco
 * (`budget_section_dates`) que dá as datas das etapas da obra criada pela conversão.
 */
export function stageDates(
  start: string,
  sections: Pick<ProposalSectionRow, "start_week" | "duration_weeks">[],
) {
  return stageWeeks(sections).map((w) => {
    const from = addDays(start, (w.startWeek - 1) * 7);
    return { start: from, end: addDays(from, w.weeks * 7 - 3) };
  });
}

/** Término previsto: sexta-feira da última semana quando a obra começa numa segunda. */
export function scheduleEnd(start: string, weeks: number) {
  return addDays(start, Math.max(1, weeks) * 7 - 3);
}

export function propertyLabel(type: string | null, area: number | null) {
  const t = (type ?? "").trim();
  const a = Number(area) > 0 ? `${Number(area).toLocaleString("pt-BR")} m²` : "";
  return [t, a].filter(Boolean).join(" · ") || null;
}

export function noteLines(notes: string | null) {
  return (notes ?? DEFAULT_NOTES)
    .split("\n")
    .map((l) => l.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);
}

export function buildProposal(input: ProposalInput): ProposalData {
  const { budget, sections, items, client, today } = input;
  const sheet = clientPriceSheet(
    items.map((it) => ({ ...it, group: it.section_id })),
    budget.params,
    budget.general_discount,
  );
  const positions = stageWeeks(sections);
  const stages: ProposalStage[] = sections.map((s, i) => ({
    number: i + 1,
    title: s.title,
    description: s.description?.trim() ?? "",
    services: items
      .filter((it) => it.section_id === s.id)
      .map((it) => ({
        description: it.description,
        unit: UNIT[it.unit] ?? it.unit,
        quantity: Number(it.quantity) || 0,
      })),
    materialsCount: sheet.materials.get(s.id)?.lines.length ?? 0,
    startWeek: positions[i]!.startWeek,
    weeks: positions[i]!.weeks,
  }));
  const chartWeeks = Math.max(0, ...stages.map((s) => s.startWeek + s.weeks - 1));
  const weeks =
    budget.estimated_weeks && budget.estimated_weeks > 0 ? budget.estimated_weeks : chartWeeks;
  const start = budget.start_date;
  const validUntil = budget.validity_date ?? addDays(today, VALIDITY_DAYS);
  const materials = stages
    .map((s, i) => ({ s, m: sheet.materials.get(sections[i]!.id) }))
    .filter((x) => x.m && x.m.lines.length)
    .map(({ s, m }) => ({ stage: s.number, title: s.title, total: m!.total, lines: m!.lines }));
  const { rows, pctSum } = splitPayments(sheet.total, budget.payment_terms ?? []);
  const doc = client?.document ? formatCpfCnpj(client.document) : null;
  const cityUf = [budget.cidade, budget.uf].filter(Boolean).join(" – ");
  const line2 = [budget.bairro, cityUf, budget.cep ? `CEP ${formatCep(budget.cep)}` : ""]
    .filter(Boolean)
    .join(" · ");
  const clientCity = [client?.cidade, client?.uf].filter(Boolean).join(" - ");
  return {
    number: proposalNumber(budget.number, budget.issue_date),
    revision: budget.revision,
    status: budget.status,
    title: budget.title?.trim() || "Reforma",
    description: budget.description?.trim() ?? "",
    property: propertyLabel(budget.property_type, budget.property_area),
    area: propertyLabel(null, budget.property_area),
    issueDate: today,
    budgetDate: budget.issue_date.slice(0, 10),
    validUntil,
    validityDays: daysBetween(today, validUntil),
    startDate: start,
    endDate: start && weeks ? scheduleEnd(start, weeks) : null,
    weeks,
    scheduleWeeks: Array.from({ length: chartWeeks }, (_, i) => ({
      label: `S${i + 1}`,
      date: start ? diaMesCurto(addDays(start, i * 7)) : null,
    })),
    responsible: budget.responsible?.trim() || input.creatorName?.trim() || COMPANY.responsible,
    client: {
      name: budget.client_display?.trim() || client?.name || "",
      document: doc,
      documentLabel: (client?.document ?? "").replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF",
      rg: client?.rg ? formatRg(client.rg) : null,
      address: [
        client?.endereco,
        client?.bairro,
        clientCity,
        client?.cep ? `CEP ${formatCep(client.cep)}` : "",
      ].filter((x): x is string => !!x),
    },
    site: {
      line1: budget.endereco?.trim() ?? "",
      line2,
      full: [budget.endereco, budget.bairro, cityUf].filter(Boolean).join(", "),
      city: budget.cidade?.trim() ?? "",
    },
    stages,
    materials,
    materialsCount: materials.reduce((s, m) => s + m.lines.length, 0),
    totals: {
      labor: sheet.laborTotal,
      materials: sheet.materialsTotal,
      total: sheet.total,
      totalWords: reaisPorExtenso(sheet.total),
    },
    payments: rows.map((r) => ({ label: r.label, when: r.when ?? "", pct: r.pct, value: r.value })),
    paymentsPct: pctSum,
    paymentMethods: PAYMENT_METHODS,
    notes: noteLines(budget.notes),
    company: COMPANY,
  };
}

/** Pendências que bloqueiam a geração do PDF do orçamento. */
export function proposalIssues(p: ProposalData) {
  const out: string[] = [];
  if (!p.client.name) out.push("Informe o nome do cliente.");
  if (!p.site.line1) out.push("Informe o endereço da obra.");
  if (!p.stages.some((s) => s.services.length)) out.push("Inclua etapas e serviços.");
  if (!(p.totals.total > 0)) out.push("O orçamento está sem valor.");
  if (!p.payments.length) out.push("Inclua as parcelas de pagamento.");
  else if (Math.abs(p.paymentsPct - 100) > 1e-9)
    out.push(
      `As parcelas somam ${p.paymentsPct.toLocaleString("pt-BR")}%. Ajuste para fechar 100%.`,
    );
  return out;
}

/** Pendências do contrato: as da proposta e o orçamento precisa estar aprovado. */
export function contractIssues(p: ProposalData) {
  const out = proposalIssues(p);
  if (p.status !== "aprovado") out.unshift("O contrato só é gerado de orçamento aprovado.");
  return out;
}
