import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { dashboardOptions, type WorkSummary } from "@/lib/dashboard-data";
import { fmtBRL, fmtNum, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Installments } from "./installments";
import { ContractInstallmentsButton } from "./contract-installments";
import { supabase } from "@/integrations/supabase/client";
import { splitPayments } from "@/lib/pricing";
import { workComposition, type WorkIndicator } from "@/lib/work-composition";
import { indicatorTotal, type Indicator } from "@/lib/executive";
import { CompositionTable } from "@/components/management/executive";
import { progressAttention } from "@/lib/work-progress";
import { WorkSituation } from "./situation";
import { workOptions } from "@/lib/work-data";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  FilePlus2,
  FileSignature,
  HardHat,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { KpiCard, Meter, Money, Notice, type Tone } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
/** Tom de significado de cada indicador pelo rótulo (só apresentação; valores já calculados). */
function metricTone(label: string, value: number | null): Tone {
  if (value === null) return "neutral";
  if (/resultado|fluxo|caixa|saldo das contas/i.test(label))
    return value < 0 ? "negative" : "positive";
  if (/aditivo/i.test(label)) return "extra";
  if (/custo|despesa|pagar/i.test(label)) return "negative";
  if (/recebido|receber|contrat|valor|total/i.test(label)) return "positive";
  return "neutral";
}
const notChecked = (
  <span className="text-base font-semibold text-muted-foreground">Não conferido</span>
);
export function Metrics({ rows }: { rows: [string, number | null][] }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {rows.map(([label, value]) => (
        <KpiCard
          key={label}
          label={label}
          tone={metricTone(label, value)}
          value={value === null ? notChecked : <Money value={value} />}
        />
      ))}
    </div>
  );
}
export function SummaryNumbers({ s }: { s: WorkSummary }) {
  const a = progressAttention(
    s.progress,
    s.balance.financialProgress,
    s.incurred,
    s.work.origin === "direto" && !s.result.estimateConfirmed ? null : s.result.cost,
  );
  return (
    <>
      <div className={cn(panelClass, "grid gap-5 p-4 sm:grid-cols-3 sm:p-5")}>
        <Meter label="Avanço físico" value={s.progress} tone="brand" />
        <Meter
          label="Avanço financeiro · recebido / contrato"
          value={s.balance.financialProgress}
          tone="positive"
        />
        <Meter label="Consumo de custos previstos" value={a.consumed} tone="alert" />
      </div>
      {(a.costAhead || a.receiptsBehind || s.overdue > 0 || !s.result.estimateConfirmed) && (
        <div className="space-y-2">
          {a.costAhead && <Notice>Atenção: consumo de custos acima do avanço físico.</Notice>}
          {a.receiptsBehind && (
            <Notice>Atenção financeira: recebimentos abaixo do avanço físico.</Notice>
          )}
          {s.overdue > 0 && (
            <Notice tone="negative">
              Recebimentos vencidos: <Money value={s.overdue} className="font-semibold" />
            </Notice>
          )}
          {!s.result.estimateConfirmed && <Notice>Estimativa para concluir não conferida.</Notice>}
        </div>
      )}
    </>
  );
}
const labels: [WorkIndicator, string][] = [
  ["contract", "Contrato original"],
  ["extras", "Aditivos aprovados"],
  ["updated", "Valor atualizado da obra"],
  ["received", "Recebido"],
  ["receivable", "A receber"],
  ["spent", "Despesas pagas"],
  ["payable", "Contas a pagar"],
  ["cash", "Caixa atual da obra"],
  ["current", "Resultado atual · econômico"],
  ["forecast", "Resultado previsto"],
];
/** Ícone e cor de significado de cada indicador da obra. */
const look: Record<WorkIndicator, { icon: LucideIcon; tone?: Tone; filled?: boolean }> = {
  contract: { icon: FileSignature, tone: "positive" },
  extras: { icon: FilePlus2, tone: "extra" },
  updated: { icon: HardHat, tone: "positive" },
  received: { icon: ArrowUp, tone: "positive" },
  receivable: { icon: CalendarClock, tone: "positive", filled: true },
  spent: { icon: ArrowDown, tone: "negative" },
  payable: { icon: Receipt, tone: "negative", filled: true },
  cash: { icon: Wallet },
  current: { icon: Scale },
  forecast: { icon: TrendingUp },
};
const signTone = (value: number | null): Tone =>
  value === null ? "neutral" : value < 0 ? "negative" : "positive";
