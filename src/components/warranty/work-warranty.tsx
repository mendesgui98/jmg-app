import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageSkeleton } from "@/components/feedback";
import { IconBubble, KpiCard, Notice } from "@/components/kpi";
import { businessDate } from "@/lib/dashboard-math";
import { fmtDate } from "@/lib/format";
import { useBRL } from "@/lib/hidden-values";
import { panelClass } from "@/lib/surface";
import { openDocument } from "@/lib/work-data";
import { cn } from "@/lib/utils";
import {
  WARRANTY_MONTHS,
  finalInspectionDate,
  warrantyReport,
  warrantyState,
} from "@/lib/warranty";
import {
  claimCosts,
  executorNameOf,
  stageNameOf,
  warrantyInfo,
  warrantyOptions,
} from "@/lib/warranty-data";
import {
  ClaimDialog,
  VisitDialog,
  WarrantyDialog,
  type ClaimDraft,
  type VisitDraft,
} from "./warranty-dialogs";
import { ClaimCard, PhaseBadge, WarrantyBar } from "./warranty-parts";

/** Aba Garantia da obra: entrega, prazo, chamados com visitas e resumo por etapa. */
export function WorkWarranty({
  workId,
  canSeeCosts,
  focus,
}: {
  workId: string;
  canSeeCosts: boolean;
  /** Chamado a destacar (link do Painel ou do menu). */
  focus?: string | undefined;
}) {
  const brl = useBRL();
  const today = businessDate();
  const { data, error } = useQuery(warrantyOptions);
  const [dialog, setDialog] = useState<"new" | "edit" | null>(null);
  const [claim, setClaim] = useState<ClaimDraft | null>(null);
  const [visit, setVisit] = useState<VisitDraft | null>(null);
  const costs = useMemo(() => (data ? claimCosts(data) : new Map<string, number>()), [data]);
  if (error)
    return <Notice tone="negative">Não foi possível carregar a garantia: {error.message}</Notice>;
  if (!data) return <PageSkeleton cards={2} />;
  const warranty = data.warranties.find((w) => w.work_id === workId);
  const dialogs = (
    <>
      <WarrantyDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        data={data}
        workId={dialog === "new" ? workId : undefined}
        warranty={dialog === "edit" ? warranty : undefined}
        canSeeCosts={canSeeCosts}
      />
      <ClaimDialog draft={claim} data={data} onClose={() => setClaim(null)} />
      <VisitDialog
        draft={visit}
        data={data}
        canSeeCosts={canSeeCosts}
        onClose={() => setVisit(null)}
      />
    </>
  );
  if (!warranty)
    return (
      <section className={panelClass}>
        <EmptyState
          icon={ShieldCheck}
          title="A garantia começa na entrega da obra"
          description={`Registre a data de entrega e o termo assinado: a garantia de ${WARRANTY_MONTHS} meses passa a contar e os chamados do cliente ficam aqui.`}
          action={
            <Button type="button" onClick={() => setDialog("new")}>
              <ShieldCheck className="h-4 w-4" />
              Registrar entrega
            </Button>
          }
        />
        {dialogs}
      </section>
    );

  const s = warrantyState(warranty, today);
  const info = warrantyInfo(warranty, data);
  const claims = data.claims.filter((c) => c.warranty_id === warranty.id);
  const report = warrantyReport({
    claims,
    visits: data.visits,
    costs,
    from: "0000-01-01",
    to: today,
    stageName: stageNameOf(data),
    executorName: executorNameOf(data),
    warrantyName: () => info.name,
  });
  const inspection = finalInspectionDate(warranty);
  const repeated = report.byStage.filter((x) => x.claims > 1 && x.id);
  return (
    <div className="space-y-5">
      <section className={cn(panelClass, "flex flex-wrap items-center gap-6 p-5")}>
        <div className="flex min-w-0 flex-[1_1_280px] items-center gap-3.5">
          <IconBubble icon={ShieldCheck} tone="brand" className="h-12 w-12" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Garantia {warranty.term_months ? `de ${warranty.term_months} meses` : ""}
              <PhaseBadge warranty={warranty} today={today} />
            </div>
            <p className="text-2xl font-bold num">{s.label}</p>
            <p className="text-xs text-muted-foreground">
              Entregue em {fmtDate(warranty.start_date)} · vence em {fmtDate(warranty.end_date)}
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-[2_1_340px] space-y-2">
          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span>Entrega {fmtDate(warranty.start_date)}</span>
            <span className="num">Hoje · {s.elapsed}% do prazo</span>
            <span>Fim {fmtDate(warranty.end_date)}</span>
          </div>
          <WarrantyBar warranty={warranty} today={today} marker />
          <p className="flex items-center gap-1.5 text-xs text-alert">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm bg-gold" />
            {warranty.final_inspection_done
              ? `Vistoria final feita (${fmtDate(inspection)})`
              : `Vistoria final ${warranty.final_inspection_date ? "agendada" : "sugerida"} para ${fmtDate(inspection)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {warranty.handover_path && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                openDocument(warranty.handover_path!).catch((e) =>
                  toast.error((e as Error).message),
                )
              }
            >
              <FileText className="h-4 w-4" />
              Termo de entrega
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setDialog("edit")}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          {s.phase !== "encerrada" && (
            <Button type="button" onClick={() => setClaim({ warranty_id: warranty.id })}>
              <Plus className="h-4 w-4" />
              Novo chamado
            </Button>
          )}
        </div>
      </section>

      <div
        className={cn("grid grid-cols-2 gap-3", canSeeCosts ? "lg:grid-cols-5" : "lg:grid-cols-4")}
      >
        <KpiCard label="Chamados" value={report.total} hint={`${report.open} em aberto`} />
        <KpiCard label="Visitas feitas" value={report.visits} />
        <KpiCard
          label="Visitas por chamado"
          value={report.total ? report.visitsPerClaim.toFixed(1).replace(".", ",") : "—"}
        />
        <KpiCard
          label="Até a 1ª visita (média)"
          value={
            report.avgFirstVisit === null
              ? "—"
              : `${report.avgFirstVisit.toFixed(1).replace(".", ",").replace(",0", "")} dias úteis`
          }
        />
        {canSeeCosts && (
          <KpiCard
            label="Custo da garantia"
            value={brl(report.cost)}
            hint="Contas a pagar dos chamados"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-5">
        <section className={cn(panelClass, "min-w-0 flex-[999_1_560px] overflow-hidden")}>
          <header className="flex items-center justify-between gap-2 p-4 pb-2 sm:p-5 sm:pb-2">
            <h2 className="text-base font-semibold">Chamados desta obra</h2>
            <span className="text-xs text-muted-foreground">mais recentes primeiro</span>
          </header>
          {claims.length ? (
            <div className="divide-y divide-border/60 border-t border-border/60">
              {claims.map((c) => (
                <ClaimCard
                  key={c.id}
                  claim={c}
                  data={data}
                  today={today}
                  canSeeCosts={canSeeCosts}
                  costs={costs}
                  highlight={c.id === focus}
                  onEdit={() => setClaim(c)}
                  onVisit={(v) => setVisit(v)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={ShieldCheck}
              title="Nenhum chamado"
              description="Quando o cliente avisar um problema, abra um chamado em Novo chamado."
            />
          )}
        </section>
        <section
          className={cn(
            panelClass,
            "flex min-w-0 flex-[1_1_300px] flex-col gap-3 self-start p-4 sm:p-5",
          )}
        >
          <h2 className="text-base font-semibold">Por etapa nesta obra</h2>
          {report.byStage.length ? (
            report.byStage.map((x) => (
              <div key={x.id} className="text-[13px]">
                <span className="block font-medium">{x.name}</span>
                <span className="text-muted-foreground num">
                  {x.claims} {x.claims === 1 ? "chamado" : "chamados"} · {x.visits}{" "}
                  {x.visits === 1 ? "visita" : "visitas"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sem chamados ainda.</p>
          )}
          {repeated.length > 0 && (
            <p className="rounded-xl bg-gold-soft p-3 text-[13px] text-alert">
              <b>Atenção:</b> {repeated.map((x) => `${x.name} (${x.claims} chamados)`).join(", ")}{" "}
              já se repetiu nesta obra.
            </p>
          )}
          {info.address && <p className="text-xs text-muted-foreground">{info.address}</p>}
        </section>
      </div>
      {dialogs}
    </div>
  );
}
