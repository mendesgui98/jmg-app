import { describe, expect, it } from "vitest";
import { documentFileName, shortClientName } from "./file-names";

describe("nome dos arquivos dos documentos", () => {
  it("abrevia o cliente: primeiro e último nome, sem acentos", () => {
    expect(shortClientName("Mariana Albuquerque Ribeiro")).toBe("Mariana Ribeiro");
    expect(shortClientName("João Conceição")).toBe("Joao Conceicao");
    expect(shortClientName("JMG Empreendimentos Imobiliários Ltda.")).toBe("JMG Ltda");
    expect(shortClientName("  Ana  ")).toBe("Ana");
    expect(shortClientName("Condomínio Ed. São José / Bloco B")).toBe("Condominio B");
    expect(shortClientName(null)).toBe("");
  });

  it("monta o nome do PDF com número e cliente", () => {
    expect(documentFileName("ORC-2026-0042", "Mariana Albuquerque Ribeiro")).toBe(
      "ORC-2026-0042 - Mariana Ribeiro.pdf",
    );
    expect(documentFileName("CT-2026-0042", "Mariana Ribeiro")).toBe(
      "CT-2026-0042 - Mariana Ribeiro.pdf",
    );
    expect(documentFileName("ORC-2026-0042", "Mariana Ribeiro", { prefix: "Cronograma" })).toBe(
      "Cronograma ORC-2026-0042 - Mariana Ribeiro.pdf",
    );
    expect(documentFileName("ORC-2026-0042", "Ana", { suffix: "v2" })).toBe(
      "ORC-2026-0042 v2 - Ana.pdf",
    );
    expect(documentFileName("REC-2026-0042-01", "")).toBe("REC-2026-0042-01.pdf");
  });
});
