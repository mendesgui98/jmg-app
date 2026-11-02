import { useRecordFocus } from "@/hooks/use-record-focus";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadWorkBudget, workBase } from "@/lib/work-budget";
import { computeBudget, computeWorkResult } from "@/lib/pricing";
import { fmtBRL, fmtPct, fmtDate } from "@/lib/format";
import { AlertTriangle, FilePlus2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconBubble, KpiCard, Money, type Tone } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Field, Memo, Attachment } from "./fields";
import { text, number } from "@/lib/form-values";
import { uploadDocument } from "@/lib/work-data";
import { dashboardOptions } from "@/lib/dashboard-data";
import { financeOptions } from "@/lib/finance-data";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
export function WorkResult({ workId, budgetId }: { workId: string; budgetId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingEstimate, setSavingEstimate] = useState(false);
  const { data: f } = useQuery(financeOptions);
  const { data: dash } = useQuery(dashboardOptions);
  const { data, error } = useQuery({
    queryKey: ["work-result", workId],
    queryFn: async () => {
      const [b, x, o, e] = await Promise.all([
        loadWorkBudget(workId),
        supabase.from("work_extras").select("*").eq("work_id", workId),
        supabase.from("purchase_orders").select("*,purchase_lines(*)").eq("work_id", workId),
        supabase.from("work_estimates").select("*").eq("work_id", workId).maybeSingle(),
      ]);
      if (x.error) throw x.error;
      if (o.error) throw o.error;
      if (e.error) throw e.error;
      return { budget: b, extras: x.data, orders: o.data, estimate: e.data };
    },
  });
  const selectedRecord = useRecordFocus(data);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["work-result", workId] });
    qc.invalidateQueries({ queryKey: ["financial-dashboard"] });
  };
  async function extra(d: FormData) {
    setBusy(true);
    try {
      const file = d.get("proof");
      const path = file instanceof File && file.size ? await uploadDocument(file, "extras") : null;
      const r = await supabase.from("work_extras").insert({
        work_id: workId,
        description: text(d, "description"),
        cost: number(d, "cost"),
        price: number(d, "price"),
        extra_days: number(d, "days"),
        approved: d.get("approved") === "on",
        approval_date: text(d, "date") || null,
        file_path: path,
      });
      if (r.error) throw r.error;
      setOpen(false);
      refresh();
      toast.success("Extra registrado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function estimate(d: FormData) {
    // Campo vazio não é "falta R$ 0": sem valor, a estimativa não é conferida.
    if (!text(d, "amount").trim()) {
      toast.error("Informe quanto ainda falta gastar para concluir (digite 0 se não falta nada).");
      return;
    }
    if (savingEstimate) return;
    setSavingEstimate(true);
    const r = await supabase
      .from("work_estimates")
      .upsert({ work_id: workId, additional_cost: number(d, "amount"), notes: text(d, "notes") });
    setSavingEstimate(false);
    if (r.error) toast.error(r.error.message);
    else {
      refresh();
      toast.success("Estimativa salva.");
    }
  }
  if (error) return <p className="text-destructive">{error.message}</p>;
  if (!data || !f) return <PageSkeleton cards={3} />;
  const b = workBase(data.budget);
  const entries = f.entries.filter(
    (e) =>
      !e.canceled &&
      e.direction === "saida" &&
      !e.purchase_order_id &&
      !e.payable_order_id &&
      (e.work_id === workId ||
        f.allocations.some((a) => a.entry_id === e.id && a.work_id === workId)),
  );
  const amount = (e: (typeof entries)[number]) =>
    e.work_id === workId
      ? e.amount
      : f.allocations
          .filter((a) => a.entry_id === e.id && a.work_id === workId)
          .reduce((s, a) => s + a.amount, 0);
  const normal = entries.filter((e) => !["Comissão da arquiteta", "Tributos"].includes(e.category));
  const orders = data.orders
    .filter((o) => o.status !== "cancelado")
    .flatMap((o) => o.purchase_lines);
  const incurred =
    normal.filter((e) => e.incurred).reduce((s, e) => s + amount(e), 0) +
    orders.reduce((s, l) => s + l.received * l.unit_price, 0);
  const committed =
    normal.filter((e) => !e.incurred).reduce((s, e) => s + amount(e), 0) +
    orders.reduce((s, l) => s + (l.quantity - l.received) * l.unit_price, 0);
  const fallback = computeWorkResult(
    b,
    data.extras.filter((e) => e.approved),
    incurred,
    committed,
    data.estimate?.additional_cost ?? null,
    entries
      .filter((e) => e.category === "Comissão da arquiteta")
      .reduce((s, e) => s + amount(e), 0),
    entries.filter((e) => e.category === "Tributos").reduce((s, e) => s + amount(e), 0),
  );
  const summary = dash?.works.find((s) => s.work.id === workId);
  const r = summary?.result ?? fallback;
  const notChecked = (l: string) =>
    !budgetId &&
    ((!r.estimateConfirmed &&
      ["Resultado projetado", "Custo total projetado", "Estimativa adicional"].includes(l)) ||
      ["Resultado esperado", "Custo previsto original", "Negociação", "Proposta original"].includes(
        l,
      ));
  const sign = (v: number): Tone => (v < 0 ? "negative" : "positive");
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Resultado e aditivos</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar extra
        </Button>
      </div>
      {!r.estimateConfirmed && (
        <p className="flex items-start gap-2 rounded-xl bg-alert-soft p-3 text-sm text-alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Estimativa para concluir ainda não conferida. O saldo do custo previsto original foi
            preservado na projeção.
          </span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {(
          [
            ["Proposta original", b.listTotal, "neutral"],
            ["Valor fechado", b.saleNet, "positive"],
            ["Negociação", b.totalDiscount, "neutral"],
            ["Aditivos aprovados", r.extraValue, "extra"],
            ["Contrato atualizado", r.sale, "positive"],
            ["Custo previsto original", b.totalCost, "negative"],
            ["Custo realizado", summary?.incurred ?? incurred, "negative"],
            ["Compromissos não realizados", summary?.committed ?? committed, "negative"],
            ["Estimativa adicional", r.remainingEstimate, "negative"],
            ["Comissão da arquiteta", r.commission, "negative"],
            ["Tributos / despesas configuradas", r.taxes, "negative"],
            ["Custo total projetado", r.cost, "negative"],
            ["Resultado esperado", b.result, sign(b.result)],
            ["Resultado projetado", r.result, sign(r.result)],
          ] as [string, number, Tone][]
        ).map(([l, v, tone]) => (
          <KpiCard
            key={l}
            label={l}
            tone={notChecked(l) ? "neutral" : tone}
            value={
              notChecked(l) ? (
                <span className="text-base font-semibold text-muted-foreground">Não conferido</span>
              ) : (
                <Money value={Number(v)} />
              )
            }
          />
        ))}
        <KpiCard
          label="Margem projetada (sobre a venda)"
          tone={!budgetId && !r.estimateConfirmed ? "neutral" : sign(r.result)}
          value={
            !budgetId && !r.estimateConfirmed ? (
              <span className="text-base font-semibold text-muted-foreground">Não conferido</span>
            ) : (
              <span className="num">{fmtPct(r.margin)}</span>
            )
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Custo projetado = realizado + compromissos não realizados + estimativa adicional + comissão
        + tributos. Resultado = contrato atualizado − custo projetado. Baixas afetam o caixa, não
        repetem o custo.
      </p>
      <form
        className={cn(panelClass, "flex flex-wrap items-end gap-3 p-4 sm:p-5")}
        onSubmit={(e) => {
          e.preventDefault();
          estimate(new FormData(e.currentTarget));
        }}
      >
        <Field
          key={data.estimate?.additional_cost}
          name="amount"
          label="Estimativa adicional para concluir (R$)"
          type="number"
          value={data.estimate?.additional_cost}
        />
        <Field
          name="notes"
          label="Itens ainda não contemplados nos compromissos"
          value={data.estimate?.notes}
        />
        <Button type="submit" variant="outline" disabled={savingEstimate}>
          Salvar estimativa
        </Button>
      </form>
      {data.extras.length > 0 && (
        <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
          {data.extras.map((x) => (
            <article
              key={x.id}
              id={`record-${x.id}`}
              className={cn(
                "flex scroll-mt-6 flex-wrap items-start gap-3 px-4 py-4 sm:px-5",
                selectedRecord === x.id &&
                  "bg-accent/40 shadow-[inset_4px_0_0_var(--color-primary)]",
              )}
            >
              <IconBubble icon={FilePlus2} tone="extra" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold leading-snug">{x.description}</h3>
                  <Badge variant={x.approved ? "positive" : "alert"}>
                    {x.approved ? "Aprovado" : "Aguardando aprovação"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {x.approved && `Aprovado em ${fmtDate(x.approval_date)} · `}prazo +{x.extra_days}{" "}
                  dias · custo {fmtBRL(x.cost)}
                </p>
              </div>
              <Money value={x.price} tone="extra" className="shrink-0 font-semibold" />
              <Attachment path={x.file_path} />
            </article>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extra / aditivo</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              extra(new FormData(e.currentTarget));
            }}
          >
            <Field name="description" label="Descrição do serviço / mudança" required />
            <div className="grid grid-cols-2 gap-3">
              <Field name="cost" label="Custo previsto (R$)" type="number" />
              <Field name="price" label="Preço negociado (R$)" type="number" />
            </div>
            <Field name="days" label="Impacto no prazo (dias)" type="number" />
            <label className="flex gap-2 text-sm">
              <input name="approved" type="checkbox" />
              Aprovado pelo cliente
            </label>
            <Field name="date" label="Data da aprovação" type="date" />
            <Field name="proof" label="Comprovante da aprovação" type="file" />
            <Button type="submit" disabled={busy}>
              Salvar extra
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
