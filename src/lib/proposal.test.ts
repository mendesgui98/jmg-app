import { describe, expect, it } from "vitest";
import { emptyParams } from "./pricing";
import { dataPorExtenso, diaMesCurto, numeroPorExtenso, reaisPorExtenso } from "./extenso";
import {
  buildProposal,
  contractIssues,
  DEFAULT_TERMS,
  proposalIssues,
  proposalNumber,
  scheduleEnd,
  stageDates,
  stageWeeks,
  type ProposalInput,
} from "./proposal";

const material = (price: number, consumption = 1) => ({
  name: "Cimento CP-II 50 kg",
  material_id: "cimento",
  consumption_unit: "sc",
  purchase_unit: "sc",
  conversion: 1,
  consumption,
  loss_pct: 0,
  price,
  supplied_by: "jmg" as const,
});

const item = (section_id: string, over = {}) => ({
  section_id,
  description: "Contrapiso",
  unit: "m2",
  quantity: 10,
  labor_cost_unit: 100,
  materials: [material(38)],
  labor_markup_override: null,
  materials_markup_override: null,
  item_discount: 0,
  ...over,
});

const input = (over: Partial<ProposalInput["budget"]> = {}): ProposalInput => ({
  today: "2026-10-28",
  client: {
    name: "Mariana Albuquerque Ribeiro",
    document: "12345678909",
    rg: null,
    endereco: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
  },
  sections: [
    { id: "s1", title: "Demolição", description: null, start_week: null, duration_weeks: null },
    { id: "s2", title: "Elétrica", description: "Circuitos", start_week: 2, duration_weeks: 2 },
  ],
  items: [item("s1"), item("s2", { materials: [material(38), material(20, 2)] })],
  budget: {
    number: 147,
    revision: 0,
    status: "elaboracao",
    title: "Reforma completa de apartamento",
    description: null,
    client_display: "Mariana Albuquerque Ribeiro",
    endereco: "Rua das Palmeiras, 482 – Apto 1203",
    bairro: "Jardim Europa",
    cidade: "São Paulo",
    uf: "SP",
    cep: "01449000",
    issue_date: "2026-10-20",
    validity_date: null,
    start_date: "2026-11-16",
    estimated_weeks: null,
    property_type: "Apartamento",
    property_area: 78,
    responsible: null,
    notes: null,
    general_discount: 0,
    params: { ...emptyParams, labor_markup: 50, materials_markup: 20 },
    payment_terms: DEFAULT_TERMS,
    ...over,
  },
});

describe("proposta oficial", () => {
  it("número, datas automáticas e responsável padrão", () => {
    const p = buildProposal(input());
    expect(p.number).toBe("ORC-2026-0147");
    expect(p.issueDate).toBe("2026-10-28");
    expect(p.validUntil).toBe("2026-11-12");
    expect(p.validityDays).toBe(15);
    expect(p.responsible).toBe("Guilherme Andriola Mendes");
    expect(p.property).toBe("Apartamento · 78 m²");
    expect(p.client.document).toBe("123.456.789-09");
    expect(p.site.line2).toBe("Jardim Europa · São Paulo – SP · CEP 01449-000");
  });

  it("cronograma em semanas e prazo vindo do cronograma", () => {
    expect(
      stageWeeks([
        { start_week: null, duration_weeks: null },
        { start_week: null, duration_weeks: 3 },
      ]),
    ).toEqual([
      { startWeek: 1, weeks: 1 },
      { startWeek: 2, weeks: 3 },
    ]);
    const p = buildProposal(input());
    expect(p.weeks).toBe(3);
    expect(p.scheduleWeeks.map((w) => w.date)).toEqual(["16 de nov", "23 de nov", "30 de nov"]);
    expect(scheduleEnd("2026-11-16", 8)).toBe("2027-01-08");
    expect(buildProposal(input({ estimated_weeks: 6 })).weeks).toBe(6);
  });

  it("datas das etapas a partir do início previsto (mesma conta da obra)", () => {
    expect(
      stageDates("2026-11-16", [
        { start_week: null, duration_weeks: 2 },
        { start_week: null, duration_weeks: null },
        { start_week: 2, duration_weeks: 3 },
      ]),
    ).toEqual([
      { start: "2026-11-16", end: "2026-11-27" },
      { start: "2026-11-30", end: "2026-12-04" },
      { start: "2026-11-23", end: "2026-12-11" },
    ]);
  });

  it("materiais a preço de venda e mão de obra só no total", () => {
    const p = buildProposal(input());
    // Materiais: 10 sc × 38 × 1,2 = 456 (etapa 1); etapa 2 soma 10 sc + 20 sc.
    expect(p.materials[0]?.lines[0]).toMatchObject({ quantity: 10, unitPrice: 45.6, total: 456 });
    expect(p.materials[1]?.lines).toHaveLength(1);
    expect(p.materials[1]?.lines[0]?.quantity).toBe(30);
    expect(p.totals.labor).toBe(3000);
    expect(p.totals.total).toBe(p.totals.labor + p.totals.materials);
    expect(p.stages[0]?.services[0]).toEqual({
      description: "Contrapiso",
      unit: "m²",
      quantity: 10,
    });
    expect(JSON.stringify(p)).not.toContain("labor_cost_unit");
  });

  it("parcelas em centavos e bloqueio quando não fecham 100%", () => {
    const p = buildProposal(input());
    expect(p.payments.reduce((s, x) => Math.round((s + x.value) * 100) / 100, 0)).toBe(
      p.totals.total,
    );
    expect(proposalIssues(p)).toEqual([]);
    const bad = buildProposal(input({ payment_terms: [{ label: "Entrada", pct: 90 }] }));
    expect(proposalIssues(bad)[0]).toContain("90%");
    expect(contractIssues(p)[0]).toContain("aprovado");
    expect(contractIssues(buildProposal(input({ status: "aprovado" })))).toEqual([]);
  });

  it("observações padrão e número formatado", () => {
    expect(buildProposal(input()).notes).toHaveLength(4);
    expect(buildProposal(input({ notes: "- Uma\n\n• Duas" })).notes).toEqual(["Uma", "Duas"]);
    expect(proposalNumber(5, "2027-01-02")).toBe("ORC-2027-0005");
  });
});

