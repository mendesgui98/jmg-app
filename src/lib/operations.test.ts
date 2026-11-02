import { describe, it, expect } from "vitest";
import {
  materialBalance,
  weightedProgress,
  financeTotals,
  accountBalances,
  allocatedCost,
  accountStatus,
  cashMovements,
  cashSummary,
  stageCosts,
  costVariance,
  earnedVariance,
  unassignedStageSpent,
  budgetStageServices,
  type AccountEntry,
} from "./operations";
const entry = {
  id: "e",
  work_id: null,
  direction: "saida",
  amount: 100,
  incurred: true,
  canceled: false,
  purchase_order_id: null,
  category: "Outras",
};
describe("Operações sem dupla contagem", () => {
  it("recebimento parcial não desconta o recebido duas vezes", () =>
    expect(materialBalance(100, 10, 60, 20, 5)).toEqual({ pending: 40, available: 25, toBuy: 30 }));
  it("compra parcelada gera um custo, não um por pagamento", () => {
    const e = { ...entry, purchase_order_id: "p" };
    expect(
      financeTotals(
        [e],
        [
          { entry_id: "e", account_id: "a", amount: 30 },
          { entry_id: "e", account_id: "a", amount: 20 },
        ],
      ),
    ).toMatchObject({ spent: 50, payable: 50 });
  });
  it("parcelas vinculadas ao pedido não repetem o custo econômico", () => {
    expect(allocatedCost([{ ...entry, payable_order_id: "pedido", amount: 3000 }], [])).toBe(0);
    expect(allocatedCost([{ ...entry, payable_order_id: null, amount: 3000 }], [])).toBe(3000);
  });
  it("rateio não duplica o consolidado", () => {
    const a = [
      { entry_id: "e", work_id: "w", amount: 60 },
      { entry_id: "e", work_id: "z", amount: 40 },
    ];
    expect(allocatedCost([entry], a)).toBe(100);
    expect(allocatedCost([entry], a, "w")).toBe(60);
  });
  it("transferência interna altera contas sem receita ou despesa", () => {
    expect(financeTotals([], []).cash).toBe(0);
    expect(
      accountBalances(
        [
          { id: "a", opening_balance: 100 },
          { id: "b", opening_balance: 0 },
        ],
        [],
        [],
        [{ from_account_id: "a", to_account_id: "b", amount: 40 }],
      ).map((a) => a.balance),
    ).toEqual([60, 40]);
  });
  it("avanço usa pesos e valida 100%", () => {
    expect(
      weightedProgress([
        { weight: 80, progress: 100 },
        { weight: 20, progress: 0 },
      ]),
    ).toEqual({ weightSum: 100, valid: true, progress: 80 });
    expect(weightedProgress([{ weight: 50, progress: 100 }]).valid).toBe(false);
  });
});

it("excluir um lançamento exclui suas baixas do saldo sem inverter o sinal", () => {
  const accounts = [{ id: "a", opening_balance: 1000 }];
  const settlements = [{ entry_id: "piloto", account_id: "a", amount: 100 }];
  expect(accountBalances(accounts, [], settlements, [])[0]?.balance).toBe(1000);
  expect(
    accountBalances(
      accounts,
      [{ ...entry, id: "piloto", direction: "entrada" }],
      settlements,
      [],
    )[0]?.balance,
  ).toBe(1100);
  expect(
    accountBalances(accounts, [{ ...entry, id: "piloto", canceled: true }], settlements, [])[0]
      ?.balance,
  ).toBe(1000);
});

