import { RecordDeleteButton, DeletedRecordNotice } from "@/components/management/record-deletion";
import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ArrowDown,
  Copy,
  FileDown,
  FileSignature,
  FileSpreadsheet,
  GitBranch,
  Lock,
  PencilLine,
  Percent,
  TrendingUp,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { NoAccess, PageBand } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { budgetApi, budgetFamilyOptions } from "@/lib/budget-api";
import { budgetKey, loadBudget } from "@/lib/budget-data";
import { computeBudget } from "@/lib/pricing";
import { STATUS_LABEL, approvedVersion, isLockedStatus, openRevision } from "@/lib/budget-status";
import { Approval } from "@/components/works/approval";
import { Attachment } from "@/components/works/fields";
import { ItemsEditor } from "@/components/budgets/items-editor";
import { DadosEditor } from "@/components/budgets/budget-details";
import { MaterialsSummary } from "@/components/budgets/materials-summary";
import { PricingPanel } from "@/components/budgets/pricing-panel";
import { ScheduleEditor } from "@/components/budgets/schedule-editor";
import { ProposalPreviewButton } from "@/components/budgets/proposal-preview";
import { buildProposal, contractIssues, proposalIssues } from "@/lib/proposal";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { BUDGET_STATUS_VARIANT } from "@/lib/status-badges";
import { KpiCard, Money, Notice } from "@/components/kpi";
import { fmtPct } from "@/lib/format";
import { apiConfigured } from "@/lib/api-client";
import {
  budgetFingerprint,
  budgetVersionsOptions,
  hasUnsavedChanges,
  saveBudgetVersion,
} from "@/lib/budget-versions";
import { BudgetVersions } from "@/components/budgets/budget-versions";
import { RefuseBudget } from "@/components/budgets/refuse-budget";

export const Route = createFileRoute("/_authenticated/orcamentos/$id/")({
  head: () => pageMeta("Orçamento", "Serviços, condições e aprovação da proposta JMG."),
  component: Editor,
});

