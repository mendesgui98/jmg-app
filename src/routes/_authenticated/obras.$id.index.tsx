import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Camera,
  CalendarRange,
  ChevronLeft,
  FileDown,
  FileSignature,
  FileText,
  FilePlus2,
  FolderOpen,
  Gavel,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Layers,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { IconBubble } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { workOptions } from "@/lib/work-data";
import { pageMeta } from "@/lib/page-meta";
import { useMe } from "@/hooks/use-me";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkWarranty } from "@/components/warranty/work-warranty";
import { WorkChecklist } from "@/components/works/checklist";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Field, Memo, selectClass } from "@/components/works/fields";
import { DeletedRecordNotice, RecordDeleteButton } from "@/components/management/record-deletion";
import { text } from "@/lib/form-values";
import { Schedule } from "@/components/works/schedule";
import { Records } from "@/components/works/records";
import { Contract } from "@/components/works/contract";
import { Purchases } from "@/components/works/purchases";
import { Finance } from "@/components/works/finance";
import { WorkSummaryPanel } from "@/components/works/summary";
import { BudgetVsActual } from "@/components/works/budget-vs-actual";
import { StagePhotos } from "@/components/works/photos";
import { WorkSituation } from "@/components/works/situation";
import { WorkResult } from "@/components/works/result";
import { WORK_STATUS_LABEL, workStatusLabel } from "@/lib/work-status";
/** Abas da obra, na ordem da barra; `costs` = só admin/financeiro. */
const WORK_TABS: { value: string; label: string; icon: LucideIcon; costs?: boolean }[] = [
  { value: "resumo", label: "Visão geral", icon: LayoutDashboard },
  { value: "etapas", label: "Etapas", icon: Layers },
  { value: "checklist", label: "Checklist", icon: ListChecks },
  { value: "financeiro", label: "Financeiro", icon: Wallet, costs: true },
  { value: "cronograma", label: "Cronograma", icon: CalendarRange },
  { value: "compras", label: "Compras", icon: ShoppingCart, costs: true },
  { value: "resultado", label: "Aditivos", icon: FilePlus2, costs: true },
  { value: "fotos", label: "Fotos", icon: Camera },
  { value: "relatorios", label: "Relatórios", icon: FileText },
  { value: "documento", label: "Documentos", icon: FolderOpen },
  { value: "contrato", label: "Contrato", icon: FileSignature, costs: true },
  { value: "diario", label: "Diário", icon: BookOpen },
  { value: "entrega", label: "Entrega", icon: KeyRound },
  { value: "garantia", label: "Garantia", icon: ShieldCheck },
  { value: "decisao", label: "Decisões", icon: Gavel },
];