describe("caixa e contas a receber/pagar (critérios de aceite)", () => {
  const today = "2026-10-28";
  const base = {
    work_id: "w1",
    incurred: false,
    canceled: false,
    purchase_order_id: null,
    category: "Contrato",
  };
  const entry = (over: Partial<AccountEntry>): AccountEntry => ({
    id: "e",
    direction: "entrada",
    amount: 0,
    description: "",
    due_date: today,
    ...base,
    ...over,
  });
  const avista = entry({ id: "cash", amount: 100, cash_only: true });
  const receber = entry({ id: "rec", amount: 200, due_date: "2026-11-10" });
  const pagar = entry({ id: "pag", direction: "saida", amount: 80, due_date: "2026-11-10" });
  const s = (entry_id: string, amount: number, id = entry_id + "-s") => ({
    id,
    entry_id,
    amount,
    account_id: null,
    paid_date: today,
  });

  it("entrada de R$ 100 no caixa sobe o saldo atual", () => {
    expect(cashSummary([avista], [s("cash", 100)], today).current).toBe(100);
  });

  it("conta a receber de R$ 200 não muda o saldo atual, só o previsto", () => {
    const r = cashSummary([avista, receber], [s("cash", 100)], today);
    expect(r.current).toBe(100);
    expect(r.receivable).toBe(200);
    expect(r.forecast).toBe(300);
  });

  it("Recebi: conta RECEBIDA, entrada no caixa, saldo sobe R$ 200", () => {
    const settlements = [s("cash", 100), s("rec", 200)];
    expect(accountStatus(receber, settlements, today).status).toBe("recebida");
    expect(cashMovements([avista, receber], settlements).map((m) => m.origin)).toEqual([
      "manual",
      "baixa",
    ]);
    expect(cashSummary([avista, receber], settlements, today).current).toBe(300);
  });

  it("desfazer a baixa volta a conta para PENDENTE e o saldo", () => {
    const settlements = [s("cash", 100)];
    expect(accountStatus(receber, settlements, today).status).toBe("pendente");
    expect(cashSummary([avista, receber], settlements, today).current).toBe(100);
  });

  it("contas a pagar: saída subtrai e pendente só afeta o previsto", () => {
    expect(cashSummary([pagar], [], today)).toMatchObject({
      current: 0,
      payable: 80,
      forecast: -80,
    });
    const paid = [s("pag", 80)];
    expect(accountStatus(pagar, paid, today).status).toBe("paga");
    expect(cashSummary([pagar], paid, today).current).toBe(-80);
  });

  it("pendente em centavos: R$ 1.000 com R$ 333,33 pagos falta R$ 666,67 (não 666,6700000000001)", () => {
    const conta = { ...pagar, id: "mil", amount: 1000 };
    expect(accountStatus(conta, [s("mil", 333.33)], today).pending).toBe(666.67);
  });

  it("quitada em duas baixas fica PAGA, sem resto de arredondamento", () => {
    const conta = { ...pagar, id: "q", amount: 1001.82 };
    const r = accountStatus(conta, [s("q", 500), s("q", 501.82)], today);
    expect(r).toMatchObject({ pending: 0, status: "paga" });
  });

  it("pagamento parcial deixa a conta PARCIAL com o saldo restante", () => {
    const st = accountStatus(receber, [s("rec", 50)], today);
    expect(st).toMatchObject({ status: "parcial", pending: 150, paid: 50 });
  });

  it("vencida automática, vence em até 3 dias e cancelada fora dos cálculos", () => {
    expect(accountStatus(entry({ amount: 10, due_date: "2026-10-27" }), [], today).status).toBe(
      "vencida",
    );
    expect(accountStatus(entry({ amount: 10, due_date: "2026-10-31" }), [], today).dueSoon).toBe(
      true,
    );
    expect(accountStatus(entry({ amount: 10, due_date: "2026-11-01" }), [], today).dueSoon).toBe(
      false,
    );
    const canceled = entry({ id: "c", amount: 500, canceled: true });
    expect(accountStatus(canceled, [], today).status).toBe("cancelada");
    expect(cashSummary([canceled], [], today).forecast).toBe(0);
  });

  it("saldo inicial das contas entra no saldo atual e vencidos são separados", () => {
    const overdue = entry({ id: "v", amount: 70, due_date: "2026-10-01" });
    const r = cashSummary([overdue, receber], [], today, 1000);
    expect(r).toMatchObject({ current: 1000, receivable: 270, receivableOverdue: 70 });
  });
});

