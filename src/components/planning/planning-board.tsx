import { useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Lock,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addDays } from "@/lib/proposal";
import {
  dayLong,
  dayShort,
  dependencyChain,
  overdueTasks,
  planSummary,
  respKey,
  responsibleName,
  responsibleOptions,
  sortTasks,
  taskBlockers,
  taskReleases,
  taskState,
  weekDays,
  weekLabel,
  type TaskState,
} from "@/lib/planning";
import type { PlanningData, WorkTask } from "@/lib/planning-data";
import { mergeSearch, type PlanningSearch } from "@/lib/planning-search";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard, Segmented } from "@/components/kpi";
import { EmptyState } from "@/components/feedback";
import { selectClass } from "@/components/works/fields";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { TaskDialog, type TaskDraft } from "./task-dialog";
import { AlertTriangle, CheckCircle2, ListTodo, Siren } from "lucide-react";

const STATE_STYLE: Record<TaskState, string> = {
  urgente: "border-l-negative bg-negative-soft",
  atrasada: "border-l-alert bg-alert-soft",
  normal: "border-l-primary bg-card",
  bloqueada: "border-l-muted-foreground/60 bg-muted",
  concluida: "border-l-positive bg-card opacity-70",
  cancelada: "border-l-border bg-card opacity-50",
};

