import { describe, it, expect } from "vitest";
import { executiveComposition, indicatorTotal, type ExecutiveData } from "./executive";
// Minimal numeric fixture; no application or database side effects.
const fixture = {
  works: [
    {
      work: {
        id: "w",
        name: "Teste",
        status: "execucao",
        origin: "direto",
        is_pilot: false,
        client_id: "c",
      },
      client: "Cliente",
      result: { sale: 300000, cost: 75000, result: 225000, estimateConfirmed: false },
      balance: { receivable: 180000 },
      extras: [],
      opening: {
        reference_date: "2026-10-01",
        existing_extras: 0,
        received: 120000,
        paid: 75000,
        pending_payable: 0,
      },
    },
  ],
  finance: { entries: [], settlements: [], people: [] },
} as unknown as ExecutiveData;
describe("composição compartilhada", () => {
  it("aditivos pendentes não entram no total aprovado", () => {
    const data = {
      ...fixture,
      works: fixture.works.map((w) => ({
        ...w,
        extras: [
          { id: "a", approved: true, price: 1000 },
          { id: "b", approved: false, price: 9000 },
        ],
      })),
    } as unknown as ExecutiveData;
    expect(indicatorTotal(executiveComposition(data, {}).extras)).toBe(1000);
  });
  it("recebido corresponde aos 120 mil da posição inicial", () =>
    expect(indicatorTotal(executiveComposition(fixture, {}).received)).toBe(120000));
  it("saldo contratual sem parcelas corresponde a 180 mil", () =>
    expect(indicatorTotal(executiveComposition(fixture, {}).receivable)).toBe(180000));
  it("caixa da obra é recebido menos 75 mil pagos da posição inicial, não lucro", () =>
    expect(indicatorTotal(executiveComposition(fixture, { work: "w" }).cash)).toBe(45000));
  it("caixa da empresa é o dinheiro nas contas (igual ao Financeiro), não a posição inicial das obras", () => {
    expect(indicatorTotal(executiveComposition(fixture, {}).cash)).toBe(0);
    const withAccounts = {
      ...fixture,
      finance: {
        ...fixture.finance,
        accounts: [{ opening_balance: 20000 }, { opening_balance: 1250 }],
        entries: [
          {
            id: "e1",
            work_id: null,
            person_id: null,
            description: "Aluguel",
            direction: "saida",
            amount: 2500,
            due_date: "2026-10-05",
            canceled: false,
          },
        ],
        settlements: [{ id: "s1", entry_id: "e1", amount: 2500, paid_date: "2026-10-05" }],
      },
    } as unknown as typeof fixture;
    // 21.250 de saldo inicial − 2.500 pagos; o filtro de período não muda o caixa de hoje no Painel.
    expect(indicatorTotal(executiveComposition(withAccounts, {}).cash)).toBe(18750);
  });
  it("período não inclui posição inicial fora do intervalo", () =>
    expect(
      indicatorTotal(
        executiveComposition(fixture, {
          period: "personalizado",
          from: "2026-10-02",
          to: "2026-10-31",
        }).received,
      ),
    ).toBe(0));
  it("pilotos não entram por padrão", () => {
    const data = {
      ...fixture,
      works: fixture.works.map((w) => ({ ...w, work: { ...w.work, is_pilot: true } })),
    };
    expect(indicatorTotal(executiveComposition(data, {}).value)).toBe(0);
    expect(indicatorTotal(executiveComposition(data, { pilot: true }).value)).toBe(300000);
  });
  it("obra direta sem estimativa não gera lucro previsto presumido", () =>
    expect(indicatorTotal(executiveComposition(fixture, {}).result)).toBeNull());
  it("baixa parcial soma só o recebido e mantém saldo da parcela", () => {
    const e = {
      id: "e",
      work_id: "w",
      person_id: "c",
      description: "Parcela",
      direction: "entrada",
      amount: 180000,
      due_date: "2026-10-20",
      canceled: false,
      installment_index: 1,
      installment_count: 1,
    };
    const data = {
      ...fixture,
      works: fixture.works.map((w) => ({ ...w, balance: { ...w.balance, receivable: 163000 } })),
      finance: {
        ...fixture.finance,
        entries: [e],
        settlements: [{ id: "s", entry_id: "e", paid_date: "2026-10-21", amount: 17000 }],
      },
    } as unknown as ExecutiveData;
    const r = executiveComposition(data, {});
    expect(indicatorTotal(r.received)).toBe(137000);
    expect(indicatorTotal(r.receivable)).toBe(163000);
  });
});
