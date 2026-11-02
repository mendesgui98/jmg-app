import { fmtBRL } from "./format";

/** Valor em reais a partir do texto digitado: os dígitos são centavos (1050 → 10,50). */
export function parseBRL(text: string | null | undefined) {
  const digits = (text ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? Number(digits) / 100 : 0;
}

/**
 * Texto do campo de moeda enquanto digita: "R$ 10.000,00"; vazio continua vazio. Apagando até
 * sobrar só zero ("R$ 0,00") o campo esvazia, senão ele travava em zero com o backspace.
 */
export function maskBRL(text: string | null | undefined) {
  return /[1-9]/.test(text ?? "") ? fmtBRL(parseBRL(text)) : "";
}

/** Valor inicial do campo: 0 aparece vazio para mostrar o exemplo. */
export const moneyText = (value: number | null | undefined) =>
  Number(value) > 0 ? fmtBRL(Number(value)) : "";
