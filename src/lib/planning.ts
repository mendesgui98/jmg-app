// Planejamento das obras (tarefas por dia) e Pendências: regras puras usadas pelas telas e pelo
// PDF das equipes. Tarefa bloqueada = alguma tarefa anterior ainda aberta ou pendência aberta que a
// trava; atrasada = aberta com dia planejado antes de hoje. Concluir tarefa não mexe no avanço das
// etapas (o cronograma continua sendo lançado por etapa).

import { addDays } from "./proposal";
import { stageStatus } from "./work-progress";

export type TaskStatus = "a_fazer" | "em_andamento" | "concluida" | "cancelada";
export type Priority = "normal" | "urgente";
export type OwnerKind = "jmg" | "cliente" | "arquiteto" | "fornecedor" | "condominio" | "outro";

export interface PlanTask {
  id: string;
  work_id: string;
  stage_id?: string | null;
  title: string;
  notes?: string | null;
  planned_date: string | null;
  person_id?: string | null;
  responsible?: string | null;
  priority: string;
  status: string;
  done_at?: string | null;
}
export interface PlanDependency {
  task_id: string;
  depends_on_id: string;
}
export interface PlanIssue {
  id: string;
  work_id: string;
  title: string;
  notes?: string | null;
  owner_kind: string;
  person_id?: string | null;
  responsible?: string | null;
  due_date: string | null;
  priority: string;
  blocks_task_id: string | null;
  status: string;
  resolved_at?: string | null;
  resolution?: string | null;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const OWNER_LABEL: Record<OwnerKind, string> = {
  jmg: "JMG",
  cliente: "Cliente",
  arquiteto: "Arquiteto",
  fornecedor: "Fornecedor",
  condominio: "Condomínio",
  outro: "Outro",
};

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTH = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const weekday = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();

/** Segunda-feira da semana da data (a semana vai de segunda a domingo). */
export function weekStart(iso: string) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

/** Os 7 dias (segunda a domingo) da semana da data. */
export function weekDays(iso: string) {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "Seg 02" */
export const dayShort = (iso: string) => `${WEEKDAY[weekday(iso)]} ${iso.slice(8, 10)}`;

/** "Terça, 03 de novembro" */
export const dayLong = (iso: string) =>
  `${WEEKDAY_LONG[weekday(iso)]}, ${iso.slice(8, 10)} de ${MONTH[Number(iso.slice(5, 7)) - 1]}`;

/** "02 a 08 de novembro" ou "30 de novembro a 06 de dezembro" */
export function weekLabel(iso: string) {
  const days = weekDays(iso);
  const a = days[0]!;
  const b = days[6]!;
  const month = (d: string) => MONTH[Number(d.slice(5, 7)) - 1];
  return a.slice(5, 7) === b.slice(5, 7)
    ? `${a.slice(8, 10)} a ${b.slice(8, 10)} de ${month(b)}`
    : `${a.slice(8, 10)} de ${month(a)} a ${b.slice(8, 10)} de ${month(b)}`;
}

export const isOpenTask = (t: Pick<PlanTask, "status">) =>
  t.status !== "concluida" && t.status !== "cancelada";

/** O que impede concluir a tarefa: tarefas anteriores abertas e pendências abertas que a travam. */
export function taskBlockers<T extends PlanTask>(
  task: Pick<PlanTask, "id">,
  tasks: T[],
  deps: PlanDependency[],
  issues: PlanIssue[],
) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return {
    tasks: deps
      .filter((d) => d.task_id === task.id)
      .map((d) => byId.get(d.depends_on_id))
      .filter((t): t is T => !!t && isOpenTask(t)),
    issues: issues.filter((i) => i.blocks_task_id === task.id && i.status === "aberta"),
  };
}

/** Tarefas que dependem desta (o que ela libera ao ser concluída). */
export function taskReleases<T extends PlanTask>(
  task: Pick<PlanTask, "id">,
  tasks: T[],
  deps: PlanDependency[],
) {
  const ids = new Set(deps.filter((d) => d.depends_on_id === task.id).map((d) => d.task_id));
  return tasks.filter((t) => ids.has(t.id) && isOpenTask(t));
}

/** Tarefas anteriores (todas, abertas ou não). */
export function taskPrerequisites<T extends PlanTask>(
  task: Pick<PlanTask, "id">,
  tasks: T[],
  deps: PlanDependency[],
) {
  const ids = new Set(deps.filter((d) => d.task_id === task.id).map((d) => d.depends_on_id));
  return tasks.filter((t) => ids.has(t.id));
}

export type TaskState = "concluida" | "cancelada" | "bloqueada" | "atrasada" | "urgente" | "normal";

/** Situação para cor e ordem: concluída/cancelada, bloqueada, atrasada, urgente ou normal. */
export function taskState(
  task: PlanTask,
  tasks: PlanTask[],
  deps: PlanDependency[],
  issues: PlanIssue[],
  today: string,
): TaskState {
  if (task.status === "concluida") return "concluida";
  if (task.status === "cancelada") return "cancelada";
  const b = taskBlockers(task, tasks, deps, issues);
  if (b.tasks.length || b.issues.length) return "bloqueada";
  if (task.planned_date && task.planned_date < today) return "atrasada";
  return task.priority === "urgente" ? "urgente" : "normal";
}

const STATE_ORDER: Record<TaskState, number> = {
  urgente: 0,
  atrasada: 1,
  normal: 2,
  bloqueada: 3,
  concluida: 4,
  cancelada: 5,
};

/** Ordem na lista do dia/célula: urgentes, atrasadas, normais, bloqueadas, concluídas. */
export function sortTasks<T extends PlanTask>(
  list: T[],
  tasks: PlanTask[],
  deps: PlanDependency[],
  issues: PlanIssue[],
  today: string,
) {
  return [...list].sort(
    (a, b) =>
      STATE_ORDER[taskState(a, tasks, deps, issues, today)] -
        STATE_ORDER[taskState(b, tasks, deps, issues, today)] ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
}

/** Indicadores do período: total, urgentes abertas, bloqueadas, atrasadas e concluídas. */
export function planSummary(
  list: PlanTask[],
  tasks: PlanTask[],
  deps: PlanDependency[],
  issues: PlanIssue[],
  today: string,
) {
  const states = list
    .filter((t) => t.status !== "cancelada")
    .map((t) => taskState(t, tasks, deps, issues, today));
  const count = (s: TaskState) => states.filter((x) => x === s).length;
  return {
    total: states.length,
    urgent: list.filter((t) => isOpenTask(t) && t.priority === "urgente").length,
    blocked: count("bloqueada"),
    late: count("atrasada"),
    done: count("concluida"),
  };
}

/** Tarefas abertas de dias anteriores (aparecem no dia de hoje para "Passar para hoje"). */
export const overdueTasks = <T extends PlanTask>(tasks: T[], today: string) =>
  tasks.filter((t) => isOpenTask(t) && !!t.planned_date && t.planned_date < today);

/** A dependência nova (tarefa depende de anterior) criaria espera circular? */
export function wouldCycle(deps: PlanDependency[], taskId: string, dependsOnId: string) {
  if (taskId === dependsOnId) return true;
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of deps) if (d.task_id === id) stack.push(d.depends_on_id);
  }
  return false;
}