function Editor() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: budgetKey(id),
    queryFn: () => loadBudget(id),
    enabled: !!me?.canSeeCosts,
  });
  const { data: family = [] } = useQuery({
    ...budgetFamilyOptions(data?.budget.number ?? 0),
    enabled: !!data,
  });
  const { data: creator } = useQuery({
    queryKey: ["profile-name", data?.budget.created_by],
    enabled: !!data?.budget.created_by,
    queryFn: async () =>
      (
        await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data!.budget.created_by!)
          .maybeSingle()
      ).data?.full_name ?? null,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: budgetKey(id) });
    qc.invalidateQueries({ queryKey: ["budget-family"] });
  };

  const result = useMemo(
    () => (data ? computeBudget(data.items, data.params, data.budget.general_discount) : null),
    [data],
  );

  // Pendências do PDF calculadas com o mesmo módulo que a API usa para gerar o documento.
  const proposal = useMemo(
    () =>
      data
        ? buildProposal({
            budget: { ...data.budget, params: data.params, payment_terms: data.terms },
            sections: data.sections,
            items: data.items,
            client: null,
            today: new Date().toISOString().slice(0, 10),
          })
        : null,
    [data],
  );

  // Versões salvas: cada "Salvar versão" guarda o PDF; a aprovação marca a última.
  const { data: versions = [] } = useQuery(budgetVersionsOptions(id));
  const fingerprint = useMemo(
    () =>
      data
        ? budgetFingerprint({
            budget: { ...data.budget, params: data.params, payment_terms: data.terms },
            sections: data.sections,
            items: data.items,
          })
        : "",
    [data],
  );
  const saveVersion = useMutation({
    mutationFn: () => saveBudgetVersion(id, result?.saleNet ?? 0, fingerprint),
    onSuccess: (v) => {
      toast.success(`Versão ${v.version} salva com o PDF.`);
      qc.invalidateQueries({ queryKey: ["budget-versions", id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  async function saveIfChanged() {
    if (!apiConfigured || !hasUnsavedChanges(versions, fingerprint)) return;
    await saveBudgetVersion(id, result?.saleNet ?? 0, fingerprint);
    await qc.invalidateQueries({ queryKey: ["budget-versions", id] });
  }

  const updBudget = useMutation({
    mutationFn: (p: Record<string, unknown>) => budgetApi.update(id, p),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  const copy = useMutation({
    mutationFn: (asRevision: boolean) => budgetApi.copy(id, asRevision),
    onSuccess: (nid, asRev) => {
      toast.success(
        asRev
          ? "Revisão aberta para edição. Ao aprovar, ela substitui a versão atual."
          : "Proposta duplicada.",
      );
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["budget-family"] });
      navigate({ to: "/orcamentos/$id", params: { id: nid } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (me && !me.canSeeCosts) return <NoAccess />;
  if (!data || !result || !proposal) return <PageSkeleton cards={3} />;
  const { budget } = data;
  if (budget.deleted_at)
    return <DeletedRecordNotice entity="budgets" id={id} name={`Orçamento nº ${budget.number}`} />;
  const locked = isLockedStatus(budget.status);
  const revisionOf = (bid: string | null | undefined) => {
    const v = family.find((f) => f.id === bid);
    return v ? `Rev. ${v.revision}` : "nova versão";
  };
  const replaces = budget.status === "aprovado" ? null : approvedVersion(family, id);

  function reopen() {
    const open = openRevision(family, id);
    if (!open) return copy.mutate(true);
    toast.info(`A Rev. ${open.revision} já está aberta para edição.`);
    navigate({ to: "/orcamentos/$id", params: { id: open.id } });
  }

  async function setStatus(status: string, refusalReason?: string) {
    if (!result) return;
    await updBudget.mutateAsync(
      refusalReason ? { status, refusal_reason: refusalReason } : { status },
    );
    // Falha no histórico não desfaz a mudança de situação, mas precisa aparecer.
    await budgetApi
      .logHistory({ budget_id: id, action: `status:${status}`, summary: { total: result.saleNet } })
      .catch((error: Error) => toast.error(`Histórico não registrado: ${error.message}`));
    toast.success(`Situação: ${STATUS_LABEL[status]}`);
  }

  return (
    <div>
      <PageBand className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/orcamentos" className="text-sm text-muted-foreground hover:underline">
            ← Orçamentos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-[28px]">
            Orçamento nº {budget.number}
            {budget.revision ? ` · Rev. ${budget.revision}` : ""}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={BUDGET_STATUS_VARIANT[budget.status] ?? "neutral"}>
              {STATUS_LABEL[budget.status]}
            </Badge>
            <span className="font-medium text-foreground">{budget.client_display}</span>
            {locked && (
              <span className="flex items-center gap-1 text-xs">
                <Lock className="h-3.5 w-3.5" />
                {budget.status === "aprovado"
                  ? "Bloqueado — para mudar, use Reabrir para edição"
                  : "Bloqueado"}
              </span>
            )}
          </div>
          {budget.status === "substituido" && budget.superseded_by && (
            <p className="mt-3 rounded-xl bg-neutral-soft px-3 py-2 text-sm">
              Substituído pela{" "}
              <Link
                to="/orcamentos/$id"
                params={{ id: budget.superseded_by }}
                className="font-medium text-primary hover:underline"
              >
                {revisionOf(budget.superseded_by)}
              </Link>
              , que é a versão em vigor.
            </p>
          )}
          {replaces && !locked && (
            <p className="mt-3 max-w-2xl rounded-xl bg-primary-soft px-3 py-2 text-sm text-foreground/80">
              Ao aprovar, esta revisão substitui a{" "}
              <Link
                to="/orcamentos/$id"
                params={{ id: replaces.id }}
                className="font-medium text-primary hover:underline"
              >
                Rev. {replaces.revision}
              </Link>{" "}
              aprovada, e a obra ligada passa a usar esta versão. Com contrato já assinado, a
              mudança deve ser feita como aditivo na obra.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copy.mutate(false)}>
            <Copy className="h-4 w-4" /> Duplicar
          </Button>
          {budget.status === "aprovado" ? (
            <Button variant="outline" onClick={reopen} disabled={copy.isPending}>
              <PencilLine className="h-4 w-4" /> Reabrir para edição
            </Button>
          ) : (
            budget.status !== "substituido" && (
              <Button variant="outline" onClick={() => copy.mutate(true)}>
                <GitBranch className="h-4 w-4" /> Nova revisão
              </Button>
            )
          )}
          {budget.status === "aprovado" &&
            (contractIssues(proposal).length ? (
              <Button variant="outline" disabled title={contractIssues(proposal).join(" ")}>
                <FileSignature className="h-4 w-4" /> Gerar contrato
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/orcamentos/$id/pdf" params={{ id }} search={{ doc: "contrato" }}>
                  <FileSignature className="h-4 w-4" /> Gerar contrato
                </Link>
              </Button>
            ))}
          <ProposalPreviewButton budgetId={id} />
          {proposalIssues(proposal).length ? (
            <Button variant="outline" disabled title={proposalIssues(proposal).join(" ")}>
              <FileDown className="h-4 w-4" /> Gerar PDF
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/orcamentos/$id/pdf" params={{ id }}>
                <FileDown className="h-4 w-4" /> Gerar PDF
              </Link>
            </Button>
          )}
          {!locked && apiConfigured && (
            <Button
              disabled={
                saveVersion.isPending ||
                proposalIssues(proposal).length > 0 ||
                !hasUnsavedChanges(versions, fingerprint)
              }
              title={
                proposalIssues(proposal).length
                  ? proposalIssues(proposal).join(" ")
                  : !hasUnsavedChanges(versions, fingerprint)
                    ? "Nenhuma alteração desde a última versão."
                    : "Guarda o PDF desta versão do orçamento."
              }
              onClick={() => saveVersion.mutate()}
            >
              <Save className="h-4 w-4" />
              {saveVersion.isPending ? "Salvando…" : "Salvar versão"}
            </Button>
          )}
        </div>
      </PageBand>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <KpiCard
          hero
          label="Valor de venda"
          icon={FileSpreadsheet}
          value={<Money value={result.saleNet} />}
          hint="Total ao cliente"
          className="col-span-2 xl:col-span-1"
        />
        <KpiCard
          label="Custo total"
          icon={ArrowDown}
          tone="negative"
          value={<Money value={result.totalCost} />}
          hint="Mão de obra e materiais"
        />
        <KpiCard
          label="Resultado estimado"
          icon={TrendingUp}
          tone={result.result < 0 ? "negative" : "brand"}
          value={<Money value={result.result} />}
        />
        <KpiCard
          label="Margem sobre a venda"
          icon={Percent}
          tone={result.belowMin ? "negative" : result.belowDesired ? "alert" : "positive"}
          value={<span className="num">{fmtPct(result.margin)}</span>}
          hint={result.belowMin ? "Abaixo da margem mínima" : "Não aparece para o cliente"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <BudgetVersions budgetId={id} fingerprint={fingerprint} locked={locked} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {budget.status === "elaboracao" && (
          <Button size="sm" variant="soft" onClick={() => setStatus("enviado")}>
            Marcar como enviado
          </Button>
        )}
        {budget.status === "enviado" && (
          <>
            <Button size="sm" variant="outline" onClick={() => setStatus("elaboracao")}>
              Voltar para elaboração
            </Button>
            <RefuseBudget onRefuse={(reason) => setStatus("recusado", reason)} />
          </>
        )}
        {budget.status === "recusado" && budget.refusal_reason && (
          <span className="text-sm text-muted-foreground">
            Motivo da recusa: <b className="text-foreground">{budget.refusal_reason}</b>
          </span>
        )}
        <Approval
          budgetId={id}
          status={budget.status}
          onChange={refresh}
          beforeApprove={saveIfChanged}
        />
        <Attachment path={budget.approval_path} />
        {!budget.archived ? (
          <Button size="sm" variant="ghost" onClick={() => updBudget.mutate({ archived: true })}>
            Arquivar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => updBudget.mutate({ archived: false })}>
            Desarquivar
          </Button>
        )}
        <span className="ml-auto">
          <RecordDeleteButton
            entity="budgets"
            id={id}
            name={`Orçamento nº ${budget.number}`}
            onDeleted={() => void navigate({ to: "/orcamentos" })}
          />
        </span>
      </div>

      {proposalIssues(proposal).length > 0 && (
        <Notice className="mb-6">Para gerar o PDF: {proposalIssues(proposal).join(" ")}</Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Tabs defaultValue="itens" className="min-w-0">
          <TabsList>
            <TabsTrigger value="itens">Serviços</TabsTrigger>
            <TabsTrigger value="dados">Dados e condições</TabsTrigger>
            <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
            <TabsTrigger value="materiais">Materiais</TabsTrigger>
          </TabsList>
          <TabsContent value="itens">
            <ItemsEditor
              budgetId={id}
              sections={data.sections}
              items={data.items}
              result={result}
              locked={locked}
              params={data.params}
              onChange={refresh}
            />
          </TabsContent>
          <TabsContent value="dados">
            <DadosEditor
              budget={budget}
              terms={data.terms}
              total={proposal.totals.total}
              scheduleWeeks={proposal.scheduleWeeks.length}
              creatorName={creator ?? ""}
              locked={locked}
              onSave={(p) => updBudget.mutateAsync(p).then(() => toast.success("Salvo."))}
            />
          </TabsContent>
          <TabsContent value="cronograma">
            <ScheduleEditor
              sections={data.sections}
              locked={locked}
              onChange={refresh}
              budget={budget}
              client={proposal?.client.name ?? budget.client_display ?? null}
              address={proposal?.site.full || null}
              onStartDate={(start_date) =>
                updBudget.mutateAsync({ start_date }).then(() => toast.success("Início salvo."))
              }
            />
          </TabsContent>
          <TabsContent value="materiais">
            <MaterialsSummary items={data.items} />
          </TabsContent>
        </Tabs>
        <PricingPanel
          budgetId={id}
          params={data.params}
          discount={budget.general_discount}
          items={data.items}
          sections={data.sections}
          result={result}
          locked={locked}
          onApplied={refresh}
        />
      </div>
    </div>
  );
}

/* ---------------- Itens ---------------- */
