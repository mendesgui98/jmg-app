import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { businessDate } from "@/lib/dashboard-math";
import { addDays } from "@/lib/proposal";
import { pageMeta } from "@/lib/page-meta";
import { fmtDate } from "@/lib/format";
import { planningOptions } from "@/lib/planning-data";
import { mergeSearch, planningSearch } from "@/lib/planning-search";
import {
  AUTO_ORIGIN_LABEL,
  OWNER_LABEL,
  autoIssues,
  dayLong,
  issueOverdue,
  overdueTasks,
  respKey,
  responsibleName,
  sortIssues,
  sortTasks,
  taskBlockers,
  taskState,
  weekDays,
  weekLabel,
  type OwnerKind,
} from "@/lib/planning";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Folha da semana para as equipes: tarefas de segunda a domingo e pendências abertas, filtradas
// por obra e responsável (mesmos filtros do Planejamento). Imprime ou salva em PDF pelo navegador
// e abre bem no celular.
export const Route = createFileRoute("/_authenticated/planejamento/pdf")({
  validateSearch: planningSearch,
  head: () =>
    pageMeta(
      "Planejamento da semana | JMG Reformas",
      "Tarefas da semana e pendências das obras para as equipes.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(planningOptions),
  component: PlanningPdf,
});

function PlanningPdf() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(planningOptions);
  const today = businessDate();
  const date = search.data || today;
  const days = weekDays(date);
  const ctx = [data.tasks, data.deps, data.issues] as const;
  const workName = (id: string) => data.works.find((w) => w.id === id)?.name ?? "Obra";
  const match = (x: { work_id: string; person_id?: string | null; responsible?: string | null }) =>
    (!search.obra || x.work_id === search.obra) && (!search.resp || respKey(x) === search.resp);
  const tasks = data.tasks.filter((t) => match(t) && t.status !== "cancelada");
  const inWeek = (d: string) =>
    sortTasks(
      tasks.filter((t) => t.planned_date === d),
      ...ctx,
      today,
    );
  const late = overdueTasks(tasks, days[0]!);
  const issues = sortIssues(
    data.issues.filter((i) => i.status === "aberta" && match(i)),
    today,
  );
  const auto = search.resp
    ? []
    : autoIssues({ today, ...data }).filter(
        (a) => (!search.obra || a.work_id === search.obra) && a.origin !== "planejamento",
      );
  const respName = search.resp
    ? responsibleName(
        search.resp.startsWith("p:")
          ? { person_id: search.resp.slice(2) }
          : { responsible: search.resp.slice(2) },
        data.people,
      )
    : "";
  const filters = [
    search.obra ? workName(search.obra) : "Todas as obras",
    respName ? `Responsável: ${respName}` : "",
  ].filter(Boolean);
  const go = (d: string) =>
    void navigate({ to: "/planejamento/pdf", search: mergeSearch(search, { data: d }) });

  const row = (t: (typeof tasks)[number]) => {
    const st = taskState(t, ...ctx, today);
    const b = taskBlockers(t, ...ctx);
    const who = responsibleName(t, data.people);
    return (
      <tr key={t.id} className="border-b align-top">
        <td className="w-7 p-2">
          <span
            aria-hidden
            className={cn(
              "inline-block h-4 w-4 rounded border-2 border-foreground/50 text-center text-[10px] leading-3",
              st === "concluida" && "border-positive bg-positive text-white",
            )}
          >
            {st === "concluida" ? "✓" : ""}
          </span>
        </td>
        <td className="p-2">
          <b className={cn("font-semibold", st === "concluida" && "line-through")}>{t.title}</b>
          {t.priority === "urgente" && st !== "concluida" && (
            <span className="ml-1.5 font-bold text-negative">URGENTE</span>
          )}
          {st === "bloqueada" && (
            <span className="block text-[11px] text-muted-foreground">
              Aguardando:{" "}
              {[...b.tasks.map((x) => x.title), ...b.issues.map((x) => x.title)].join(", ")}
            </span>
          )}
          {t.notes && <span className="block text-[11px] text-muted-foreground">{t.notes}</span>}
        </td>
        {!search.obra && <td className="p-2">{workName(t.work_id)}</td>}
        {!search.resp && <td className="p-2">{who || "—"}</td>}
      </tr>
    );
  };
  const head = (
    <thead>
      <tr className="border-b bg-muted/40 text-left">
        <th className="w-7 p-2" />
        <th className="p-2">Tarefa</th>
        {!search.obra && <th className="w-[28%] p-2">Obra</th>}
        {!search.resp && <th className="w-[22%] p-2">Responsável</th>}
      </tr>
    </thead>
  );

  return (
    <div className="min-h-screen bg-muted p-3 sm:p-4">
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <Link
            to="/planejamento"
            search={{
              data: date,
              ...(search.obra ? { obra: search.obra } : {}),
              ...(search.resp ? { resp: search.resp } : {}),
            }}
          >
            ← Planejamento
          </Link>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana anterior"
          onClick={() => go(addDays(date, -7))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{weekLabel(date)}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Próxima semana"
          onClick={() => go(addDays(date, 7))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button className="ml-auto" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir / salvar PDF
        </Button>
      </div>
      <article className="schedule-print mx-auto max-w-4xl bg-card p-4 text-sm text-card-foreground sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <img src="/jmg-logo-blue.png" alt="JMG Reformas" className="h-14 w-14 object-contain" />
          <div className="text-right">
            <h1 className="text-xl font-bold">Planejamento da semana</h1>
            <p className="font-semibold">{weekLabel(date)}</p>
            <p className="text-xs text-muted-foreground">
              {filters.join(" · ")} · Emitido em {fmtDate(today)}
            </p>
          </div>
        </header>

        {late.length > 0 && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-1 font-bold text-alert">Atrasadas de semanas anteriores</h2>
            <table className="w-full table-fixed text-xs">
              {head}
              <tbody>{sortTasks(late, ...ctx, today).map(row)}</tbody>
            </table>
          </section>
        )}

        {days.map((d) => {
          const list = inWeek(d);
          return (
            <section key={d} className="mt-5 break-inside-avoid">
              <h2 className={cn("mb-1 font-bold", d === today && "text-primary")}>
                {dayLong(d)}
                {d === today && " · hoje"}
              </h2>
              {list.length ? (
                <table className="w-full table-fixed text-xs">
                  {head}
                  <tbody>{list.map(row)}</tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">Sem tarefas.</p>
              )}
            </section>
          );
        })}

        <section className="mt-7 break-inside-avoid">
          <h2 className="mb-1 font-bold">Pendências abertas</h2>
          {issues.length || auto.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2">Pendência</th>
                  {!search.obra && <th className="p-2">Obra</th>}
                  <th className="p-2">Quem resolve</th>
                  <th className="p-2">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i) => {
                  const who = responsibleName(i, data.people);
                  const blocked = data.tasks.find((t) => t.id === i.blocks_task_id)?.title;
                  return (
                    <tr key={i.id} className="border-b align-top">
                      <td className="p-2">
                        <b className="font-semibold">{i.title}</b>
                        {i.priority === "urgente" && (
                          <span className="ml-1.5 font-bold text-negative">URGENTE</span>
                        )}
                        {blocked && (
                          <span className="block text-[11px] text-muted-foreground">
                            Trava: {blocked}
                          </span>
                        )}
                      </td>
                      {!search.obra && <td className="p-2">{workName(i.work_id)}</td>}
                      <td className="p-2">
                        {OWNER_LABEL[i.owner_kind as OwnerKind] ?? i.owner_kind}
                        {who ? ` · ${who}` : ""}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap p-2",
                          issueOverdue(i, today) && "font-bold text-negative",
                        )}
                      >
                        {i.due_date ? fmtDate(i.due_date) : "—"}
                        {issueOverdue(i, today) && " (vencida)"}
                      </td>
                    </tr>
                  );
                })}
                {auto.map((a) => (
                  <tr key={a.key} className="border-b align-top">
                    <td className="p-2">
                      <b className="font-semibold">{a.title}</b>
                      <span className="block text-[11px] text-muted-foreground">
                        {AUTO_ORIGIN_LABEL[a.origin]} · {a.detail}
                      </span>
                    </td>
                    {!search.obra && <td className="p-2">{workName(a.work_id)}</td>}
                    <td className="p-2">JMG</td>
                    <td className="whitespace-nowrap p-2">{a.date ? fmtDate(a.date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma pendência aberta.</p>
          )}
        </section>
      </article>
    </div>
  );
}