/**
 * Sequência da obra: tarefas ligadas por dependência, em ordem de execução (anteriores primeiro).
 * Tarefas sem dependência ficam fora.
 */
export function dependencyChain<T extends PlanTask>(
  workId: string,
  tasks: T[],
  deps: PlanDependency[],
) {
  const mine = tasks.filter((t) => t.work_id === workId && t.status !== "cancelada");
  const ids = new Set(mine.map((t) => t.id));
  const edges = deps.filter((d) => ids.has(d.task_id) && ids.has(d.depends_on_id));
  const linked = new Set(edges.flatMap((d) => [d.task_id, d.depends_on_id]));
  const nodes = mine.filter((t) => linked.has(t.id));
  const indegree = new Map(nodes.map((t) => [t.id, 0]));
  for (const e of edges) indegree.set(e.task_id, (indegree.get(e.task_id) ?? 0) + 1);
  const byDate = (a: T, b: T) =>
    (a.planned_date ?? "9999").localeCompare(b.planned_date ?? "9999") ||
    a.title.localeCompare(b.title, "pt-BR");
  const ready = nodes.filter((t) => !indegree.get(t.id)).sort(byDate);
  const out: T[] = [];
  while (ready.length) {
    const t = ready.shift()!;
    out.push(t);
    const next: T[] = [];
    for (const e of edges.filter((x) => x.depends_on_id === t.id)) {
      const left = (indegree.get(e.task_id) ?? 0) - 1;
      indegree.set(e.task_id, left);
      if (left === 0) next.push(nodes.find((n) => n.id === e.task_id)!);
    }
    ready.push(...next);
    ready.sort(byDate);
  }
  return out;
}

/** Nome do responsável: prestador do cadastro ou nome livre. */
export function responsibleName(
  item: { person_id?: string | null; responsible?: string | null },
  people: { id: string; name: string }[],
) {
  const person = item.person_id ? people.find((p) => p.id === item.person_id) : undefined;
  return person?.name ?? item.responsible?.trim() ?? "";
}

/** Chave do responsável para filtros: pessoa do cadastro (p:id) ou nome livre (t:nome). */
export const respKey = (t: { person_id?: string | null; responsible?: string | null }) =>
  t.person_id ? `p:${t.person_id}` : t.responsible?.trim() ? `t:${t.responsible.trim()}` : "";

/** Responsáveis que aparecem nas tarefas/pendências, em ordem alfabética: [chave, nome]. */
export function responsibleOptions(
  items: { person_id?: string | null; responsible?: string | null }[],
  people: { id: string; name: string }[],
) {
  const keys = new Map<string, string>();
  for (const t of items) {
    const k = respKey(t);
    if (k && !keys.has(k)) keys.set(k, responsibleName(t, people));
  }
  return [...keys].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
}