describe("valores da etapa", () => {
  const services = [
    { stage_id: "st", labor_planned: 2000, material_planned: 1000 },
    { stage_id: "outra", labor_planned: 999, material_planned: 0 },
  ];
  const saida = (id: string, category: string, amount: number, stage_id: string | null = "st") => ({
    id,
    work_id: "w1",
    stage_id,
    direction: "saida",
    amount,
    category,
    incurred: true,
    canceled: false,
    purchase_order_id: null,
    description: id,
    due_date: "2026-10-28",
  });
  const paid = (entry_id: string, amount: number) => ({ entry_id, amount, account_id: null });

  it("previsto R$ 3.000, gasto R$ 2.000 → sobra R$ 1.000", () => {
    const r = stageCosts(
      "st",
      services,
      [
        saida("mo", "Mão de obra", 1500),
        saida("mat", "Materiais", 500),
        saida("x", "Materiais", 400, null),
      ],
      [paid("mo", 1500), paid("mat", 500), paid("x", 400)],
    );
    expect(r).toMatchObject({
      laborPlanned: 2000,
      materialPlanned: 1000,
      planned: 3000,
      laborSpent: 1500,
      materialSpent: 500,
      spent: 2000,
      balance: 1000,
    });
  });

  it("conta ainda não paga entra como comprometido, não como gasto", () => {
    const r = stageCosts("st", services, [saida("mo", "Mão de obra", 800)], [paid("mo", 300)]);
    expect(r).toMatchObject({ spent: 300, committed: 500, balance: 2700 });
  });

  it("obra do zero: valor da etapa R$ 10.000 e materiais R$ 5.000 digitados", () => {
    const r = stageCosts(
      "nova",
      services,
      [saida("mo", "Mão de obra", 4000, "nova"), saida("mat", "Materiais", 2000, "nova")],
      [paid("mo", 4000), paid("mat", 2000)],
      { labor_planned: 10000, material_planned: 5000 },
    );
    expect(r).toMatchObject({
      fromServices: false,
      planned: 15000,
      spent: 6000,
      balance: 9000,
      laborBalance: 6000,
      materialBalance: 3000,
    });
  });

  it("com serviços, o previsto é a soma deles e o valor digitado não soma de novo", () => {
    const r = stageCosts("st", services, [], [], { labor_planned: 10000, material_planned: 5000 });
    expect(r).toMatchObject({ fromServices: true, laborPlanned: 2000, materialPlanned: 1000 });
  });

  it("gasto em outras categorias reduz o total, não o restante de MO ou material", () => {
    const r = stageCosts(
      "nova",
      [],
      [saida("frete", "Outras", 300, "nova")],
      [paid("frete", 300)],
      { labor_planned: 1000, material_planned: 500 },
    );
    expect(r).toMatchObject({ balance: 1200, laborBalance: 1000, materialBalance: 500 });
  });

  it("etapa sem valor digitado nem serviços fica zerada", () => {
    expect(stageCosts("nova", [], [], [], null)).toMatchObject({ planned: 0, balance: 0 });
  });
});

describe("etapas a partir do orçamento", () => {
  it("leva o custo de MO e de materiais de cada item, em centavos", () => {
    expect(
      budgetStageServices([
        { id: "i1", laborCost: 1234.5678, materialsCost: 800 },
        { id: "i2", laborCost: 0, materialsCost: 99.999 },
      ]),
    ).toEqual([
      { item_id: "i1", labor_planned: 1234.57, material_planned: 800 },
      { item_id: "i2", labor_planned: 0, material_planned: 100 },
    ]);
  });
  it("custo inválido ou negativo vira zero", () => {
    expect(budgetStageServices([{ id: "i", laborCost: NaN, materialsCost: -5 }])).toEqual([
      { item_id: "i", labor_planned: 0, material_planned: 0 },
    ]);
  });
});

describe("orçado × realizado", () => {
  it("Demolição orçada em R$ 2.000 e realizada em R$ 2.500: +R$ 500 e +25%", () =>
    expect(costVariance(2000, 2500)).toEqual({
      planned: 2000,
      actual: 2500,
      difference: 500,
      variation: 0.25,
    }));
  it("sem orçado não inventa variação", () => expect(costVariance(0, 300).variation).toBeNull());
  it("etapa não iniciada e sem gasto fica a executar, não −100%", () =>
    expect(earnedVariance(5700, 0, 0)).toMatchObject({
      earned: 0,
      notStarted: true,
      difference: 0,
      variation: null,
    }));
  it("compara o gasto com o orçado do que já foi executado", () => {
    // Revestimentos: R$ 5.700 orçados, 40% feitos (R$ 2.280) e R$ 3.000 gastos: +R$ 720.
    const r = earnedVariance(5700, 40, 3000);
    expect(r).toMatchObject({ earned: 2280, difference: 720, notStarted: false });
    expect(r.variation).toBeCloseTo(720 / 2280);
  });
  it("gasto antes de começar a etapa aparece inteiro", () =>
    expect(earnedVariance(5700, 0, 800)).toMatchObject({ difference: 800, variation: null }));
  it("soma só o que foi pago em saídas da obra sem etapa", () => {
    const base = {
      work_id: "w1",
      direction: "saida",
      incurred: true,
      canceled: false,
      purchase_order_id: null,
      category: "Materiais",
      description: "x",
      due_date: "2026-10-28",
    };
    expect(
      unassignedStageSpent(
        "w1",
        [
          { ...base, id: "a", amount: 500, stage_id: null },
          { ...base, id: "b", amount: 900, stage_id: "st" },
          { ...base, id: "c", amount: 700, stage_id: null, canceled: true },
        ],
        [
          { entry_id: "a", amount: 300, account_id: null },
          { entry_id: "b", amount: 900, account_id: null },
          { entry_id: "c", amount: 700, account_id: null },
        ],
      ),
    ).toBe(300);
  });
});
