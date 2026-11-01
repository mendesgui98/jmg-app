// Nome dos arquivos dos documentos (orçamento, contrato, cronograma, recibo): número do documento
// e o nome do cliente abreviado (primeiro e último nome, sem acentos), para achar fácil depois.
// Ex.: "ORC-2026-0042 - Mariana Ribeiro.pdf". Módulo puro, compartilhado com a API.

/** "Mariana Albuquerque Ribeiro" → "Mariana Ribeiro"; sem acentos e sem caracteres inválidos. */
export function shortClientName(name: string | null | undefined) {
  const words = (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 &.-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.&-]+|[.&-]+$/g, ""))
    .filter(Boolean);
  if (words.length <= 2) return words.join(" ");
  return `${words[0]} ${words.at(-1)}`;
}

/** Nome do PDF: "<prefixo ><número> - <cliente>.pdf" (sem cliente, só o número). */
export function documentFileName(
  code: string,
  client: string | null | undefined,
  opts: { prefix?: string; suffix?: string } = {},
) {
  const name = shortClientName(client);
  const base = [opts.prefix, code, opts.suffix].filter(Boolean).join(" ");
  return `${name ? `${base} - ${name}` : base}.pdf`;
}
