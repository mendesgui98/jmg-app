import { RecordDeleteButton, RecordTrash } from "@/components/management/record-deletion";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { relationshipOptions } from "@/lib/relationship-data";
import { dashboardOptions } from "@/lib/dashboard-data";
import { fmtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/works/fields";
import { ContractActions } from "@/components/management/contract-status";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CONTRACT_STATUS } from "@/lib/status-badges";
import { IconBubble, Money, type Tone } from "@/components/kpi";
import { EmptyState } from "@/components/feedback";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { FileText, Wallet } from "lucide-react";

export function ContractList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { data, error } = useQuery(relationshipOptions(true));
  const { data: dash } = useQuery(dashboardOptions);
  const rows =
    data?.contracts.filter(
      (c) =>
        !c.deleted_at &&
        (!status || c.status === status) &&
        [data.works.find((w) => w.id === c.work_id)?.name, c.code, CONTRACT_STATUS[c.status]?.label]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()),
    ) ?? [];
  // Obras com orçamento aprovado e sem contrato registrado (ex.: contrato gerado antes de o
  // registro existir): aparecem aqui para gerar o contrato, que então entra na lista.
  const pending =
    data?.works.filter(
      (w) =>
        !w.deleted_at &&
        w.linked_budget_id &&
        data.budgets.some((b) => b.id === w.linked_budget_id && b.status === "aprovado") &&
        !data.contracts.some((c) => c.work_id === w.id && !c.deleted_at) &&
        (!status || status === "aguardando_assinatura") &&
        w.name.toLowerCase().includes(q.toLowerCase()),
    ) ?? [];
  if (error) return <p className="text-destructive">{error.message}</p>;
  return (
    <section className="space-y-5">
      <div
        className={cn(
          panelClass,
          "grid gap-3 p-4 shadow-none sm:flex sm:flex-wrap sm:items-center",
        )}
      >
        <Input
          className="sm:max-w-sm"
          aria-label="Buscar contrato"
          placeholder="Buscar contrato por obra"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Status do contrato"
          className={selectClass + " sm:w-52"}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="aguardando_revisao">Aguardando revisão</option>
          <option value="aguardando_assinatura">Aguardando assinatura</option>
          <option value="assinado">Contrato assinado</option>
        </select>
        <div className="sm:ml-auto">
          <RecordTrash entity="contracts" />
        </div>
      </div>
      {pending.length > 0 && (
        <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
          <p className="px-4 py-3 text-sm font-medium sm:px-5">
            Orçamento aprovado sem contrato registrado
          </p>
          {pending.map((w) => (
            <article key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <IconBubble icon={FileText} tone="neutral" />
              <div className="min-w-0 flex-1">
                <Link
                  to="/obras/$id"
                  params={{ id: w.id }}
                  search={{ tab: "contrato" }}
                  className="font-semibold text-foreground hover:text-primary"
                >
                  {w.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {data?.people.find((p) => p.id === w.client_id)?.name || "Cliente não informado"}{" "}
                  · gere o contrato para ele entrar aqui como aguardando assinatura
                </p>
              </div>
              <Button size="sm" asChild>
                <Link
                  to="/orcamentos/$id/pdf"
                  params={{ id: w.linked_budget_id! }}
                  search={{ doc: "contrato" }}
                >
                  <FileText className="h-4 w-4" />
                  Gerar contrato
                </Link>
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
        {rows.map((c) => {
          const w = data?.works.find((w) => w.id === c.work_id);
          const s = dash?.works.find((s) => s.work.id === c.work_id);
          const tone = CONTRACT_STATUS[c.status];
          return (
            <article key={c.id} className="flex gap-3 px-4 py-4 sm:px-5">
              <IconBubble icon={FileText} tone={tone?.tone ?? "neutral"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      to="/obras/$id"
                      params={{ id: c.work_id }}
                      search={{ tab: "contrato", record: c.id }}
                      className="font-semibold leading-snug text-foreground hover:text-primary"
                    >
                      {w?.name || "Obra"}
                    </Link>
                    {c.code && (
                      <span className="text-xs font-medium text-muted-foreground">{c.code}</span>
                    )}
                    <Badge variant={tone?.variant ?? "neutral"}>{tone?.label ?? c.status}</Badge>
                  </div>
                  {s ? (
                    <Money value={s.result.sale} className="shrink-0 font-semibold" />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {w?.client_id ? (
                    <Link
                      to="/cadastros/$id"
                      params={{ id: w.client_id }}
                      className="text-primary hover:underline"
                    >
                      {data?.people.find((p) => p.id === w.client_id)?.name || "Cliente"}
                    </Link>
                  ) : (
                    "Cliente não informado"
                  )}{" "}
                  ·{" "}
                  {c.signed_date
                    ? `assinado em ${fmtDate(c.signed_date)}`
                    : `gerado em ${fmtDate(c.generated_at || c.created_at)}`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <ContractActions
                    contract={c}
                    badge={false}
                    client={
                      data?.people.find(
                        (p) => p.id === data.works.find((x) => x.id === c.work_id)?.client_id,
                      )?.name
                    }
                  />
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/obras/$id" params={{ id: c.work_id }} search={{ tab: "financeiro" }}>
                      <Wallet className="h-4 w-4" />
                      Ver financeiro da obra
                    </Link>
                  </Button>
                  <RecordDeleteButton
                    entity="contracts"
                    id={c.id}
                    name={`Contrato · ${w?.name || "Obra"}`}
                  />
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length && (
          <EmptyState
            compact
            icon={FileText}
            title="Nenhum contrato neste filtro"
            className="py-10"
          />
        )}
      </div>
    </section>
  );
}
