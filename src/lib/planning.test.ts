import { describe, expect, it } from "vitest";
import {
  autoIssues,
  dayLong,
  dayShort,
  dependencyChain,
  overdueTasks,
  planSummary,
  responsibleName,
  sortIssues,
  sortTasks,
  taskBlockers,
  taskReleases,
  taskState,
  weekDays,
  weekLabel,
  weekStart,
  wouldCycle,
  type PlanIssue,
  type PlanTask,
} from "./planning";

const task = (id: string, o: Partial<PlanTask> = {}): PlanTask => ({
  id,
  work_id: "w1",
  title: id,
  planned_date: "2026-11-03",
  priority: "normal",
  status: "a_fazer",
  ...o,
});
const issue = (id: string, o: Partial<PlanIssue> = {}): PlanIssue => ({
  id,
  work_id: "w1",
  title: id,
  owner_kind: "cliente",
  due_date: null,
  priority: "normal",
  blocks_task_id: null,
  status: "aberta",
  ...o,
});
const today = "2026-11-03";

describe("semana do planejamento", () => {
  it("vai de segunda a domingo", () => {
    expect(weekStart("2026-11-03")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekDays("2026-11-05")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("rótulos dos dias e da semana", () => {
    expect(dayShort("2026-11-08")).toBe("Dom 08");
    expect(dayLong("2026-11-03")).toBe("Terça, 03 de novembro");
    expect(weekLabel("2026-11-03")).toBe("02 a 08 de novembro");
    expect(weekLabel("2026-12-01")).toBe("30 de novembro a 06 de dezembro");
  });
});

describe("tarefas e dependências", () => {
  const pipes = task("Tubulação", { planned_date: "2026-11-02" });
  const water = task("Impermeabilizar", { planned_date: "2026-11-04" });
  const tiles = task("Revestimento", { planned_date: "2026-11-05", priority: "urgente" });
  const tasks = [pipes, water, tiles];
  const deps = [
    { task_id: water.id, depends_on_id: pipes.id },
    { task_id: tiles.id, depends_on_id: water.id },
  ];

  it("tarefa com anterior aberta fica bloqueada e libera a próxima quando a anterior termina", () => {
    expect(taskState(water, tasks, deps, [], today)).toBe("bloqueada");
    expect(taskBlockers(water, tasks, deps, []).tasks.map((t) => t.id)).toEqual([pipes.id]);
    expect(taskReleases(pipes, tasks, deps).map((t) => t.id)).toEqual([water.id]);
    const done = [{ ...pipes, status: "concluida" }, water, tiles];
    expect(taskState(water, done, deps, [], today)).toBe("normal");
    expect(taskState(done[0]!, done, deps, [], today)).toBe("concluida");
  });

  it("anterior cancelada não bloqueia; pendência aberta bloqueia", () => {
    const canceled = [{ ...pipes, status: "cancelada" }, water];
    expect(taskState(water, canceled, deps, [], today)).toBe("normal");
    const pend = issue("Escolher piso", { blocks_task_id: water.id });
    expect(taskState(water, canceled, deps, [pend], today)).toBe("bloqueada");
    expect(taskState(water, canceled, deps, [{ ...pend, status: "resolvida" }], today)).toBe(
      "normal",
    );
  });

  it("atrasada = aberta com dia antes de hoje; urgente sem bloqueio", () => {
    expect(taskState(pipes, tasks, deps, [], today)).toBe("atrasada");
    const free = task("Limpeza", { priority: "urgente" });
    expect(taskState(free, [free], [], [], today)).toBe("urgente");
    expect(overdueTasks(tasks, today).map((t) => t.id)).toEqual([pipes.id]);
  });

  it("ordena urgentes, atrasadas, normais, bloqueadas e concluídas", () => {
    const a = task("A", { priority: "urgente" });
    const b = task("B", { planned_date: "2026-11-01" });
    const c = task("C");
    const d = task("D", { status: "concluida" });
    const all = [d, c, b, a];
    expect(sortTasks(all, all, [], [], today).map((t) => t.id)).toEqual(["A", "B", "C", "D"]);
    expect(planSummary(all, all, [], [], today)).toEqual({
      total: 4,
      urgent: 1,
      blocked: 0,
      late: 1,
      done: 1,
    });
  });

  it("não deixa criar espera circular", () => {
    expect(wouldCycle(deps, pipes.id, tiles.id)).toBe(true);
    expect(wouldCycle(deps, tiles.id, pipes.id)).toBe(false);
    expect(wouldCycle(deps, pipes.id, pipes.id)).toBe(true);
  });

  it("sequência da obra em ordem de execução", () => {
    const loose = task("Avulsa");
    expect(dependencyChain("w1", [tiles, loose, water, pipes], deps).map((t) => t.id)).toEqual([
      "Tubulação",
      "Impermeabilizar",
      "Revestimento",
    ]);
  });

  it("responsável: prestador do cadastro ou nome livre", () => {
    const people = [{ id: "p1", name: "Carlos" }];
    expect(responsibleName({ person_id: "p1", responsible: "x" }, people)).toBe("Carlos");
    expect(responsibleName({ responsible: " Equipe JMG " }, people)).toBe("Equipe JMG");
    expect(responsibleName({}, people)).toBe("");
  });
});

describe("pendências", () => {
  it("vencidas primeiro, depois urgentes e por prazo", () => {
    const list = [
      issue("sem prazo"),
      issue("prazo sexta", { due_date: "2026-11-06" }),
      issue("urgente", { priority: "urgente", due_date: "2026-11-10" }),
      issue("vencida", { due_date: "2026-11-01" }),
    ];
    expect(sortIssues(list, today).map((i) => i.id)).toEqual([
      "vencida",
      "urgente",
      "prazo sexta",
      "sem prazo",
    ]);
  });

  it("automáticas: etapa e material atrasados, tarefa atrasada/travada e decisão em aberto", () => {
    const pipes = task("Tubulação", { planned_date: "2026-11-01" });
    const water = task("Impermeabilizar", { planned_date: "2026-11-03" });
    const future = task("Futura", { planned_date: "2026-11-05" });
    const out = autoIssues({
      today,
      tasks: [pipes, water, future],
      deps: [{ task_id: water.id, depends_on_id: pipes.id }],
      issues: [],
      stages: [
        { id: "s1", work_id: "w1", name: "Elétrica", progress: 40, planned_end: "2026-10-31" },
        { id: "s2", work_id: "w1", name: "Pintura", progress: 100, planned_end: "2026-10-20" },
        { id: "s3", work_id: "w1", name: "Gesso", progress: 0, planned_end: "2026-11-20" },
      ],
      clientMaterials: [
        {
          id: "m1",
          work_id: "w1",
          description: "Louças",
          due_date: "2026-10-30",
          delivered: false,
        },
        { id: "m2", work_id: "w1", description: "Piso", due_date: "2026-10-30", delivered: true },
      ],
      records: [
        {
          id: "r1",
          work_id: "w1",
          kind: "decisao",
          title: "Cor da parede",
          status: "pendente",
          due_date: null,
        },
        {
          id: "r2",
          work_id: "w1",
          kind: "decisao",
          title: "Puxadores",
          status: "concluido",
          due_date: null,
        },
      ],
    });
    expect(out.map((x) => x.key)).toEqual([
      "material-m1",
      "etapa-s1",
      "tarefa-Tubulação",
      "travada-Impermeabilizar",
      "decisao-r1",
    ]);
    expect(out.find((x) => x.key === "etapa-s1")?.detail).toBe("3 dias de atraso · 40% concluída");
    expect(out.find((x) => x.key === "travada-Impermeabilizar")?.detail).toBe("aguarda Tubulação");
  });
});