export const issueOverdue = (i: PlanIssue, today: string) =>
  i.status === "aberta" && !!i.due_date && i.due_date < today;

/** Ordem das pendências: vencidas, urgentes, por prazo (sem prazo por último). */
export function sortIssues<I extends PlanIssue>(list: I[], today: string) {
  return [...list].sort(
    (a, b) =>
      Number(issueOverdue(b, today)) - Number(issueOverdue(a, today)) ||
      Number(b.priority === "urgente") - Number(a.priority === "urgente") ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
}

export type AutoOrigin = "cronograma" | "materiais" | "planejamento" | "decisao";
export interface AutoIssue {
  key: string;
  work_id: string;
  title: string;
  origin: AutoOrigin;
  /** Data de referência (prazo vencido ou dia planejado). */
  date: string | null;
  detail: string;
  /** Aba da obra ou tela onde está a origem. */
  target: { kind: "obra"; tab: string } | { kind: "planejamento"; date: string | null };
}

export const AUTO_ORIGIN_LABEL: Record<AutoOrigin, string> = {
  cronograma: "Cronograma",
  materiais: "Materiais do cliente",
  planejamento: "Planejamento",
  decisao: "Decisão",
};

/**
 * Pendências que o sistema já sabe (não cadastradas): etapas atrasadas, materiais do cliente
 * atrasados, tarefas atrasadas ou travadas até hoje e decisões em aberto.
 */
export function autoIssues(input: {
  today: string;
  tasks: PlanTask[];
  deps: PlanDependency[];
  issues: PlanIssue[];
  stages: {
    id: string;
    work_id: string;
    name: string;
    progress: number;
    status?: string | null;
    planned_end?: string | null;
    removed?: boolean | null;
  }[];
  clientMaterials: {
    id: string;
    work_id: string;
    description: string;
    due_date: string;
    delivered: boolean;
  }[];
  records: {
    id: string;
    work_id: string;
    kind: string;
    title: string;
    status: string;
    due_date: string | null;
  }[];
}): AutoIssue[] {
  const { today } = input;
  const days = (from: string) =>
    Math.max(
      0,
      Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000),
    );
  const late = (from: string) => {
    const n = days(from);
    return n === 1 ? "1 dia de atraso" : `${n} dias de atraso`;
  };
  const out: AutoIssue[] = [];
  for (const s of input.stages) {
    if (s.removed || !s.planned_end) continue;
    if (stageStatus({ ...s, weight: 0 } as never, today) !== "atrasado") continue;
    out.push({
      key: `etapa-${s.id}`,
      work_id: s.work_id,
      title: `Etapa atrasada: ${s.name}`,
      origin: "cronograma",
      date: s.planned_end,
      detail: `${late(s.planned_end)} · ${Math.round(s.progress)}% concluída`,
      target: { kind: "obra", tab: "cronograma" },
    });
  }
  for (const m of input.clientMaterials) {
    if (m.delivered || m.due_date >= today) continue;
    out.push({
      key: `material-${m.id}`,
      work_id: m.work_id,
      title: `Material do cliente atrasado: ${m.description}`,
      origin: "materiais",
      date: m.due_date,
      detail: late(m.due_date),
      target: { kind: "obra", tab: "cronograma" },
    });
  }
  for (const t of input.tasks) {
    if (!isOpenTask(t) || !t.planned_date || t.planned_date > today) continue;
    const state = taskState(t, input.tasks, input.deps, input.issues, today);
    if (state === "atrasada")
      out.push({
        key: `tarefa-${t.id}`,
        work_id: t.work_id,
        title: `Tarefa atrasada: ${t.title}`,
        origin: "planejamento",
        date: t.planned_date,
        detail: late(t.planned_date),
        target: { kind: "planejamento", date: t.planned_date },
      });
    else if (state === "bloqueada") {
      const b = taskBlockers(t, input.tasks, input.deps, input.issues);
      out.push({
        key: `travada-${t.id}`,
        work_id: t.work_id,
        title: `Tarefa travada: ${t.title}`,
        origin: "planejamento",
        date: t.planned_date,
        detail: `aguarda ${[...b.tasks.map((x) => x.title), ...b.issues.map((x) => x.title)].join(", ")}`,
        target: { kind: "planejamento", date: t.planned_date },
      });
    }
  }
  for (const r of input.records) {
    if (r.kind !== "decisao" || ["concluido", "aceito"].includes(r.status)) continue;
    out.push({
      key: `decisao-${r.id}`,
      work_id: r.work_id,
      title: `Decisão em aberto: ${r.title}`,
      origin: "decisao",
      date: r.due_date,
      detail: r.due_date ? (r.due_date < today ? late(r.due_date) : "no prazo") : "sem prazo",
      target: { kind: "obra", tab: "decisao" },
    });
  }
  return out.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}