describe("por extenso", () => {
  it("valores e datas como no modelo", () => {
    expect(reaisPorExtenso(53266)).toBe("cinquenta e três mil, duzentos e sessenta e seis reais");
    expect(reaisPorExtenso(15979.8)).toBe(
      "quinze mil, novecentos e setenta e nove reais e oitenta centavos",
    );
    expect(dataPorExtenso("2026-11-12")).toBe("12 de novembro de 2026");
    expect(diaMesCurto("2027-01-04")).toBe("04 de jan");
    expect(numeroPorExtenso(8)).toBe("oito");
  });
});

describe("cláusulas do contrato", () => {
  const values = {
    OBJETO: "reforma",
    ENDERECO_OBRA: "Rua A",
    AREA: "",
    ORCAMENTO: "<b>Orçamento nº ORC-2026-0007</b>",
    DATA_ORCAMENTO: "01/10/2026",
    VALOR: "R$ 1,00",
    MAO_DE_OBRA: "R$ 0,60",
    MATERIAIS: "R$ 0,40",
    INICIO: "16/11/2026",
    PRAZO: "8 semanas",
  };
  it("numera pela ordem, troca marcadores e separa números, incisos e itens", async () => {
    const { renderClauses, unknownTokens } = await import("./contract-clauses");
    const out = renderClauses(
      [
        { title: "Valor", body: "{{N}}.1. Valor de {{VALOR}} <x>" },
        { title: " ", body: "ignorada" },
        {
          title: "Prazo",
          body: "{{N}}.1. Início {{INICIO}}\n{{N}}.1.1. Assinatura\nI – atraso\n- assinatura;\n2 (duas) vias em **São Paulo**\n{{TABELA_PARCELAS}}",
        },
      ],
      values,
    );
    expect(out.map((c) => c.number)).toEqual([1, 2]);
    expect(out[0]?.blocks[0]).toEqual({
      kind: "p",
      num: "1.1.",
      html: "Valor de R$ 1,00 &lt;x&gt;",
    });
    expect(out[1]?.blocks).toEqual([
      { kind: "p", num: "2.1.", html: "Início 16/11/2026" },
      { kind: "sub", num: "2.1.1.", html: "Assinatura" },
      { kind: "roman", num: "I", html: "atraso" },
      { kind: "item", html: "assinatura;" },
      { kind: "p", num: null, html: "2 (duas) vias em <b>São Paulo</b>" },
      { kind: "block", block: "TABELA_PARCELAS" },
    ]);
    expect(unknownTokens("{{N}} {{VALOR}} {{CLIENTE}} {{CLIENTE}}")).toEqual(["CLIENTE"]);
  });

  it("o modelo de contrato carregado no banco só usa marcadores conhecidos", async () => {
    const { readFileSync } = await import("node:fs");
    const { renderClauses, unknownTokens } = await import("./contract-clauses");
    const sql = readFileSync("supabase/migrations/20261030000032_contract_model_2026.sql", "utf8");
    const clauses = [...sql.matchAll(/\(\d+, '([^']+)', \$t\$([\s\S]*?)\$t\$\)/g)].map((m) => ({
      title: m[1]!,
      body: m[2]!,
    }));
    expect(clauses).toHaveLength(13);
    expect(clauses.flatMap((c) => unknownTokens(c.body))).toEqual([]);
    const html = JSON.stringify(renderClauses(clauses, values));
    expect(html).not.toMatch(/\{\{/);
  });
});
