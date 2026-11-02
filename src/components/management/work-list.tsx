import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HardHat, Search } from "lucide-react";
import { dashboardOptions } from "@/lib/dashboard-data";
import { worksOptions } from "@/lib/work-data";
import { supabase } from "@/integrations/supabase/client";
import { weightedProgress } from "@/lib/operations";
import { ScheduleSituation } from "@/components/works/schedule-situation";
import { fmtBRL, fmtNum } from "@/lib/format";
import { useMe } from "@/hooks/use-me";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { WORK_STATUS_VARIANT } from "@/lib/status-badges";
import { IconBubble, Meter, Money } from "@/components/kpi";
import { EmptyState } from "@/components/feedback";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { WORK_STATUS_LABEL, workStatusLabel } from "@/lib/work-status";
export function WorkList() {
  const { data: me } = useMe();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [pilot, setPilot] = useState(false);
  const { data: works = [] } = useQuery(worksOptions);
  const { data: financial, error } = useQuery({ ...dashboardOptions, enabled: !!me?.canSeeCosts });
  const { data: stages = [] } = useQuery({
    queryKey: ["all-work-stages"],
    queryFn: async () => {
      const r = await supabase.from("work_stages").select("*").eq("removed", false);
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const rows = works.filter(
    (w) =>
      (pilot || !w.is_pilot) &&
      (!q || (w.name + " " + w.address).toLowerCase().includes(q.toLowerCase())) &&
      (status === "all" ||
        (status === "active" && ["execucao", "contratacao"].includes(w.status)) ||
        w.status === status),
  );
  return (
    <section className="space-y-5">
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto flex-wrap justify-start">
          {[
            ["active", "Ativas"],
            ["contratacao", "Em contratação"],
            ["pausada", "Pausadas"],
            ["concluida", "Concluídas"],
            ["all", "Todas"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v || ""}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className={cn(panelClass, "flex flex-wrap items-center gap-x-4 gap-y-3 p-4")}>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar obra"
            placeholder="Buscar obra ou endereço"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={pilot} onChange={(e) => setPilot(e.target.checked)} />
          Incluir PILOTO — TESTE
        </label>
        <span className="text-xs text-muted-foreground sm:ml-auto">{rows.length} obras</span>
      </div>
      {error && <p className="text-destructive">{error.message}</p>}
      {/* Celular: cartões; telas maiores: tabela. */}
      <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden xl:hidden")}>
        {rows.map((w) => {
          const s = financial?.works.find((s) => s.work.id === w.id);
          const progress =
            s?.progress ?? weightedProgress(stages.filter((x) => x.work_id === w.id)).progress;
          return (
            <article key={w.id} className="space-y-3 px-4 py-4">
              <div className="flex items-start gap-3">
                <IconBubble icon={HardHat} tone="brand" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/obras/$id"
                      params={{ id: w.id }}
                      className="min-w-0 font-semibold leading-snug text-primary"
                    >
                      {w.name}
                    </Link>
                    <StatusBadge status={w.status} />
                  </div>
                  {w.address && <p className="mt-0.5 text-xs text-muted-foreground">{w.address}</p>}
                  {s?.work.client_id ? (
                    <Link
                      to="/cadastros/$id"
                      params={{ id: s.work.client_id }}
                      className="mt-0.5 block text-xs text-primary"
                    >
                      {s.client}
                    </Link>
                  ) : (
                    s?.client && <p className="mt-0.5 text-xs">{s.client}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Meter size="sm" label="Avanço físico" value={progress} />
                {me?.canSeeCosts && (
                  <Meter
                    size="sm"
                    label="Avanço financeiro"
                    value={s ? s.balance.financialProgress : null}
                    tone="positive"
                  />
                )}
              </div>
              {me?.canSeeCosts && (
                <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
                  {(
                    [
                      ["Valor", s?.result.sale, "positive"],
                      ["Recebido", s?.totals.received, "positive"],
                      ["Saldo", s?.balance.receivable, "inherit"],
                    ] as const
                  ).map(([l, v, tone]) => (
                    <div key={l} className="min-w-0">
                      <dt className="text-muted-foreground">{l}</dt>
                      <dd className="mt-0.5 font-semibold">
                        {v === undefined ? "—" : <Money value={v} tone={tone} />}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <ScheduleSituation
                workId={w.id}
                stages={stages.filter((x) => x.work_id === w.id)}
                end={w.planned_end}
                compact
              />
            </article>
          );
        })}
        {!rows.length && <EmptyState compact icon={HardHat} title="Nenhuma obra neste filtro." />}
      </div>
      <div className={cn(panelClass, "hidden overflow-hidden xl:block")}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {[
                  "Obra",
                  "Cliente",
                  "Status",
                  "Avanço Físico",
                  ...(me?.canSeeCosts ? ["Avanço Financeiro"] : []),
                  ...(me?.canSeeCosts ? ["Valor", "Recebido", "Saldo"] : []),
                  "Cronograma",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((w) => {
                const s = financial?.works.find((s) => s.work.id === w.id);
                const progress =
                  s?.progress ??
                  weightedProgress(stages.filter((x) => x.work_id === w.id)).progress;
                return (
                  <tr key={w.id} className="align-top transition-colors hover:bg-muted/30">
                    <td className="min-w-48 px-4 py-4">
                      <Link
                        to="/obras/$id"
                        params={{ id: w.id }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {w.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{w.address}</p>
                    </td>
                    <td className="px-4 py-4">
                      {s?.work.client_id ? (
                        <Link
                          to="/cadastros/$id"
                          params={{ id: s.work.client_id }}
                          className="text-primary hover:underline"
                        >
                          {s.client}
                        </Link>
                      ) : (
                        s?.client || "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="min-w-28 px-4 py-4">
                      <Meter size="sm" value={progress} />
                    </td>
                    {me?.canSeeCosts && (
                      <td className="min-w-32 px-4 py-4">
                        <Meter
                          size="sm"
                          value={s ? s.balance.financialProgress : null}
                          tone="positive"
                        />
                      </td>
                    )}
                    {me?.canSeeCosts &&
                      [s?.result.sale, s?.totals.received, s?.balance.receivable].map((v, i) => (
                        <td
                          key={i}
                          className={cn(
                            "whitespace-nowrap px-4 py-4 font-medium num",
                            i < 2 && v !== undefined && "text-positive",
                          )}
                        >
                          {v === undefined ? "—" : fmtBRL(v)}
                        </td>
                      ))}
                    <td className="min-w-56 px-4 py-4">
                      <ScheduleSituation
                        workId={w.id}
                        stages={stages.filter((x) => x.work_id === w.id)}
                        end={w.planned_end}
                        compact
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <EmptyState compact icon={HardHat} title="Nenhuma obra neste filtro." />}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = WORK_STATUS_LABEL[status] ?? status;
  const variant = WORK_STATUS_VARIANT[status] ?? "neutral";
  return (
    <Badge variant={variant} className="shrink-0 whitespace-nowrap">
      {label}
    </Badge>
  );
}