export function PlanningBoard({
  data,
  today,
  search,
}: {
  data: PlanningData;
  today: string;
  search: PlanningSearch;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const view = search.view ?? "semana";
  const date = search.data || today;
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const setSearch = (patch: { [K in keyof PlanningSearch]?: PlanningSearch[K] | undefined }) =>
    void navigate({ to: "/planejamento", search: mergeSearch(search, patch) });

  const filtered = data.tasks.filter(
    (t) =>
      (!search.obra || t.work_id === search.obra) && (!search.resp || respKey(t) === search.resp),
  );
  const ctx = [data.tasks, data.deps, data.issues] as const;
  const state = (t: WorkTask) => taskState(t, ...ctx, today);
  const days = weekDays(date);
  const inWeek = filtered.filter((t) => t.planned_date && days.includes(t.planned_date));
  const dayTasks = filtered.filter((t) => t.planned_date === date);
  const summary = planSummary(view === "semana" ? inWeek : dayTasks, ...ctx, today);
  const workName = (id: string) => data.works.find((w) => w.id === id)?.name ?? "Obra";
  const stageName = (id: string | null) => data.stages.find((s) => s.id === id)?.name;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["planning"] });

  async function update(task: WorkTask, patch: Partial<WorkTask>, ok: string) {
    const r = await supabase.from("work_tasks").update(patch).eq("id", task.id);
    refresh();
    if (r.error) toast.error(r.error.message);
    else toast.success(ok);
  }
  async function complete(task: WorkTask) {
    const released = taskReleases(task, data.tasks, data.deps).filter(
      (t) =>
        taskBlockers(t, data.tasks, data.deps, data.issues).tasks.length === 1 &&
        !taskBlockers(t, data.tasks, data.deps, data.issues).issues.length,
    );
    await update(
      task,
      { status: "concluida" },
      released.length
        ? `Concluída. Liberou: ${released.map((t) => t.title).join(", ")}.`
        : "Tarefa concluída.",
    );
  }
  async function drop(e: DragEvent, workId: string, day: string | null) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task");
    const task = data.tasks.find((t) => t.id === id);
    if (!task || task.planned_date === day) return;
    if (task.work_id !== workId) {
      toast.error("A tarefa só pode mudar de dia, não de obra.");
      return;
    }
    await update(
      task,
      { planned_date: day },
      day ? `Tarefa movida para ${dayShort(day)}.` : "Tarefa movida para a lista de espera.",
    );
  }

  const step = view === "semana" ? 7 : 1;
  const rows = data.works.filter(
    (w) =>
      (search.obra ? w.id === search.obra : true) &&
      (search.obra || inWeek.some((t) => t.work_id === w.id) || w.status === "execucao"),
  );
  const respOptions = responsibleOptions([...data.tasks, ...data.issues], data.people);
  const late = overdueTasks(filtered, today).filter((t) => t.planned_date !== date);
  const backlog = filtered.filter(
    (t) => !t.planned_date && t.status !== "cancelada" && t.status !== "concluida",
  );

  const card = (t: WorkTask, compact = false) => {
    const st = state(t);
    const b = taskBlockers(t, ...ctx);
    const rel = taskReleases(t, data.tasks, data.deps);
    const who = responsibleName(t, data.people);
    return (
      <button
        key={t.id}
        type="button"
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
        onClick={() => setDraft(t)}
        className={cn(
          "grid w-full gap-0.5 rounded-lg border border-l-4 px-2 py-1.5 text-left text-xs shadow-xs transition hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring outline-none",
          STATE_STYLE[st],
        )}
      >
        <span className={cn("font-semibold leading-snug", st === "concluida" && "line-through")}>
          {st === "bloqueada" && <Lock className="mr-1 inline h-3 w-3" />}
          {t.title}
        </span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {t.priority === "urgente" && st !== "concluida" && (
            <Badge variant="negative" className="px-1.5 py-0 text-[10px]">
              Urgente
            </Badge>
          )}
          {st === "atrasada" && (
            <Badge variant="alert" className="px-1.5 py-0 text-[10px]">
              Atrasada
            </Badge>
          )}
          {st === "concluida" && (
            <Badge variant="positive" className="px-1.5 py-0 text-[10px]">
              Feita
            </Badge>
          )}
          {!compact && search.obra === undefined && null}
          {who && <span>{who}</span>}
          {st === "bloqueada" && (
            <span>
              aguarda {[...b.tasks.map((x) => x.title), ...b.issues.map((x) => x.title)].join(", ")}
            </span>
          )}
          {st !== "bloqueada" && st !== "concluida" && rel.length > 0 && (
            <Badge variant="info" className="px-1.5 py-0 text-[10px]">
              libera {rel.length}
            </Badge>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented>
            {(
              [
                ["semana", "Semana"],
                ["dia", "Dia"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={view === k}
                className={segmentClass(view === k)}
                onClick={() => setSearch({ view: k })}
              >
                {label}
              </button>
            ))}
          </Segmented>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={view === "semana" ? "Semana anterior" : "Dia anterior"}
            onClick={() => setSearch({ data: addDays(date, -step) })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-semibold tabular-nums">
            {view === "semana" ? weekLabel(date) : dayLong(date)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={view === "semana" ? "Próxima semana" : "Próximo dia"}
            onClick={() => setSearch({ data: addDays(date, step) })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {date !== today && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSearch({ data: undefined })}
            >
              Hoje
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Obra"
            className={cn(selectClass, "mt-0 w-auto min-w-40")}
            value={search.obra ?? ""}
            onChange={(e) => setSearch({ obra: e.target.value || undefined })}
          >
            <option value="">Todas as obras</option>
            {data.works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Responsável"
            className={cn(selectClass, "mt-0 w-auto min-w-40")}
            value={search.resp ?? ""}
            onChange={(e) => setSearch({ resp: e.target.value || undefined })}
          >
            <option value="">Todos os responsáveis</option>
            {respOptions.map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
          <Button variant="outline" asChild>
            <Link
              to="/planejamento/pdf"
              search={{
                data: date,
                ...(search.obra ? { obra: search.obra } : {}),
                ...(search.resp ? { resp: search.resp } : {}),
              }}
            >
              <FileDown className="h-4 w-4" />
              PDF da semana
            </Link>
          </Button>
          <Button
            type="button"
            onClick={() =>
              setDraft({
                work_id: search.obra ?? "",
                planned_date: view === "dia" ? date : date < days[0]! ? days[0]! : date,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Nova tarefa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label={view === "semana" ? "Tarefas na semana" : "Tarefas no dia"}
          icon={ListTodo}
          value={summary.total}
        />
        <KpiCard label="Urgentes" icon={Siren} tone="negative" value={summary.urgent} />
        <KpiCard label="Bloqueadas" icon={Lock} tone="alert" value={summary.blocked} />
        <KpiCard label="Concluídas" icon={CheckCircle2} tone="positive" value={summary.done} />
      </div>

      {view === "semana" ? (
        <>
          <div className={cn(panelClass, "overflow-x-auto")}>
            <div className="grid min-w-[1100px] grid-cols-[160px_repeat(7,minmax(130px,1fr))]">
              <div className="border-b border-r bg-muted/60 p-2 text-xs font-semibold">Obra</div>
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSearch({ view: "dia", data: d })}
                  className={cn(
                    "border-b border-r p-2 text-center text-xs font-semibold hover:underline",
                    d === today ? "bg-hero text-hero-foreground" : "bg-muted/60",
                  )}
                >
                  {dayShort(d)}
                  {d === today && " · hoje"}
                </button>
              ))}
              {rows.map((w) => (
                <div key={w.id} className="contents">
                  <div className="border-b border-r bg-muted/30 p-2 text-sm font-semibold">
                    <Link to="/obras/$id" params={{ id: w.id }} className="hover:underline">
                      {w.name}
                    </Link>
                  </div>
                  {days.map((d) => {
                    const list = sortTasks(
                      inWeek.filter(
                        (t) =>
                          t.work_id === w.id && t.planned_date === d && t.status !== "cancelada",
                      ),
                      ...ctx,
                      today,
                    );
                    return (
                      <div
                        key={d}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => void drop(e, w.id, d)}
                        onDoubleClick={() => setDraft({ work_id: w.id, planned_date: d })}
                        className={cn(
                          "group grid min-h-24 content-start gap-1.5 border-b border-r p-1.5",
                          d === today && "bg-primary-soft/50",
                        )}
                      >
                        {list.map((t) => card(t, true))}
                        <button
                          type="button"
                          onClick={() => setDraft({ work_id: w.id, planned_date: d })}
                          className="rounded-md py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          + tarefa
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {!rows.length && (
              <EmptyState
                compact
                icon={CalendarClock}
                title="Nenhuma obra em execução"
                description="Escolha uma obra no filtro ou crie uma tarefa."
                className="py-10"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <Legend className="bg-primary" label="Normal" />
            <Legend className="bg-negative" label="Urgente" />
            <Legend className="bg-muted-foreground/60" label="Bloqueada (depende de outra)" />
            <Legend className="bg-alert" label="Atrasada" />
            <Legend className="bg-positive" label="Concluída" />
            <span>
              Arraste uma tarefa para outro dia · clique duas vezes num dia vazio para criar.
            </span>
          </div>
          <Backlog
            tasks={backlog}
            workName={workName}
            onOpen={(t) => setDraft({ ...t, planned_date: t.planned_date ?? date })}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/task");
              const task = data.tasks.find((t) => t.id === id);
              if (task) void drop(e, task.work_id, null);
            }}
          />
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className={cn(panelClass, "space-y-1 p-4 sm:p-5")}>
            {late.length > 0 && date === today && (
              <div className="mb-3 space-y-2 rounded-xl bg-alert-soft p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-alert">
                  <AlertTriangle className="h-4 w-4" />
                  Atrasadas de dias anteriores
                </p>
                {sortTasks(late, ...ctx, today).map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0">
                      <b className="font-medium">{t.title}</b>{" "}
                      <span className="text-xs text-muted-foreground">
                        {workName(t.work_id)} · {dayShort(t.planned_date!)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void update(t, { planned_date: today }, "Tarefa passada para hoje.")
                      }
                    >
                      Passar para hoje
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {!dayTasks.length && (
              <EmptyState
                compact
                icon={CalendarClock}
                title="Nenhuma tarefa neste dia"
                description="Crie uma tarefa ou mova uma da lista de espera."
                className="py-10"
              />
            )}
            {[...new Set(dayTasks.map((t) => t.work_id))].map((wid) => (
              <div key={wid} className="pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {workName(wid)}
                </p>
                <ul className="divide-y">
                  {sortTasks(
                    dayTasks.filter((t) => t.work_id === wid && t.status !== "cancelada"),
                    ...ctx,
                    today,
                  ).map((t) => {
                    const st = state(t);
                    const b = taskBlockers(t, ...ctx);
                    const rel = taskReleases(t, data.tasks, data.deps);
                    const who = responsibleName(t, data.people);
                    const stage = stageName(t.stage_id);
                    return (
                      <li key={t.id} className="flex items-start gap-3 py-3">
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                            st === "concluida" && "border-positive bg-positive text-white",
                            st === "bloqueada" && "border-dashed bg-muted text-muted-foreground",
                          )}
                        >
                          {st === "concluida" ? (
                            <Check className="h-4 w-4" />
                          ) : st === "bloqueada" ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setDraft(t)}
                        >
                          <span
                            className={cn(
                              "block font-medium",
                              st === "concluida" && "line-through text-muted-foreground",
                            )}
                          >
                            {t.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {t.priority === "urgente" && st !== "concluida" && (
                              <Badge variant="negative">Urgente</Badge>
                            )}
                            {st === "atrasada" && <Badge variant="alert">Atrasada</Badge>}
                            {who && <span>{who}</span>}
                            {stage && <span>· Etapa {stage}</span>}
                            {st === "bloqueada" && (
                              <span>
                                · aguarda{" "}
                                {[
                                  ...b.tasks.map((x) => x.title),
                                  ...b.issues.map((x) => `pendência "${x.title}"`),
                                ].join(", ")}
                              </span>
                            )}
                            {st !== "concluida" && rel.length > 0 && (
                              <Badge variant="info">
                                ao concluir libera: {rel.map((x) => x.title).join(", ")}
                              </Badge>
                            )}
                            {t.notes && <span className="w-full">{t.notes}</span>}
                          </span>
                        </button>
                        {st === "concluida" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() =>
                              void update(t, { status: "a_fazer" }, "Tarefa reaberta.")
                            }
                          >
                            Reabrir
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant={st === "bloqueada" ? "outline" : "default"}
                            disabled={st === "bloqueada"}
                            onClick={() => void complete(t)}
                          >
                            <Check className="h-4 w-4" />
                            Feito
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
          <aside className="space-y-5">
            <Chains
              data={data}
              works={[...new Set([...dayTasks, ...late].map((t) => t.work_id))]}
              workName={workName}
              today={today}
            />
            <Backlog
              tasks={backlog}
              workName={workName}
              onOpen={(t) => setDraft({ ...t, planned_date: date })}
              narrow
            />
          </aside>
        </div>
      )}

      <TaskDialog draft={draft} data={data} onClose={() => setDraft(null)} />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={cn("inline-block h-3 w-3 rounded-sm", className)} />
      {label}
    </span>
  );
}

function Backlog({
  tasks,
  workName,
  onOpen,
  onDrop,
  narrow = false,
}: {
  narrow?: boolean;
  tasks: WorkTask[];
  workName: (id: string) => string;
  onOpen: (t: WorkTask) => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <section
      className={cn(panelClass, "space-y-2 p-4")}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
    >
      <h2 className="text-sm font-semibold">Sem dia (lista de espera)</h2>
      {tasks.length ? (
        <ul className={cn("grid gap-2", !narrow && "sm:grid-cols-2 lg:grid-cols-3")}>
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                onClick={() => onOpen(t)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {workName(t.work_id)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-primary">Planejar</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhuma tarefa sem dia.{" "}
          {onDrop ? "Arraste uma tarefa para cá para tirá-la da semana." : ""}
        </p>
      )}
    </section>
  );
}

function Chains({
  data,
  works,
  workName,
  today,
}: {
  data: PlanningData;
  works: string[];
  workName: (id: string) => string;
  today: string;
}) {
  const chains = works
    .map((w) => ({ w, list: dependencyChain(w, data.tasks, data.deps) }))
    .filter((c) => c.list.length);
  if (!chains.length) return null;
  return (
    <section className={cn(panelClass, "space-y-3 p-4")}>
      <h2 className="text-sm font-semibold">Sequência das obras</h2>
      <p className="text-xs text-muted-foreground">
        O que precisa terminar para liberar o próximo.
      </p>
      {chains.map(({ w, list }) => (
        <div key={w} className="space-y-1.5">
          <p className="text-xs font-semibold text-primary">{workName(w)}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {list.map((t, i) => {
              const st = taskState(t, data.tasks, data.deps, data.issues, today);
              return (
                <span key={t.id} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-medium",
                      st === "concluida" && "border-transparent bg-positive-soft text-positive",
                      st === "bloqueada" && "border-dashed text-muted-foreground",
                      (st === "normal" || st === "urgente" || st === "atrasada") &&
                        "border-primary bg-primary-soft text-primary",
                    )}
                  >
                    {t.title}
                    {st === "concluida" && " ✓"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
