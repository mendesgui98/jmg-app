import { describe, it, expect } from "vitest";
import {
  formatAgency,
  formatBankAccount,
  formatPixKey,
  formatCep,
  formatCnpj,
  formatCpf,
  formatCpfCnpj,
  formatPhone,
  formatRg,
} from "./documents";

describe("pontuação de documentos", () => {
  it("CPF completo e durante a digitação", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
    expect(formatCpf("1234")).toBe("123.4");
    expect(formatCpf("123456789")).toBe("123.456.789");
  });

  it("CNPJ completo", () => {
    expect(formatCnpj("26717224000102")).toBe("26.717.224/0001-02");
  });

  it("campo CPF/CNPJ decide pelo número de dígitos", () => {
    expect(formatCpfCnpj("123.456.789-01")).toBe("123.456.789-01");
    expect(formatCpfCnpj("123456789012")).toBe("12.345.678/9012");
    expect(formatCpfCnpj("26717224000102")).toBe("26.717.224/0001-02");
  });

  it("é idempotente e ignora o que não é número", () => {
    expect(formatCpfCnpj("26.717.224/0001-02")).toBe("26.717.224/0001-02");
    expect(formatCpf("abc 123.456.789-01 xyz")).toBe("123.456.789-01");
    expect(formatCpfCnpj("")).toBe("");
    expect(formatCpfCnpj(null)).toBe("");
  });

  it("limita o tamanho", () => {
    expect(formatCnpj("267172240001029999")).toBe("26.717.224/0001-02");
  });

  it("RG no padrão 00.000.000-0, com X no dígito", () => {
    expect(formatRg("123456789")).toBe("12.345.678-9");
    expect(formatRg("12345678x")).toBe("12.345.678-X");
    expect(formatRg("12.345.678-X")).toBe("12.345.678-X");
  });

  it("RG de outro tamanho (outros estados) fica como digitado", () => {
    expect(formatRg("2321321")).toBe("2321321");
    expect(formatRg("1234")).toBe("1234");
    expect(formatRg("1234567890")).toBe("1234567890");
    expect(formatRg("MG-12.345.678")).toBe("MG-12.345.678");
  });
});

describe("pontuação de telefone", () => {
  it("celular, fixo e durante a digitação", () => {
    expect(formatPhone("11998937694")).toBe("(11) 99893-7694");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    expect(formatPhone("11")).toBe("(11");
    expect(formatPhone("119989")).toBe("(11) 9989");
    expect(formatPhone("1199893")).toBe("(11) 9989-3");
  });

  it("é idempotente", () => {
    expect(formatPhone("(11) 99893-7694")).toBe("(11) 99893-7694");
    expect(formatPhone("(11) 3333-4444")).toBe("(11) 3333-4444");
  });

  it("com DDI do Brasil", () => {
    expect(formatPhone("5511998937694")).toBe("+55 (11) 99893-7694");
    expect(formatPhone("+55 11 99893 7694")).toBe("+55 (11) 99893-7694");
  });

  it("número longo de outro formato fica como digitado", () => {
    expect(formatPhone("11111111111111")).toBe("11111111111111");
  });

  it("vários números separados por barra", () => {
    expect(formatPhone("11996062427/11998937694")).toBe("(11) 99606-2427 / (11) 99893-7694");
    expect(formatPhone("(11) 99606-2427 / ")).toBe("(11) 99606-2427 / ");
  });

  it("vazio", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});

describe("pontuação de CEP", () => {
  it("completo, parcial e idempotente", () => {
    expect(formatCep("01310100")).toBe("01310-100");
    expect(formatCep("01310")).toBe("01310");
    expect(formatCep("013101")).toBe("01310-1");
    expect(formatCep("01310-100")).toBe("01310-100");
    expect(formatCep("0131010099")).toBe("01310-100");
  });
});

describe("pontuação dos dados bancários", () => {
  it("agência com 4 dígitos e, com o 5º, o traço do dígito", () => {
    expect(formatAgency("0001")).toBe("0001");
    expect(formatAgency("12345")).toBe("1234-5");
    expect(formatAgency("1234-5")).toBe("1234-5");
  });

  it("conta com o traço antes do dígito, inclusive X, enquanto digita", () => {
    expect(formatBankAccount("3")).toBe("3");
    expect(formatBankAccount("398132909")).toBe("39813290-9");
    expect(formatBankAccount("39813290-9")).toBe("39813290-9");
    expect(formatBankAccount("1234x")).toBe("1234-X");
  });

  it("chave PIX pontuada conforme o tipo", () => {
    expect(formatPixKey("cnpj", "62780542000181")).toBe("62.780.542/0001-81");
    expect(formatPixKey("cpf", "12345678901")).toBe("123.456.789-01");
    expect(formatPixKey("telefone", "11998937694")).toBe("(11) 99893-7694");
    expect(formatPixKey("email", " Financeiro@JMG.com.br ")).toBe("financeiro@jmg.com.br");
    expect(formatPixKey("aleatoria", "abc-123")).toBe("abc-123");
  });
});
