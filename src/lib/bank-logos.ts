// Logos dos bancos (SVG em public/banks/, do repositório público Tgentil/bancos-em-svg). A logo
// da conta da empresa vem do campo "Banco" (nome ou código COMPE, ex.: "Itaú" ou "341") e, se ele
// estiver vazio, do nome da conta. Módulo puro.

export interface BankBrand {
  slug: string;
  /** Nome sugerido no cadastro. */
  label: string;
  /** Código COMPE. */
  code: number;
  /** Palavras que identificam o banco no texto já normalizado (sem acento, minúsculo). */
  match: RegExp;
}

export const BANK_BRANDS: BankBrand[] = [
  { slug: "brb", label: "BRB - Banco de Brasília", code: 70, match: /\bbrb\b|banco de brasilia/ },
  { slug: "banco-do-brasil", label: "Banco do Brasil", code: 1, match: /banco do brasil|\bbb\b/ },
  { slug: "bradesco", label: "Bradesco", code: 237, match: /\bbradesco\b/ },
  {
    slug: "caixa",
    label: "Caixa Econômica Federal",
    code: 104,
    match: /caixa economica|\bcef\b|^caixa$/,
  },
  { slug: "itau", label: "Itaú Unibanco", code: 341, match: /\bitau\b/ },
  { slug: "santander", label: "Santander", code: 33, match: /\bsantander\b/ },
  { slug: "nubank", label: "Nubank", code: 260, match: /\bnubank\b|\bnu pagamentos\b|^nu\b/ },
  { slug: "inter", label: "Banco Inter", code: 77, match: /\binter\b/ },
  { slug: "c6", label: "Banco C6", code: 336, match: /\bc6\b/ },
  { slug: "btg", label: "BTG Pactual", code: 208, match: /\bbtg\b/ },
  { slug: "safra", label: "Banco Safra", code: 422, match: /\bsafra\b/ },
  { slug: "sicoob", label: "Sicoob", code: 756, match: /\bsicoob\b/ },
  { slug: "sicredi", label: "Sicredi", code: 748, match: /\bsicredi\b/ },
  { slug: "banrisul", label: "Banrisul", code: 41, match: /\bbanrisul\b/ },
  { slug: "original", label: "Banco Original", code: 212, match: /\boriginal\b/ },
  { slug: "pan", label: "Banco Pan", code: 623, match: /\bpan\b/ },
  { slug: "neon", label: "Neon", code: 536, match: /\bneon\b/ },
  { slug: "picpay", label: "PicPay", code: 380, match: /\bpicpay\b/ },
  { slug: "xp", label: "XP Investimentos", code: 102, match: /\bxp\b/ },
  { slug: "bmg", label: "Banco BMG", code: 318, match: /\bbmg\b/ },
  { slug: "mercado-pago", label: "Mercado Pago", code: 323, match: /mercado ?pago/ },
  {
    slug: "pagseguro",
    label: "PagBank (PagSeguro)",
    code: 290,
    match: /\bpagseguro\b|\bpagbank\b/,
  },
  { slug: "stone", label: "Stone", code: 197, match: /\bstone\b/ },
  { slug: "cora", label: "Cora", code: 403, match: /\bcora\b/ },
  {
    slug: "infinitepay",
    label: "InfinitePay",
    code: 542,
    match: /\binfinite ?pay\b|\bcloudwalk\b/,
  },
  { slug: "efi", label: "Efí Bank (Gerencianet)", code: 364, match: /\befi\b|\bgerencianet\b/ },
  { slug: "asaas", label: "Asaas", code: 461, match: /\basaas\b/ },
  { slug: "daycoval", label: "Banco Daycoval", code: 707, match: /\bdaycoval\b/ },
  { slug: "bs2", label: "Banco BS2", code: 218, match: /\bbs2\b/ },
  { slug: "mercantil", label: "Banco Mercantil do Brasil", code: 389, match: /\bmercantil\b/ },
  { slug: "bnb", label: "Banco do Nordeste", code: 4, match: /\bbnb\b|banco do nordeste/ },
  { slug: "basa", label: "Banco da Amazônia", code: 3, match: /\bbasa\b|banco da amazonia/ },
  { slug: "banestes", label: "Banestes", code: 21, match: /\bbanestes\b/ },
  { slug: "banpara", label: "Banpará", code: 37, match: /\bbanpara\b/ },
  { slug: "banese", label: "Banese", code: 47, match: /\bbanese\b/ },
  { slug: "unicred", label: "Unicred", code: 136, match: /\bunicred\b/ },
  { slug: "cresol", label: "Cresol", code: 133, match: /\bcresol\b/ },
  { slug: "ailos", label: "Ailos", code: 85, match: /\bailos\b/ },
  { slug: "conta-simples", label: "Conta Simples", code: 0, match: /conta simples/ },
  { slug: "sofisa", label: "Banco Sofisa", code: 637, match: /\bsofisa\b/ },
  { slug: "abc", label: "Banco ABC Brasil", code: 246, match: /\babc brasil\b|banco abc/ },
  { slug: "tribanco", label: "Tribanco", code: 634, match: /\btribanco\b|banco triangulo/ },
  { slug: "rendimento", label: "Banco Rendimento", code: 633, match: /\brendimento\b/ },
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Banco pelo texto (nome ou código COMPE, ex.: "341", "Itaú Unibanco (341)"). */
export function findBank(text: string | null | undefined): BankBrand | null {
  const t = normalize(text ?? "");
  if (!t) return null;
  const byName = BANK_BRANDS.find((b) => b.match.test(t));
  if (byName) return byName;
  const codes = t.match(/\b\d{1,3}\b/g)?.map(Number) ?? [];
  return BANK_BRANDS.find((b) => b.code > 0 && codes.includes(b.code)) ?? null;
}

/** Endereço da logo da conta: pelo banco e, sem banco, pelo nome da conta (nunca o caixa). */
export function bankLogo(account: {
  bank?: string | null;
  name?: string | null;
  kind?: string | null;
}): string | null {
  if (account.kind === "caixa") return null;
  const brand = findBank(account.bank) ?? findBank(account.name);
  return brand ? `/banks/${brand.slug}.svg` : null;
}
