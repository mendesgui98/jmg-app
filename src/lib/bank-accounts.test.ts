import { describe, expect, it } from "vitest";
import {
  COMPANY_ACCOUNT,
  accountLine,
  contractBankRows,
  defaultContractAccount,
  hasBankData,
  pixLine,
} from "./bank-accounts";

const itau = {
  id: "a2",
  name: "Itaú PJ",
  kind: "corrente",
  bank: "Itaú Unibanco",
  agency: "1234",
  account_number: "56789-0",
  holder: "JMG Reformas LTDA",
  holder_document: "62.780.542/0001-81",
  pix_key_type: "email",
  pix_key: "financeiro@jmg.com.br",
  active: true,
  is_contract_default: false,
};

describe("contas da empresa", () => {
  it("só conta com banco e conta ou PIX vai no contrato; caixa nunca", () => {
    expect(hasBankData(itau)).toBe(true);
    expect(hasBankData({ name: "Só PIX", pix_key: "x@y.com" })).toBe(true);
    expect(hasBankData({ name: "Só banco", bank: "Itaú" })).toBe(false);
    expect(hasBankData({ name: "Caixa", kind: "caixa", pix_key: "x" })).toBe(false);
  });

  it("monta as linhas de agência/conta e PIX", () => {
    expect(accountLine(itau)).toBe("Ag. 1234 · CC 56789-0");
    expect(accountLine({ ...itau, kind: "poupanca" })).toBe("Ag. 1234 · Poup. 56789-0");
    expect(pixLine(itau)).toBe("financeiro@jmg.com.br (E-mail)");
    expect(pixLine({ name: "x" })).toBe("");
  });

  it("quadro do contrato com a conta escolhida, igual ao modelo de antes para o C6", () => {
    expect(contractBankRows(COMPANY_ACCOUNT)).toEqual([
      { label: "Favorecido", value: "JMG Reformas LTDA" },
      { label: "CNPJ", value: "62.780.542/0001-81" },
      { label: "Chave PIX", value: "62.780.542/0001-81 (CNPJ)" },
      { label: "Banco", value: "Banco C6" },
      { label: "Agência", value: "0001" },
      { label: "Conta corrente", value: "39813290-9" },
    ]);
    expect(
      contractBankRows({
        name: "PF",
        pix_key: "11999990000",
        holder: "Fulano",
        holder_document: "123.456.789-01",
      }),
    ).toEqual([
      { label: "Favorecido", value: "Fulano" },
      { label: "CPF", value: "123.456.789-01" },
      { label: "Chave PIX", value: "11999990000" },
    ]);
  });

  it("conta padrão do contrato: a marcada ou a primeira utilizável", () => {
    const caixa = { id: "a1", name: "Caixa", kind: "caixa", active: true };
    expect(defaultContractAccount([caixa, itau])?.id).toBe("a2");
    const c6 = { ...itau, id: "a3", name: "C6", is_contract_default: true };
    expect(defaultContractAccount([caixa, itau, c6])?.id).toBe("a3");
    expect(defaultContractAccount([caixa])).toBeNull();
    expect(defaultContractAccount([{ ...itau, active: false }])).toBeNull();
  });
});
