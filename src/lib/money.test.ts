import { describe, expect, it } from "vitest";
import { maskBRL, moneyText, parseBRL } from "./money";

const plain = (s: string) => s.replace(/\s/g, " ");

describe("campo de moeda", () => {
  it("dígitos viram centavos", () => {
    expect(parseBRL("1000000")).toBe(10000);
    expect(parseBRL("R$ 10.000,50")).toBe(10000.5);
    expect(parseBRL("")).toBe(0);
  });
  it("mostra em reais enquanto digita", () => {
    expect(plain(maskBRL("1000000"))).toBe("R$ 10.000,00");
    expect(plain(maskBRL("R$ 10.000,005"))).toBe("R$ 100.000,05");
    expect(maskBRL("R$ ")).toBe("");
    // Backspace a partir de "R$ 0,05" esvazia o campo em vez de travar em "R$ 0,00".
    expect(maskBRL("R$ 0,0")).toBe("");
    expect(maskBRL("R$ 0,00")).toBe("");
  });
  it("valor zero começa vazio", () => {
    expect(moneyText(0)).toBe("");
    expect(plain(moneyText(5000))).toBe("R$ 5.000,00");
  });
});
