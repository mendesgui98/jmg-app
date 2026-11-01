// Pontuação de CPF, CNPJ e RG. As máscaras são progressivas (servem durante a
// digitação) e idempotentes (reaplicar sobre um valor já pontuado não muda nada).

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Aplica um padrão como "000.000.000-00" aos caracteres informados. */
function mask(chars: string, pattern: string) {
  let out = "";
  let i = 0;
  for (const p of pattern) {
    if (i >= chars.length) break;
    if (p === "0") out += chars[i++];
    else out += p;
  }
  return out;
}

/** CPF: 000.000.000-00 */
export function formatCpf(v: string | null | undefined) {
  return mask(digits(v).slice(0, 11), "000.000.000-00");
}

/** CNPJ: 00.000.000/0000-00 */
export function formatCnpj(v: string | null | undefined) {
  return mask(digits(v).slice(0, 14), "00.000.000/0000-00");
}

/** Campo único CPF/CNPJ: até 11 dígitos é CPF; a partir do 12º vira CNPJ. */
export function formatCpfCnpj(v: string | null | undefined) {
  return digits(v).length > 11 ? formatCnpj(v) : formatCpf(v);
}

/**
 * RG no padrão mais usado (SP): 00.000.000-0, com dígito verificador que pode ser X.
 * O RG não tem formato nacional único: só recebe pontuação quando tem os 9
 * caracteres desse padrão; outros tamanhos (outros estados) ficam como digitados.
 */
export function formatRg(v: string | null | undefined) {
  const raw = (v ?? "").trim();
  const chars = raw.toUpperCase().replace(/[^0-9X]/g, "");
  // X só vale como último caractere (dígito verificador).
  if (chars.length !== 9 || /X./.test(chars)) return raw;
  return mask(chars, "00.000.000-0");
}

/** Um telefone: (11) 99999-9999 (celular), (11) 9999-9999 (fixo) ou +55 (11) 99999-9999. */
function formatOnePhone(raw: string): string {
  const d = digits(raw);
  if (!d) return raw.trim();
  if (d.length > 11) {
    // Com DDI do Brasil; outros tamanhos (exterior, ramais) ficam como digitados.
    if (d.startsWith("55") && d.length <= 13) return `+55 ${formatOnePhone(d.slice(2))}`;
    return raw.trim();
  }
  if (d.length <= 2) return `(${d}`;
  const local = d.slice(2);
  const split = d.length === 11 ? 5 : 4;
  const number = local.length > split ? `${local.slice(0, split)}-${local.slice(split)}` : local;
  return `(${d.slice(0, 2)}) ${number}`;
}

/** Telefone com DDD; vários números separados por "/" são pontuados um a um. */
export function formatPhone(v: string | null | undefined) {
  const value = v ?? "";
  if (!value.includes("/")) return formatOnePhone(value);
  return value
    .split("/")
    .map((part, i, all) => (i === all.length - 1 && !part.trim() ? "" : formatOnePhone(part)))
    .join(" / ");
}

/** CEP: 00000-000 */
export function formatCep(v: string | null | undefined) {
  return mask(digits(v).slice(0, 8), "00000-000");
}

/** Agência: até 4 dígitos; com o 5º vira agência com dígito (1234-5). */
export function formatAgency(v: string | null | undefined) {
  const chars = (v ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .slice(0, 5);
  return chars.length === 5 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
}

/** Conta bancária: o último caractere é o dígito (pode ser X), separado por traço (39813290-9). */
export function formatBankAccount(v: string | null | undefined) {
  const chars = (v ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .slice(0, 20);
  return chars.length < 2 ? chars : `${chars.slice(0, -1)}-${chars.slice(-1)}`;
}

/** Chave PIX conforme o tipo: CPF, CNPJ e telefone pontuados; e-mail em minúsculas. */
export function formatPixKey(type: string | null | undefined, v: string | null | undefined) {
  const value = v ?? "";
  switch (type) {
    case "cpf":
      return formatCpf(value);
    case "cnpj":
      return formatCnpj(value);
    case "telefone":
      return formatPhone(value);
    case "email":
      return value.trim().toLowerCase();
    default:
      return value.trim();
  }
}
