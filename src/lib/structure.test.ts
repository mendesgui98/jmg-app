import { describe, expect, it } from "vitest";
import {
  addMonths,
  anticipate,
  averageShare,
  breakEven,
  coverageMonths,
  coverageTone,
  dueInMonth,
  firstNegative,
  minimumWork,
  monthLong,
  monthShort,
  monthlyCost,
  structureForecast,
  structureLedger,
  structureShare,
  type FixedCostLike,
} from "./structure";

const cost = (o: Partial<FixedCostLike>): FixedCostLike => ({
  id: "c",
  name: "Custo",
  category: "outros",
  amount: 100,
  recurrence: "mensal",
  due_day: 10,
  due_month: null,
  active: true,
  starts_on: "2026-01-01",
  ends_on: null,
  ...o,
});

describe("custos fixos", () => {
  it("custo mensal: mensais + anuais ÷ 12 + trimestrais ÷ 3, só os ativos", () => {
    expect(
      monthlyCost(
        [
          cost({ amount: 3800 }),
          cost({ amount: 10000 }),
          cost({ amount: 2400, recurrence: "anual", due_month: 3 }),
          cost({ amount: 900, recurrence: "trimestral", due_month: 1 }),
          cost({ amount: 500, active: false }),
          cost({ amount: 700, ends_on: "2026-10-31" }),
        ],
        "2026-11-02",
      ),
    ).toBe(3800 + 10000 + 200 + 300);
  });
  it("vencimento: anual só no mês dele, trimestral a cada 3 meses, respeita início e fim", () => {
    const anual = cost({ recurrence: "anual", due_month: 3 });
    expect(dueInMonth(anual, "2027-03")).toBe(true);
    expect(dueInMonth(anual, "2027-04")).toBe(false);
    const tri = cost({ recurrence: "trimestral", due_month: 2 });
    expect(["2026-11", "2026-12", "2027-01", "2027-02"].map((m) => dueInMonth(tri, m))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(dueInMonth(cost({ starts_on: "2026-12-05" }), "2026-11")).toBe(false);
    expect(dueInMonth(cost({ ends_on: "2026-10-31" }), "2026-11")).toBe(false);
  });
  it("meses", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(monthShort("2026-11")).toBe("Nov/26");
    expect(monthLong("2027-03")).toBe("março");
  });
});

describe("caixa da estrutura", () => {
  const shares = new Map([["w1", 0.093]]);
  const e = (id: string, o: Record<string, unknown>) => ({
    id,
    work_id: null,
    direction: "saida",
    category: "Custo fixo",
    description: id,
    canceled: false,
    amount: 0,
    due_date: "2026-11-05",
    ...o,
  });
  const entries = [
    e("parcela", { work_id: "w1", direction: "entrada", category: "Contrato" }),
    e("aluguel", {}),
    e("material obra", { work_id: "w1", category: "Materiais" }),
    e("imposto", { category: "Impostos" }),
    e("aporte", { direction: "entrada", category: "Aporte" }),
    e("cancelada", { canceled: true }),
  ];
  const s = (id: string, entry_id: string, amount: number) => ({
    id,
    entry_id,
    amount,
    paid_date: "2026-11-05",
  });
  const settlements = [
    s("1", "parcela", 100000),
    s("2", "aluguel", 3800),
    s("3", "material obra", 5000),
    s("4", "imposto", 900),
    s("5", "aporte", 2000),
    s("6", "cancelada", 50),
  ];
  it("entra a fração da estrutura do orçamento; saem só as saídas gerais (sem impostos)", () => {
    const l = structureLedger(shares, entries, settlements);
    expect(l).toMatchObject({ fromWorks: 9300, contributions: 2000, spent: 3800, balance: 7500 });
    expect(l.rows.map((r) => r.kind).sort()).toEqual(["aporte", "entrada_obra", "saida"]);
  });
  it("fração = estrutura ÷ venda do orçamento", () => {
    expect(structureShare({ structure: 9300, saleNet: 100000 })).toBeCloseTo(0.093);
    expect(structureShare({ saleNet: 0 })).toBe(0);
    expect(structureShare({ structure: undefined, saleNet: 5000 })).toBe(0);
  });
});

describe("previsão, cobertura e simuladores", () => {
  const shares = new Map([["w1", 0.1]]);
  const receivables = [
    { id: "vencida", workId: "w1", description: "", due_date: "2026-10-20", pending: 10000 },
    { id: "dez", workId: "w1", description: "", due_date: "2026-12-10", pending: 50000 },
    { id: "mar", workId: "w1", description: "", due_date: "2027-03-10", pending: 80000 },
  ];
  const forecast = structureForecast({
    balance: 10000,
    monthlyCost: 6000,
    paidThisMonth: 4000,
    receivables,
    shares,
    today: "2026-11-02",
  });
  it("mês atual: parcelas vencidas entram e só o custo que falta pagar sai", () => {
    expect(forecast[0]).toMatchObject({
      ym: "2026-11",
      receipts: 10000,
      inflow: 1000,
      cost: 2000,
      balance: 9000,
    });
    expect(forecast.map((m) => m.balance)).toEqual([9000, 8000, 2000, -4000, -2000, -8000]);
  });
  it("primeiro mês negativo e tom crítico", () => {
    expect(firstNegative(forecast)?.ym).toBe("2027-02");
    expect(coverageTone(coverageMonths(10000, 6000), forecast)).toBe("critico");
    expect(coverageTone(3.5, [])).toBe("confortavel");
    expect(coverageTone(1.5, [])).toBe("atencao");
  });
  it("antecipar a parcela de março para janeiro adia o primeiro mês negativo", () => {
    const sim = structureForecast({
      balance: 10000,
      monthlyCost: 6000,
      paidThisMonth: 4000,
      receivables: anticipate(receivables, "mar", "2027-01"),
      shares,
      today: "2026-11-02",
    });
    expect(sim.map((m) => m.balance)).toEqual([9000, 8000, 10000, 4000, -2000, -8000]);
    expect(firstNegative(sim)?.ym).toBe("2027-03");
  });
  it("obra mínima: 3 meses de R$ 6.000 com 10% de estrutura, 30% de entrada em 4 meses", () => {
    const r = minimumWork({ monthly: 6000, months: 3, share: 0.1, downPct: 30, duration: 4 });
    expect(r.needed).toBe(18000);
    expect(r.fraction).toBeCloseTo(0.3 + 0.7 * (2 / 4));
    expect(r.sale).toBeCloseTo(18000 / 0.1 / 0.65, 1);
    expect(r.saleUpfront).toBe(180000);
    expect(
      minimumWork({ monthly: 1, months: 1, share: 0, downPct: 30, duration: 4 }).sale,
    ).toBeNull();
  });
  it("ponto de equilíbrio e fração média ponderada", () => {
    expect(breakEven(6000, 0.125)).toBe(48000);
    expect(breakEven(6000, 0)).toBeNull();
    expect(
      averageShare(
        [
          { sale: 100000, share: 0.1 },
          { sale: 300000, share: 0.05 },
        ],
        0.125,
      ),
    ).toBeCloseTo(25000 / 400000);
    expect(averageShare([], 0.125)).toBe(0.125);
  });
});
