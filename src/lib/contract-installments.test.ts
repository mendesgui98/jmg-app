import { describe, expect, it } from "vitest";
import {
  contractInstallmentPlan,
  matchExisting,
  stageNumbers,
  stageWindows,
  termDueDate,
} from "./contract-installments";
import { DEFAULT_TERMS } from "./proposal";

const ctx = {
  approval: "2026-11-02",
  stages: [
    { start: "2026-11-02", end: "2026-11-06" },
    { start: "2026-11-09", end: "2026-11-13" },
    { start: "2026-11-16", end: "2026-11-27" },
    { start: "2026-11-30", end: "2026-12-04" },
    { start: "2026-12-07", end: "2026-12-18" },
    { start: "2026-12-21", end: "2027-01-08" },
  ],
  end: "2027-01-08",
};

describe("stageNumbers", () => {
  it("lê intervalos, listas e etapa única", () => {
    expect(stageNumbers("Ao concluir as etapas 1 a 4")).toEqual([1, 2, 3, 4]);
    expect(stageNumbers("Ao concluir as etapas 5 e 6")).toEqual([5, 6]);
    expect(stageNumbers("No início da etapa 3")).toEqual([3]);
    expect(stageNumbers("Etapas 2, 3 e 7")).toEqual([2, 3, 7]);
    expect(stageNumbers("Na entrega")).toEqual([]);
  });
});

describe("termDueDate", () => {
  it("aprovação, fim e início de etapa, entrega e dias", () => {
    expect(termDueDate({ label: "Entrada", when: "Na aprovação do orçamento" }, ctx)).toEqual({
      date: "2026-11-02",
      basis: "aprovacao",
    });
    expect(termDueDate({ label: "1ª medição", when: "Ao concluir as etapas 1 a 4" }, ctx)).toEqual({
      date: "2026-12-04",
      basis: "fim_etapa",
    });
    expect(termDueDate({ label: "Parcela", when: "No início da etapa 3" }, ctx)).toEqual({
      date: "2026-11-16",
      basis: "inicio_etapa",
    });
    expect(
      termDueDate({ label: "Entrega da obra", when: "Na vistoria final e termo de entrega" }, ctx),
    ).toEqual({ date: "2027-01-08", basis: "entrega" });
    expect(termDueDate({ label: "Saldo", when: "30 dias após a assinatura" }, ctx)).toEqual({
      date: "2026-12-02",
      basis: "dias",
    });
    expect(termDueDate({ label: "Parcela", when: "Combinar com o cliente" }, ctx)).toBeNull();
  });
  it("etapa citada sem data não inventa vencimento", () => {
    expect(termDueDate({ label: "x", when: "Ao concluir a etapa 9" }, ctx)).toBeNull();
  });
});

describe("contractInstallmentPlan", () => {
  it("usa os valores do PDF (centavos, resto na última) e as datas das etapas", () => {
    const plan = contractInstallmentPlan(86400.01, DEFAULT_TERMS, ctx);
    expect(plan.map((p) => p.amount)).toEqual([25920, 21600, 21600, 17280.01]);
    expect(plan.reduce((s, p) => s + Math.round(p.amount * 100), 0)).toBe(8640001);
    expect(plan.map((p) => p.due_date)).toEqual([
      "2026-11-02",
      "2026-12-04",
      "2027-01-08",
      "2027-01-08",
    ]);
    expect(plan[0]!.description).toBe("Entrada na assinatura");
  });
  it("sem data no texto vence 30 dias depois da anterior", () => {
    const plan = contractInstallmentPlan(
      1000,
      [
        { label: "Sinal", when: "Na assinatura", pct: 50 },
        { label: "Parcela 2", when: "", pct: 50 },
      ],
      ctx,
    );
    expect(plan.map((p) => [p.due_date, p.basis])).toEqual([
      ["2026-11-02", "aprovacao"],
      ["2026-12-02", "estimado"],
    ]);
  });
  it("condições que não somam 100% ou valor zero não geram parcelas", () => {
    expect(contractInstallmentPlan(1000, [{ label: "A", pct: 60 }], ctx)).toEqual([]);
    expect(contractInstallmentPlan(0, DEFAULT_TERMS, ctx)).toEqual([]);
  });
});

describe("matchExisting", () => {
  it("casa cada entrada já lançada com no máximo uma parcela de mesmo valor", () => {
    const plan = [{ amount: 25920 }, { amount: 21600 }, { amount: 21600 }, { amount: 17280 }];
    expect(
      matchExisting(plan, [
        { id: "a", amount: 21600 },
        { id: "b", amount: 25920.0 },
      ]),
    ).toEqual(["b", "a", null, null]);
    expect(matchExisting(plan, [{ id: "c", amount: 999 }])).toEqual([null, null, null, null]);
  });
});

describe("stageWindows", () => {
  it("usa as datas da etapa da obra ligada à seção e cai no cronograma do orçamento", () => {
    expect(
      stageWindows(
        [{ id: "s1" }, { id: "s2" }],
        [{ budget_section_id: "s2", planned_start: "2026-12-01", planned_end: "2026-12-10" }],
        [
          { start: "2026-11-02", end: "2026-11-06" },
          { start: "2026-11-09", end: "2026-11-13" },
        ],
      ),
    ).toEqual([
      { start: "2026-11-02", end: "2026-11-06" },
      { start: "2026-12-01", end: "2026-12-10" },
    ]);
  });
});
