// Gera um orçamento de exemplo (dados do modelo aprovado) para conferir o visual sem banco:
//   node --experimental-strip-types api/src/pdf/sample.ts saida.pdf [--contrato] [--paginado]
// CLAUSES_JSON=arquivo.json usa as cláusulas exportadas do banco no lugar das de exemplo.
import { readFileSync, writeFileSync } from "node:fs";
import { buildProposal, DEFAULT_TERMS } from "../../../src/lib/proposal.ts";
import { emptyParams } from "../../../src/lib/pricing.ts";
import { createPdfService } from "./index.ts";
import { closeBrowser } from "./render.ts";
import { COMPANY_ACCOUNT } from "../../../src/lib/bank-accounts.ts";

const mat = (name: string, unit: string, price: number, consumption: number) => ({
  name,
  consumption_unit: unit,
  purchase_unit: unit,
  conversion: 1,
  consumption,
  loss_pct: 0,
  price,
  supplied_by: "jmg" as const,
});
const stages = [
  [
    "Serviços preliminares e demolição",
    "Proteção das áreas, retirada de revestimentos e descarte de entulho.",
    1,
    1,
  ],
  ["Instalações hidráulicas", "Readequação de pontos de água fria, quente e esgoto.", 2, 1],
  [
    "Instalações elétricas",
    "Novos circuitos para cozinha e banheiro e substituição de pontos.",
    2,
    2,
  ],
  [
    "Alvenaria, reboco e contrapiso",
    "Regularização de paredes e pisos para receber os revestimentos.",
    3,
    1,
  ],
  [
    "Revestimentos – pisos e paredes",
    "Assentamento de porcelanato e revestimentos cerâmicos.",
    4,
    2,
  ],
  ["Forro de gesso", "Forro em drywall com tabica e preparação para iluminação embutida.", 5, 1],
  ["Pintura", "Preparação e pintura de paredes, tetos e forro.", 6, 2],
  ["Louças, metais e entrega", "Instalação final, limpeza fina e vistoria de entrega.", 7, 2],
] as const;
const sections = stages.map(([title, description, start_week, duration_weeks], i) => ({
  id: `s${i}`,
  title,
  description,
  start_week,
  duration_weeks,
}));
const items = sections.flatMap((s, i) =>
  [0, 1, 2, 3].map((k) => ({
    section_id: s.id,
    description: `Serviço ${k + 1} da etapa ${s.title.toLowerCase()}`,
    unit: ["m2", "un", "ml", "vb"][k]!,
    quantity: [24, 4, 30, 1][k]!,
    labor_cost_unit: [60, 120, 25, 900][k]!,
    materials:
      k < 2
        ? [mat(`Material ${i + 1}.${k + 1} (embalagem)`, ["sc", "rl"][k]!, 38 + i * 10, 0.5)]
        : [],
    labor_markup_override: null,
    materials_markup_override: null,
    item_discount: 0,
  })),
);
const data = buildProposal({
  today: new Date().toISOString().slice(0, 10),
  client: {
    name: "Mariana Albuquerque Ribeiro",
    document: "00000000000",
    rg: "000000000",
    endereco: "Rua das Palmeiras, 482 – Apto 1203",
    bairro: "Jardim Europa",
    cidade: "São Paulo",
    uf: "SP",
    cep: "01449000",
  },
  sections,
  items,
  budget: {
    number: 147,
    revision: 0,
    status: "aprovado",
    title: "Reforma completa de apartamento",
    description:
      "Reforma de cozinha, área de serviço e banheiro social, com troca de revestimentos, readequação elétrica e hidráulica, forro de gesso e pintura geral.",
    client_display: "Mariana Albuquerque Ribeiro",
    endereco: "Rua das Palmeiras, 482 – Apto 1203",
    bairro: "Jardim Europa",
    cidade: "São Paulo",
    uf: "SP",
    cep: "01449000",
    issue_date: "2026-10-28",
    validity_date: null,
    start_date: "2026-11-16",
    estimated_weeks: null,
    property_type: "Apartamento",
    property_area: 78,
    responsible: null,
    notes: null,
    general_discount: 0,
    params: { ...emptyParams, labor_markup: 40, materials_markup: 10 },
    payment_terms: DEFAULT_TERMS,
  },
});
// Cláusulas do modelo atual, lidas da migração que as carrega no banco (no sistema elas vêm de
// contract_clauses, Configurações → Contrato).
const MODEL_MIGRATION = new URL(
  "../../../supabase/migrations/20261030000032_contract_model_2026.sql",
  import.meta.url,
);
const SAMPLE_CLAUSES = [
  ...readFileSync(MODEL_MIGRATION, "utf8").matchAll(/\(\d+, '([^']+)', \$t\$([\s\S]*?)\$t\$\)/g),
].map((m) => ({ title: m[1]!, body: m[2]! }));
const out = process.argv[2] ?? "orcamento-exemplo.pdf";
const layout = process.argv.includes("--paginado") ? "paginado" : "continuo";
const pdf = createPdfService();
writeFileSync(
  out,
  process.argv.includes("--contrato")
    ? await pdf.contract(
        data,
        data.issueDate,
        process.env["CLAUSES_JSON"]
          ? JSON.parse(readFileSync(process.env["CLAUSES_JSON"], "utf8"))
          : SAMPLE_CLAUSES,
        layout,
        COMPANY_ACCOUNT,
      )
    : await pdf.proposal(data, layout),
);
await closeBrowser();
console.log(out);
