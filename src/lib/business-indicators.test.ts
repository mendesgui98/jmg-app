import { describe, expect, it } from "vitest";
import { cashProjection, commercialFunnel, delinquency } from "./business-indicators";
import type { CompositionRow } from "./executive";

const row = (date: string | null, amount: number): CompositionRow => ({
  id: `${date}${amount}`,
  workId: null,
  work: "",
  client: "",
  description: "",
  date,
  amount,
  status: "",
  tab: "financeiro",
});

describe("R2-1 caixa projetado", () => {
  it("soma a receber e subtrai a pagar por semana; vencidos entram na primeira", () => {
    // 30/10/2026 é sexta: a primeira semana começa na segunda 26/10.
    const p = cashProjection(
      1000,
      [row("2026-10-01", 500), row("2026-11-04", 2000), row(null, 99), row("2027-06-01", 7)],
      [row("2026-11-02", 1800), row("2026-11-20", 2500)],
      "2026-10-30",
    );
    expect(p.weeks).toHaveLength(13);
    expect(p.weeks[0]).toMatchObject({ start: "2026-10-26", inflow: 500, balance: 1500 });
    expect(p.weeks[1]).toMatchObject({ inflow: 2000, outflow: 1800, balance: 1700 });
    expect(p.weeks[3]).toMatchObject({ outflow: 2500, balance: -800 });
    expect(p.firstNegative?.start).toBe("2026-11-16");
    expect(p).toMatchObject({ min: -800, end: -800, inflow: 2500, outflow: 4300 });
  });
});

describe("R2-2 funil comercial", () => {
  const b = (number: number, revision: number, status: string, value: number, extra = {}) => ({
    number,
    revision,
    status,
    value,
    issue_date: "2026-10-01",
    approval_date: null,
    ...extra,
  });
  it("conta só a última revisão e ignora substituídos", () => {
    const f = commercialFunnel([
      b(1, 0, "substituido", 100),
      b(1, 1, "aprovado", 120, { approval_date: "2026-10-11" }),
      b(2, 0, "enviado", 300),
      b(3, 0, "recusado", 50, { refusal_reason: "Preço" }),
      b(4, 0, "recusado", 80),
      b(5, 0, "elaboracao", 40),
      b(6, 0, "aprovado", 200, { approval_date: "2026-10-21" }),
    ]);
    expect(f.stages.map((s) => [s.stage, s.count])).toEqual([
      ["elaboracao", 1],
      ["enviado", 1],
      ["aprovado", 2],
      ["recusado", 2],
    ]);
    expect(f).toMatchObject({
      total: 6,
      conversion: 50,
      avgDaysToApprove: 15,
      openValue: 340,
      averageTicket: 160,
    });
    expect(f.reasons).toEqual([
      { reason: "Preço", count: 1 },
      { reason: "Não informado", count: 1 },
    ]);
  });
  it("reabrir um aprovado para edição não tira a obra dos aprovados", () => {
    const f = commercialFunnel([
      b(7, 0, "aprovado", 500, { approval_date: "2026-10-05" }),
      b(7, 1, "elaboracao", 520),
    ]);
    expect(f.stages.find((s) => s.stage === "aprovado")).toMatchObject({ count: 1, value: 500 });
    expect(f.openValue).toBe(0);
  });
  it("sem decisões não inventa conversão", () => {
    expect(commercialFunnel([b(1, 0, "enviado", 10)]).conversion).toBeNull();
  });
});

describe("R2-3 inadimplência", () => {
  it("taxa, dias médios ponderados e ranking por cliente", () => {
    const e = (id: string, amount: number, due: string, client: string) => ({
      id,
      amount,
      due_date: due,
      client,
      clientId: client,
    });
    const d = delinquency(
      [
        e("a", 1000, "2026-10-20", "Ana"), // 10 dias, metade paga
        e("b", 1000, "2026-10-10", "Ana"), // 20 dias, aberta
        e("c", 2000, "2026-10-25", "Bia"), // paga
        e("d", 500, "2026-11-10", "Bia"), // ainda não venceu
      ],
      [
        { entry_id: "a", amount: 500 },
        { entry_id: "c", amount: 2000 },
      ],
      "2026-10-30",
    );
    expect(d).toMatchObject({ expected: 4000, overdue: 1500, rate: 37.5, count: 2 });
    expect(d.avgDaysLate).toBe(17); // (500×10 + 1000×20) ÷ 1500
    expect(d.byClient).toEqual([
      { client: "Ana", clientId: "Ana", overdue: 1500, count: 2, avgDays: 17 },
    ]);
  });
});
