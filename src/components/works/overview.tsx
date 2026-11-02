import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  HardHat,
  Receipt,
  Wallet,
} from "lucide-react";
import { IconBubble, KpiCard, Money } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { businessDate } from "@/lib/dashboard-math";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { weightedProgress, financeTotals } from "@/lib/operations";
import { worksOptions } from "@/lib/work-data";
import { financeOptions } from "@/lib/finance-data";
import { fmtDate, fmtNum } from "@/lib/format";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
import { WORK_STATUS_LABEL, workStatusLabel } from "@/lib/work-status";
export function WorkOverview() {
  const { data: me } = useMe();
  const { data: works = [] } = useQuery(worksOptions);
  const { data: f } = useQuery({ ...financeOptions, enabled: !!me?.canSeeCosts });
  const { data: stages = [] } = useQuery({
    queryKey: ["all-work-stages"],
    queryFn: async () => {
      const r = await supabase.from("work_stages").select("*").eq("removed", false);
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const { data: records = [] } = useQuery({
    queryKey: ["attention-records"],
    queryFn: async () => {
      const r = await supabase
        .from("work_records")
        .select("id,work_id,title,due_date,status,kind")
        .not("due_date", "is", null);
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const today = businessDate();
  const totals = f ? financeTotals(f.entries, f.settlements) : null;
  const overdue =
    f?.entries.filter(
      (e) =>
        !e.canceled &&
        e.due_date <= today &&
        e.amount >
          f.settlements.filter((s) => s.entry_id === e.id).reduce((t, s) => t + s.amount, 0),
    ) ?? [];
  const lateRecords = records.filter(
    (r) => r.due_date && r.due_date <= today && !["aceito", "concluido"].includes(r.status),
  );
  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Obras em andamento</h2>
        <Link to="/obras" className="text-sm font-medium text-primary hover:underline">
          Todas as obras →
        </Link>
      </div>
      {totals && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard
            label="Recebido"
            icon={ArrowUp}
            tone="positive"
            value={<Money value={totals.received} />}
          />
          <KpiCard
            label="A receber"
            icon={CalendarClock}
            tone="positive"
            filled
            value={<Money value={totals.receivable} />}
          />
          <KpiCard
            label="Pago"
            icon={ArrowDown}
            tone="negative"
            value={<Money value={totals.spent} />}
          />
          <KpiCard
            label="A pagar"
            icon={Receipt}
            tone="negative"
            filled
            value={<Money value={totals.payable} />}
          />
          <KpiCard
            className="col-span-2 lg:col-span-1"
            label="Saldo"
            icon={Wallet}
            tone={totals.cash < 0 ? "negative" : "neutral"}
            value={<Money value={totals.cash} />}
          />
        </div>
      )}
      <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
        {works
          .filter((w) => w.status !== "concluida")
          .map((w) => {
            const own = stages.filter((s) => s.work_id === w.id);
            const progress = weightedProgress(own);
            const delayed = own.filter(
              (s) => s.planned_end && s.planned_end < today && s.progress < 100,
            );
            return (
              <Link
                key={w.id}
                to="/obras/$id"
                params={{ id: w.id }}
                className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5"
              >
                <IconBubble icon={HardHat} tone="brand" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-snug">{w.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {WORK_STATUS_LABEL[w.status] ?? w.status} · {fmtDate(w.planned_end)}
                  </p>
                  {delayed.length > 0 && (
                    <p className="text-xs font-medium text-negative">
                      {delayed.length} etapa(s) atrasada(s)
                    </p>
                  )}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 font-semibold num">{fmtNum(progress.progress)}%</span>
              </Link>
            );
          })}
        {!works.length && <EmptyState compact icon={HardHat} title="Nenhuma obra ativa" />}
      </div>
      {(overdue.length > 0 || lateRecords.length > 0) && (
        <div className="rounded-xl bg-alert-soft p-4 text-alert">
          <h3 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Atenção
          </h3>
          {overdue.map((e) => (
            <Link to="/financeiro" key={e.id} className="block py-1 text-sm hover:underline">
              {e.description} · vencimento {fmtDate(e.due_date)}
            </Link>
          ))}
          {lateRecords.map((r) => (
            <Link
              key={r.id}
              to="/obras/$id"
              params={{ id: r.work_id }}
              className="block py-1 text-sm hover:underline"
            >
              {r.title} · {fmtDate(r.due_date)}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
