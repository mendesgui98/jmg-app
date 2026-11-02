import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { businessDate } from "@/lib/dashboard-math";
import { workOptions, workClientOptions } from "@/lib/work-data";
import { checklistByStage, checklistOptions } from "@/lib/work-checklist";
import { stageStatus } from "@/lib/work-progress";
import { stageLabels } from "@/lib/stage-labels";
import { calendarDays } from "@/lib/work-schedule";
import { fmtDate, fmtStamp, fmtNum } from "@/lib/format";
import { pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/obras/$id/checklist/pdf")({
  validateSearch: (s: Record<string, unknown>): { stage?: string } => ({
    stage: typeof s["stage"] === "string" ? s["stage"] : "",
  }),
  head: () =>
    pageMeta(
      "Checklist da obra | JMG Reformas",
      "Lista de conferência dos serviços de cada etapa, com o cronograma da obra.",
    ),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(workOptions(params.id)),
      context.queryClient.ensureQueryData(checklistOptions(params.id)),
      context.queryClient.ensureQueryData(workClientOptions(params.id)),
    ]);
  },
  component: ChecklistPdf,
});

function ChecklistPdf() {
  const { id } = Route.useParams();
  const { stage: stageId } = Route.useSearch();
  const { data } = useSuspenseQuery(workOptions(id));
  const { data: checklist } = useSuspenseQuery(checklistOptions(id));
  const { data: client } = useSuspenseQuery(workClientOptions(id));
  const today = businessDate();
  const groups = checklistByStage(data.stages, checklist.items);
  const selected = stageId ? groups.filter((g) => g.stage.id === stageId) : groups;
  const missing = !!stageId && !selected.length;
  const single = selected.length === 1 && !!stageId ? selected[0] : null;

  return (
    <div className="bg-muted p-4">
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/obras/$id" params={{ id }} search={{ tab: "checklist" }}>
            ← Checklist
          </Link>
        </Button>
        <Button disabled={missing} onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
      </div>
      {missing ? (
        <p role="alert">Etapa não encontrada.</p>
      ) : (
        <article className="schedule-print mx-auto max-w-5xl bg-card p-6 text-card-foreground md:p-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
            <img src="/jmg-logo-blue.png" alt="JMG Reformas" className="h-20 w-20 object-contain" />
            <div className="text-right">
              <h1 className="text-2xl font-bold">Checklist de Conferência</h1>
              <p className="mt-2 text-xs text-muted-foreground">
                {single ? `Etapa: ${single.stage.name}` : "Todas as etapas"} · Emissão{" "}
                {fmtDate(today)}
              </p>
            </div>
          </header>
          <h2 className="mt-6 text-lg font-bold">{data.work.name}</h2>
          <p className="mt-1 text-sm">Cliente: {client}</p>
          <p className="text-sm">Local: {data.work.address || "Não informado"}</p>

          <h2 className="mb-2 mt-6 text-sm font-bold">Cronograma da obra</h2>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Etapa", "Início", "Término", "Duração", "Situação", "Avanço", "Conferidos"].map(
                  (h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr
                  key={g.stage.id}
                  className={cn(
                    "border-b",
                    single?.stage.id === g.stage.id && "bg-muted/60 font-bold",
                  )}
                >
                  <td className="p-2">{g.stage.name}</td>
                  <td className="whitespace-nowrap p-2">{fmtDate(g.stage.planned_start)}</td>
                  <td className="whitespace-nowrap p-2">{fmtDate(g.stage.planned_end)}</td>
                  <td className="whitespace-nowrap p-2">
                    {(() => {
                      const days = calendarDays(g.stage.planned_start, g.stage.planned_end);
                      return days === null ? "—" : `${days} dias`;
                    })()}
                  </td>
                  <td className="p-2">{stageLabels[stageStatus(g.stage, today)]}</td>
                  <td className="p-2">{fmtNum(g.stage.progress)}%</td>
                  <td className="whitespace-nowrap p-2">
                    {g.done}/{g.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selected.map((g, index) => (
            <section
              key={g.stage.id}
              className={cn("mt-8 break-inside-avoid", index > 0 && "print:break-before-page")}
            >
              <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-2">
                <h2 className="text-base font-bold">{g.stage.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Previsto {fmtDate(g.stage.planned_start)} → {fmtDate(g.stage.planned_end)}
                  {g.stage.actual_start && ` · Início real ${fmtDate(g.stage.actual_start)}`}
                  {g.stage.actual_end && ` · Término real ${fmtDate(g.stage.actual_end)}`}
                </p>
              </div>
              {g.items.length ? (
                <table className="mt-2 w-full text-left text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-10 p-2">OK</th>
                      <th className="p-2">Serviço / item</th>
                      <th className="w-40 p-2">Conferido</th>
                      <th className="w-48 p-2">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((item) => (
                      <tr key={item.id} className="border-b align-top">
                        <td className="p-2">
                          <span className="flex h-5 w-5 items-center justify-center border-2 border-foreground text-sm font-bold leading-none">
                            {item.checked ? "✓" : ""}
                          </span>
                        </td>
                        <td className="p-2">{item.description}</td>
                        <td className="p-2">
                          {item.checked && item.checked_at
                            ? `${checklist.names[item.checked_by ?? ""] ?? "Usuário"} · ${fmtStamp(item.checked_at)}`
                            : ""}
                        </td>
                        <td className="p-2">
                          {item.note || <span className="block h-4 border-b border-dotted" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Nenhum item nesta etapa.</p>
              )}
              <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
                <div>
                  <div className="h-10 border-b border-foreground" />
                  <p className="mt-1">Responsável pela conferência</p>
                </div>
                <div>
                  <div className="h-10 border-b border-foreground" />
                  <p className="mt-1">Data: ____/____/________</p>
                </div>
              </div>
            </section>
          ))}

          <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
            JMG Reformas · {fmtDate(today)}
          </footer>
        </article>
      )}
    </div>
  );
}