export function WorkSummaryPanel({ workId }: { workId: string }) {
  const { data, error } = useQuery(dashboardOptions);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<WorkIndicator | null>(null);
  const { data: operational } = useQuery(workOptions(workId));
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const s = data?.works.find((w) => w.work.id === workId);
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  if (!s || !data) return <PageSkeleton />;
  const planned = splitPayments(s.balance.receivable, s.budget.terms).rows.map((r) => ({
    amount: r.value,
    due_date: "",
  }));
  const groups =
    data?.finance.entries.filter(
      (e) => e.work_id === workId && e.direction === "entrada" && !e.canceled,
    ) ?? [];
  async function generate(d: FormData) {
    if (!s) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("create_financial_installments", {
        _request_id: requestId,
        _work_id: workId,
        _source: "contract",
        _description: "Contrato · " + s.work.name,
        _direction: "entrada",
        _category: "Contrato",
        _person_id: s.work.client_id ?? "00000000-0000-0000-0000-000000000000",
        _total: s.balance.receivable,
        _rows: JSON.parse(String(d.get("installments"))),
        _incurred: false,
        _payment_method: "",
        _notes: s.work.payment_conditions || "Condições do orçamento aprovado",
        _cost_center: "",
        _file_path: "",
      });
      if (r.error) throw r.error;
      await qc.invalidateQueries();
      setOpen(false);
      toast.success("Parcelas do contrato geradas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const compositions = workComposition(data, s);
  const detailRows = detail ? compositions[detail] : [];
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Visão geral</h2>
          <p className="text-sm text-muted-foreground">
            {s.client} · {fmtDate(s.work.actual_start || s.work.planned_start)} →{" "}
            {fmtDate(s.work.planned_end)}
          </p>
        </div>
        <ContractInstallmentsButton
          workId={workId}
          fallback={
            groups.length === 0 && s.balance.receivable > 0 ? (
              <Button type="button" onClick={() => setOpen(true)}>
                Gerar parcelas do contrato
              </Button>
            ) : null
          }
        />
      </div>
      {operational && (
        <WorkSituation
          work={s.work}
          stages={operational.stages}
          records={operational.records}
          client={s.client}
          progress={s.progress}
        />
      )}
      <SummaryNumbers s={s} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {labels.map(([key, label]) => {
          const value = indicatorTotal(compositions[key]);
          const { icon, tone, filled } = look[key];
          return (
            <KpiCard
              key={key}
              label={label}
              icon={icon}
              tone={tone ?? signTone(value)}
              filled={filled && value !== null}
              ariaLabel={`Detalhar ${label}`}
              onClick={() => setDetail(key)}
              value={value === null ? notChecked : <Money value={value} />}
            />
          );
        })}
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{labels.find(([key]) => key === detail)?.[1]}</DialogTitle>
          </DialogHeader>
          <p className="text-2xl font-bold tracking-tight">
            {indicatorTotal(detailRows) === null ? (
              "Não conferido"
            ) : (
              <Money value={indicatorTotal(detailRows) ?? 0} tone="auto" />
            )}
          </p>
          <CompositionTable
            rows={detailRows}
            indicator={
              (["extras", "received", "receivable", "spent", "payable", "cash"].includes(
                detail || "",
              )
                ? detail
                : "result") as Indicator
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferir parcelas do contrato</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              generate(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <p className="text-sm">Contrato: {fmtBRL(s.base.saleNet)}</p>
            <Installments total={s.balance.receivable} initial={planned} />
            <Button type="submit" disabled={busy}>
              {busy ? "Gerando…" : "Confirmar parcelas"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