export const Route = createFileRoute("/_authenticated/obras/$id/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: string; record?: string; entry?: string } => ({
    // A antiga aba Assistência virou a aba Garantia.
    tab:
      s["tab"] === "assistencia" ? "garantia" : typeof s["tab"] === "string" ? s["tab"] : "resumo",
    record: typeof s["record"] === "string" ? s["record"] : "",
    entry: typeof s["entry"] === "string" ? s["entry"] : "",
  }),
  head: () =>
    pageMeta(
      "Gestão da obra",
      "Cronograma, diário, contrato, compras e acompanhamento da obra JMG.",
    ),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(workOptions(params.id)),
  component: Work,
});
function Work() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(workOptions(id));
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const w = data.work;
  const { data: people = [] } = useQuery({
    queryKey: ["people", "work-edit"],
    enabled: !!me?.canSeeCosts,
    queryFn: async () => {
      const r = await supabase
        .from("people")
        .select("id,name,kind,deleted_at")
        .in("kind", ["cliente", "arquiteto"])
        .order("name");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.invalidateQueries({ queryKey: ["schedule"] });
    qc.invalidateQueries({ queryKey: ["financial-dashboard"] });
    qc.invalidateQueries({ queryKey: ["work", id] });
    qc.invalidateQueries({ queryKey: ["works"] });
    qc.invalidateQueries({ queryKey: ["all-work-stages"] });
    qc.invalidateQueries({ queryKey: ["schedule-versions", id] });
  };
  async function save(d: FormData) {
    setBusy(true);
    try {
      const r = await supabase
        .from("work_registry")
        .update({
          name: text(d, "name"),
          client_id: text(d, "client_id") || null,
          architect_id: text(d, "architect_id") || null,
          work_type: text(d, "work_type") || null,
          payment_conditions: text(d, "payment_conditions") || null,
          notes: text(d, "notes") || null,
          responsible: text(d, "responsible"),
          address: text(d, "address"),
          planned_start: text(d, "start") || null,
          planned_end: text(d, "end") || null,
          actual_start: text(d, "actual_start") || null,
          actual_end: text(d, "actual_end") || null,
          status: text(d, "status"),
        })
        .eq("id", id);
      if (r.error) throw r.error;
      setOpen(false);
      refresh();
      toast.success("Obra atualizada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (w.deleted_at) return <DeletedRecordNotice entity="work_registry" id={id} name={w.name} />;
  // Mantém o cliente/arquiteto atual na lista mesmo se estiver na lixeira, para não
  // apagar o vínculo ao salvar outros campos.
  const options = (kind: string, current: string | null) =>
    people.filter((p) => (p.kind === kind && !p.deleted_at) || p.id === current);
  return (
    <div>
      <Link
        to="/obras"
        className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Obras
      </Link>
      <PageHeader
        title={w.name}
        subtitle={`${w.origin === "direto" ? "Cadastro direto" : "Do orçamento"} · ${workStatusLabel(w.status)} · ${w.address || "Endereço não informado"}`}
        actions={
          <>
            {w.linked_budget_id && me?.canSeeCosts && (
              <Button variant="outline" asChild>
                <Link to="/orcamentos/$id" params={{ id: w.linked_budget_id }}>
                  Orçamento original
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/obras/$id/relatorio/pdf" params={{ id }}>
                <FileDown className="h-4 w-4" />
                Relatório
              </Link>
            </Button>
            {me?.canSeeCosts && (
              <Button variant="outline" onClick={() => setOpen(true)}>
                <Settings className="h-4 w-4" />
                Editar obra
              </Button>
            )}
            <RecordDeleteButton
              entity="work_registry"
              id={id}
              name={w.name}
              onDeleted={() => void navigate({ to: "/obras" })}
            />
          </>
        }
      />
      <Tabs
        value={search.tab || "resumo"}
        onValueChange={(tab) =>
          navigate({ to: "/obras/$id", params: { id }, search: (old) => ({ ...old, tab }) })
        }
      >
        <TabsList
          aria-label="Seções da obra"
          className="mb-5 grid h-auto w-full grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-1.5 overflow-visible rounded-2xl border border-border/70 bg-card p-2 shadow-sm"
        >
          {WORK_TABS.filter((t) => !t.costs || me?.canSeeCosts).map(
            ({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-auto min-h-14 flex-col gap-1 whitespace-normal rounded-xl border border-border/60 bg-background px-2 py-2 text-center text-xs leading-tight text-muted-foreground hover:border-primary/40 hover:bg-accent/60 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md sm:text-[13px]"
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {label}
              </TabsTrigger>
            ),
          )}
        </TabsList>
        <TabsContent value="resumo">
          {me?.canSeeCosts ? (
            <>
              <WorkSummaryPanel workId={id} />
              <BudgetVsActual workId={id} stages={data.stages} />
            </>
          ) : (
            <WorkSituation work={w} stages={data.stages} records={data.records} />
          )}
        </TabsContent>
        <TabsContent value="etapas">
          <Schedule workId={id} stages={data.stages} records={data.records} onChange={refresh} />
        </TabsContent>
        <TabsContent value="checklist">
          <WorkChecklist workId={id} stages={data.stages} />
        </TabsContent>
        <TabsContent value="fotos">
          <StagePhotos records={data.records} stages={data.stages} />
        </TabsContent>
        <TabsContent value="relatorios">
          <div className={cn(panelClass, "flex flex-wrap items-center gap-3 p-4 sm:p-5")}>
            <IconBubble icon={FileDown} tone="brand" />
            <h2 className="min-w-0 flex-1 text-base font-semibold">Relatórios de avanço</h2>
            <Button asChild variant="outline">
              <Link to="/obras/$id/relatorio/pdf" params={{ id }}>
                <FileDown className="h-4 w-4" />
                Relatório de evolução
              </Link>
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="cronograma">
          <Schedule
            workId={id}
            stages={data.stages}
            records={data.records}
            onChange={refresh}
            mode="cronograma"
            work={w}
          />
        </TabsContent>
        <TabsContent value="garantia">
          <WorkWarranty workId={id} canSeeCosts={!!me?.canSeeCosts} focus={search.record} />
        </TabsContent>
        {["diario", "entrega", "decisao", "documento"].map((kind) => (
          <TabsContent key={kind} value={kind}>
            <Records workId={id} kind={kind} records={data.records} onChange={refresh} />
          </TabsContent>
        ))}
        {me?.canSeeCosts && (
          <>
            <TabsContent value="contrato">
              <Contract
                workId={id}
                budgetId={w.linked_budget_id}
                start={w.planned_start}
                end={w.planned_end}
                address={w.address}
              />
            </TabsContent>
            <TabsContent value="compras">
              <Purchases workId={id} budgetId={w.linked_budget_id} />
            </TabsContent>
            <TabsContent value="financeiro">
              <Finance workId={id} />
            </TabsContent>
            <TabsContent value="resultado">
              <WorkResult workId={id} budgetId={w.linked_budget_id} />
            </TabsContent>
          </>
        )}
      </Tabs>
      <Dialog open={open && people.length > 0} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar obra</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save(new FormData(e.currentTarget));
            }}
          >
            <Field name="name" label="Nome da obra" required value={w.name} capitalize />
            <Field name="responsible" label="Responsável" value={w.responsible} capitalize />
            <label className="text-sm">
              Cliente
              <select
                name="client_id"
                defaultValue={w.client_id ?? ""}
                required
                className={selectClass}
              >
                {!w.client_id && <option value="">Selecione</option>}
                {options("cliente", w.client_id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Arquiteto(a)
              <select
                name="architect_id"
                defaultValue={w.architect_id ?? ""}
                className={selectClass}
              >
                <option value="">—</option>
                {options("arquiteto", w.architect_id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Field name="work_type" label="Tipo de obra" value={w.work_type} />
            <div className="sm:col-span-2">
              <Field name="address" label="Endereço" value={w.address} capitalize />
            </div>
            <Field name="start" label="Início previsto" type="date" value={w.planned_start} />
            <Field name="end" label="Término previsto" type="date" value={w.planned_end} />
            <Field name="actual_start" label="Início real" type="date" value={w.actual_start} />
            <Field name="actual_end" label="Término real" type="date" value={w.actual_end} />
            <label className="text-sm">
              Situação
              <select name="status" defaultValue={w.status} className={selectClass}>
                <option value="contratacao">Em contratação</option>
                <option value="execucao">Em execução</option>
                <option value="pausada">Pausada</option>
                <option value="concluida">Concluída</option>
              </select>
            </label>
            <div className="sm:col-span-2">
              <Memo
                name="payment_conditions"
                label="Condições de pagamento"
                value={w.payment_conditions}
              />
            </div>
            <div className="sm:col-span-2">
              <Memo name="notes" label="Observações" value={w.notes} />
            </div>
            <Button type="submit" disabled={busy}>
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
