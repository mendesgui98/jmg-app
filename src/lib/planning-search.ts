// Parâmetros da tela de Planejamento e do PDF das equipes (?view=&data=&obra=&resp=).
export type PlanningSearch = {
  view?: "semana" | "dia";
  data?: string;
  obra?: string;
  resp?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export function planningSearch(s: Record<string, unknown>): PlanningSearch {
  const out: PlanningSearch = {};
  if (s["view"] === "dia" || s["view"] === "semana") out.view = s["view"];
  const data = str(s["data"]);
  if (data && ISO.test(data)) out.data = data;
  const obra = str(s["obra"]);
  if (obra) out.obra = obra;
  const resp = str(s["resp"]);
  if (resp) out.resp = resp;
  return out;
}

// Parâmetros da tela de Pendências (?obra=&quem=&resp=&status=resolvidas).
export type IssuesSearch = {
  obra?: string;
  quem?: string;
  resp?: string;
  status?: "resolvidas";
};

const OWNERS = ["jmg", "cliente", "arquiteto", "fornecedor", "condominio", "outro"];

export function issuesSearch(s: Record<string, unknown>): IssuesSearch {
  const out: IssuesSearch = {};
  const obra = str(s["obra"]);
  if (obra) out.obra = obra;
  const quem = str(s["quem"]);
  if (quem && OWNERS.includes(quem)) out.quem = quem;
  const resp = str(s["resp"]);
  if (resp) out.resp = resp;
  if (s["status"] === "resolvidas") out.status = "resolvidas";
  return out;
}

/** Junta parâmetros, removendo os vazios (o roteador não aceita chave com undefined). */
export function mergeSearch<T extends Record<string, unknown>>(
  base: T,
  patch: { [K in keyof T]?: T[K] | undefined },
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") delete out[k];
    else out[k] = v;
  }
  return out as T;
}
