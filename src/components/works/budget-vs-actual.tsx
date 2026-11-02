import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { financeOptions } from "@/lib/finance-data";
import { dashboardOptions } from "@/lib/dashboard-data";
import { stageServicesOptions, stageValuesOptions } from "@/lib/stage-services-data";
import { earnedVariance, stageCosts, unassignedStageSpent } from "@/lib/operations";
import { fmtNum, fmtPct } from "@/lib/format";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { IconBubble, KpiCard, Money } from "@/components/kpi";

type Stage = Database["public"]["Tables"]["work_stages"]["Row"];

/**
 * Orçado × realizado por etapa: orçado = custo direto previsto da etapa (serviços vindos do
 * orçamento ou valor digitado), realizado = saídas pagas ligadas à etapa (stageCosts).
 */
export function BudgetVsActual({ workId, stages }: { workId: string; stages: Stage[] }) {
  const { data: services = [] } = useQuery(stageServicesOptions(workId));
  const { data: values = [] } = useQuery(stageValuesOptions(workId));
  const { data: finance } = useQuery(financeOptions);
  const { data: dash } = useQuery(dashboardOptions);
  if (!finance) return null;
  const entries = finance.entries.filter((e) => e.work_id === workId);
  const rows = stages
    .map((st) => {
      const c = stageCosts(
        st.id,
        services,
        entries,
        finance.settlements,
        values.find((v) => v.stage_id === st.id),
      );
      return { id: st.id, name: st.name, ...earnedVariance(c.planned, st.progress, c.spent) };
    })
    .filter((r) => r.planned > 0 || r.actual > 0);
  const loose = unassignedStageSpent(workId, entries, finance.settlements);
  if (loose > 0)
    rows.push({ id: "sem-etapa", name: "Sem etapa vinculada", ...earnedVariance(0, 0, loose) });
  const planned = rows.reduce((t, r) => t + r.planned, 0);
  const earned = rows.reduce((t, r) => t + r.earned, 0);
  const actual = rows.reduce((t, r) => t + r.actual, 0);
  const total = {
    planned,
    earned,
    actual,
    difference: Math.round((actual - earned) * 100) / 100,
    variation: earned > 0 ? (actual - earned) / earned : null,
  };
  const contract = dash?.works.find((w) => w.work.id === workId)?.base.saleNet ?? null;
  const tone = (d: number) => (d > 0 ? "text-negative" : d < 0 ? "text-positive" : "");

  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <IconBubble icon={Scale} tone="brand" />
        <div>
          <h2 className="text-base font-semibold">Orçado × realizado</h2>
          <p className="text-xs text-muted-foreground">
            O que já foi pago em cada etapa comparado ao orçado do que já foi feito (orçado ×
            avanço). Etapa não iniciada fica "a executar".
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          label="Valor contratado"
          tone="brand"
          value={contract === null ? "—" : <Money value={contract} />}
        />
        <KpiCard
          label="Orçado do executado"
          value={<Money value={total.earned} />}
          hint={
            <>
              de <Money value={total.planned} /> orçados
            </>
          }
        />
        <KpiCard
          label="Custo direto realizado"
          tone="negative"
          value={<Money value={total.actual} />}
        />
        <KpiCard
          label="Diferença"
          tone={total.difference > 0 ? "negative" : "positive"}
          value={
            <Money
              value={total.difference}
              signed={total.difference > 0 ? "+" : total.difference < 0 ? "−" : undefined}
            />
          }
          hint={
            total.variation === null
              ? "Nada executado ainda"
              : `${total.difference > 0 ? "+" : ""}${fmtPct(total.variation)} sobre o executado`
          }
        />
      </div>
      {rows.length ? (
        <div className={cn(panelClass, "overflow-x-auto")}>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {["Etapa", "Orçado", "Avanço", "Orçado do executado", "Realizado", "Diferença"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cn("px-4 py-3 font-medium", i ? "text-right" : "text-left")}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={r.planned} />
                  </td>
                  <td className="px-4 py-3 text-right num">{fmtNum(r.progress)}%</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={r.earned} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={r.actual} />
                  </td>
                  <td className={cn("px-4 py-3 text-right font-medium", tone(r.difference))}>
                    {r.notStarted ? (
                      <span className="text-xs font-normal text-muted-foreground">a executar</span>
                    ) : (
                      <>
                        <Money
                          value={r.difference}
                          signed={r.difference > 0 ? "+" : r.difference < 0 ? "−" : undefined}
                        />
                        {r.variation !== null && (
                          <span className="block text-xs num">
                            {`${r.variation > 0 ? "+" : ""}${fmtPct(r.variation)}`}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Nenhuma etapa com custo orçado ou gasto lançado ainda.
        </p>
      )}
    </section>
  );
}
