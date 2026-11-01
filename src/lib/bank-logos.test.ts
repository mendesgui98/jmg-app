import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANK_BRANDS, bankLogo, findBank } from "./bank-logos";

describe("logos dos bancos", () => {
  it("reconhece o banco pelo nome, com ou sem acento, e pelo código", () => {
    expect(findBank("Banco C6")?.slug).toBe("c6");
    expect(findBank("C6 Bank S.A.")?.slug).toBe("c6");
    expect(findBank("Itaú Unibanco")?.slug).toBe("itau");
    expect(findBank("ITAU")?.slug).toBe("itau");
    expect(findBank("Nubank")?.slug).toBe("nubank");
    expect(findBank("Nu Pagamentos S.A.")?.slug).toBe("nubank");
    expect(findBank("BTG Pactual")?.slug).toBe("btg");
    expect(findBank("Banco do Brasil")?.slug).toBe("banco-do-brasil");
    expect(findBank("BRB - Banco de Brasília")?.slug).toBe("brb");
    expect(findBank("Caixa Econômica Federal")?.slug).toBe("caixa");
    expect(findBank("341")?.slug).toBe("itau");
    expect(findBank("033")?.slug).toBe("santander");
    expect(findBank("Banco qualquer")).toBeNull();
    expect(findBank("")).toBeNull();
  });

  it("logo da conta: pelo banco, senão pelo nome; caixa em dinheiro não tem logo", () => {
    expect(bankLogo({ bank: "Banco C6", name: "Conta principal" })).toBe("/banks/c6.svg");
    expect(bankLogo({ bank: null, name: "Itaú PJ" })).toBe("/banks/itau.svg");
    expect(bankLogo({ name: "Caixa (dinheiro)", kind: "caixa" })).toBeNull();
    expect(bankLogo({ bank: "Outro", name: "Reserva" })).toBeNull();
  });

  it("toda marca tem o arquivo da logo em public/banks", () => {
    for (const b of BANK_BRANDS)
      expect(existsSync(`public/banks/${b.slug}.svg`), b.slug).toBe(true);
  });
});
