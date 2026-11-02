const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const fmtBRL = (n: number | null | undefined) => brl.format(Number(n) || 0);
export const fmtNum = (n: number | null | undefined, d = 2) =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d });
export const fmtPct = (frac: number) =>
  `${(frac * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

/**
 * Data de um momento gravado pelo banco (timestamptz, em UTC) no horário de Brasília: algo feito
 * às 22h do dia 5 aparecia como dia 6 com `fmtDate(ts.slice(0, 10))`.
 */
export const fmtStamp = (ts: string | null | undefined) =>
  ts
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(ts))
    : "—";

export const UNIT_LABEL: Record<string, string> = {
  m2: "m²",
  ml: "m linear",
  un: "unidade",
  diaria: "diária",
  vb: "serviço fechado",
};

export { reaisPorExtenso } from "./extenso";
