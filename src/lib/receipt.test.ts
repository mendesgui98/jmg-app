import { describe, expect, it } from "vitest";
import { buildReceipt, receiptNumber } from "./receipt";
import { DEFAULT_TERMS } from "./proposal";

// Números do modelo Recibo-JMG-modelo (1ª medição da reforma completa de apartamento).
const entries = [
  { id: "e1", description: "Entrada na assinatura", amount: 14063.7, due_date: "2026-11-09" },
  {
    id: "e2",
    description: "1ª medição · Reforma completa de apartamento",
    amount: 11719.75,
    due_date: "2026-12-04",
  },
  { id: "e3", description: "2ª medição", amount: 11719.75, due_date: "2026-12-20" },
  { id: "e4", description: "Entrega da obra", amount: 9375.8, due_date: "2027-01-11" },
];
const settlements = [
  { id: "s1", entry_id: "e1", amount: 14063.7, paid_date: "2026-11-09" },
  { id: "s2", entry_id: "e2", amount: 11719.75, paid_date: "2026-12-04" },
];
const input = {
  settlement: { ...settlements[1]!, payment_method: "Pix" },
  entries,
  settlements,
  work: { name: "Reforma completa de apartamento", address: "Rua das Palmeiras, 482" },
  client: { name: "Mariana Albuquerque Ribeiro", document: "000.000.000-00" },
  budget: { number: 147, issue_date: "2026-10-28", payment_terms: DEFAULT_TERMS },
  issuer: "Guilherme Andriola Mendes",
  today: "2026-12-04",
};

describe("recibo de pagamento", () => {
  it("segue o modelo: número, valor por extenso, parcela e situação do contrato", () => {
    const r = buildReceipt(input);
    expect(r.number).toBe("REC-2026-0147-02");
    expect(r.contractCode).toBe("CT-2026-0147");
    expect(r.budgetCode).toBe("ORC-2026-0147");
    expect(r.method).toBe("PIX");
    expect(r.amountWords).toBe("onze mil, setecentos e dezenove reais e setenta e cinco centavos");
    expect(r.ref).toEqual({ label: "1ª medição", when: "Ao concluir as etapas 1 a 4", pct: 25 });
    expect(r.summary).toMatchObject({ contract: 46879, paid: 25783.45, balance: 21095.55 });
    expect(r.rows.map((x) => [x.pct, x.state, x.paidDate])).toEqual([
      [30, "paga", "2026-11-09"],
      [25, "este", "2026-12-04"],
      [25, "receber", null],
      [20, "receber", null],
    ]);
    expect(r.paidBy.map((x) => x.label)).toEqual(["Titular", "CPF/CNPJ"]);
  });

  it("mostra a conta em que o dinheiro entrou (sem conta: a conta C6 de antes)", () => {
    const itau = buildReceipt({
      ...input,
      account: {
        name: "Itaú PJ",
        bank: "Itaú",
        agency: "1234",
        account_number: "5678-9",
        holder: "JMG Reformas LTDA",
        holder_document: "62.780.542/0001-81",
      },
    });
    expect(itau.receivedIn).toEqual([
      { label: "Favorecido", value: "JMG Reformas LTDA" },
      { label: "CNPJ", value: "62.780.542/0001-81" },
      { label: "Banco", value: "Itaú" },
      { label: "Agência / conta", value: "1234 · 5678-9" },
    ]);
    expect(buildReceipt(input).receivedIn.map((x) => x.value)).toEqual([
      "JMG Reformas LTDA",
      "62.780.542/0001-81",
      "Banco C6",
      "0001 · 39813290-9",
    ]);
    const cash = buildReceipt({ ...input, account: { name: "Caixa", kind: "caixa" } });
    expect(cash.receivedIn.at(-1)).toEqual({ label: "Conta", value: "Caixa (dinheiro)" });
  });

  it("recibo de uma baixa antiga não conta pagamentos posteriores", () => {
    const later = [
      ...settlements,
      { id: "s3", entry_id: "e3", amount: 11719.75, paid_date: "2026-12-20" },
    ];
    const r = buildReceipt({
      ...input,
      settlement: { ...settlements[0]!, payment_method: "Pix" },
      settlements: later,
    });
    expect(r.number).toBe("REC-2026-0147-01");
    expect(r.summary.paid).toBe(14063.7);
    expect(r.rows.map((x) => x.state)).toEqual(["este", "receber", "receber", "receber"]);
  });

  it("parcela paga em duas vezes numera cada baixa", () => {
    const parts = [
      { id: "a", entry_id: "e2", amount: 5000, paid_date: "2026-12-04" },
      { id: "b", entry_id: "e2", amount: 6719.75, paid_date: "2026-12-10" },
    ];
    expect(
      receiptNumber({
        ...input,
        settlement: { ...parts[1]!, payment_method: null },
        settlements: parts,
      }),
    ).toBe("REC-2026-0147-02-2");
  });

  it("sem orçamento usa o percentual sobre as entradas", () => {
    const r = buildReceipt({ ...input, budget: null });
    expect(r.contractCode).toBeNull();
    expect(r.number).toBe("REC-2026-0000-02");
    expect(r.ref.pct).toBe(25);
  });
});

it("entrada avulsa do caixa não entra no valor do contrato", () => {
  const cash = {
    id: "c1",
    description: "1ª medição",
    amount: 11719.75,
    due_date: "2026-12-04",
    cash_only: true,
  };
  const pay = { id: "sc", entry_id: "c1", amount: 11719.75, paid_date: "2026-12-04" };
  const r = buildReceipt({
    ...input,
    settlement: { ...pay, payment_method: "Pix" },
    entries: [...entries, cash],
    settlements: [settlements[0]!, pay],
  });
  expect(r.summary).toMatchObject({ contract: 46879, paid: 25783.45, balance: 21095.55 });
  expect(r.ref.label).toBe("1ª medição");
});

it("entrada geral, sem obra: recibo sem situação do contrato", () => {
  const e = {
    id: "g1",
    description: "Entrada",
    amount: 10000,
    due_date: "2026-10-30",
    cash_only: true,
  };
  const pay = { id: "sg", entry_id: "g1", amount: 10000, paid_date: "2026-10-30" };
  const r = buildReceipt({
    ...input,
    settlement: { ...pay, payment_method: "Pix" },
    entries: [e],
    settlements: [pay],
    work: null,
    budget: null,
  });
  expect(r.hasContract).toBe(false);
  expect(r.number).toBe("REC-2026-0000-01");
  expect(r.amountWords).toBe("dez mil reais");
});
