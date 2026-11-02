import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, Bot, CircleAlert, FileDown, Lock, Plus, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AUTO_ORIGIN_LABEL,
  OWNER_LABEL,
  autoIssues,
  issueOverdue,
  respKey,
  responsibleName,
  responsibleOptions,
  sortIssues,
  type OwnerKind,
} from "@/lib/planning";
import type { PlanningData, WorkIssue } from "@/lib/planning-data";
import { mergeSearch, type IssuesSearch } from "@/lib/planning-search";
import { fmtDate, fmtStamp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard, Segmented } from "@/components/kpi";
import { EmptyState } from "@/components/feedback";
import { selectClass } from "@/components/works/fields";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { IssueDialog, ResolveIssueDialog, type IssueDraft } from "./issue-dialog";

export function IssuesBoard({
  data,
  today,
  search,
}: {
  data: PlanningData;
  today: string;
  search: IssuesSearch;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<IssueDraft | null>(null);
  const [resolving, setResolving] = useState<WorkIssue | null>(null);
  const status = search.status ?? "abertas";
  const setSearch = (patch: { [K in keyof IssuesSearch]?: IssuesSearch[K] | undefined }) =>
    void navigate({ to: "/pendencias", search: mergeSearch(search, patch) });
  const workName = (id: string) => data.works.find((w) => w.id === id)?.name ?? "Obra";
  const taskTitle = (id: string | null) => data.tasks.find((t) => t.id === id)?.title;

  const scoped = data.issues.filter(
    (i) =>
      (!search.obra || i.work_id === search.obra) &&
      (!search.quem || i.owner_kind === search.quem) &&
      (!search.resp || respKey(i) === search.resp),
  );
  const open = scoped.filter((i) => i.status === "aberta");
  const list = sortIssues(
    status === "abertas" ? open : scoped.filter((i) => i.status === "resolvida"),
    today,
  );
  const auto = autoIssues({ today, ...data }).filter(
    (a) => !search.obra || a.work_id === search.obra,
  );
  const showAuto = status === "abertas" && (!search.quem || search.quem === "jmg") && !search.resp;

  async function reopen(i: WorkIssue) {
    const r = await supabase.from("work_issues").update({ status: "aberta" }).eq("id", i.id);
    void qc.invalidateQueries({ queryKey: ["planning"] });
    if (r.error) toast.error(r.error.message);
    else toast.success("Pendência reaberta.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Obra"
            className={cn(selectClass, "mt-0 w-auto min-w-40")}
            value={search.obra ?? ""}
            onChange={(e) => setSearch({ obra: e.target.value || undefined })}
          >
            <option value="">Todas as obras</option>
            {data.works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Quem resolve"
            className={cn(selectClass, "mt-0 w-auto min-w-40")}
            value={search.quem ?? ""}
            onChange={(e) => setSearch({ quem: e.target.value || undefined })}
          >
            <option value="">Quem resolve: todos</option>
            {(Object.keys(OWNER_LABEL) as OwnerKind[]).map((k) => (
              <option key={k} value={k}>
                {OWNER_LABEL[k]}
              </option>
            ))}
          </select>
          <select
            aria-label="Pessoa"
            className={cn(selectClass, "mt-0 w-auto min-w-40")}
            value={search.resp ?? ""}
            onChange={(e) => setSearch({ resp: e.target.value || undefined })}
          >
            <option value="">Todas as pessoas</option>
            {responsibleOptions(data.issues, data.people).map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
          <Segmented>
            {(
              [
                ["abertas", "Abertas"],
                ["resolvidas", "Resolvidas"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={status === k}
                className={segmentClass(status === k)}
                onClick={() => setSearch({ status: k === "abertas" ? undefined : k })}
              >
                {label}
              </button>
            ))}
          </Segmented>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link
              to="/planejamento/pdf"
              search={{
                ...(search.obra ? { obra: search.obra } : {}),
                ...(search.resp ? { resp: search.resp } : {}),
              }}
            >
              <FileDown className="h-4 w-4" />
              PDF para a equipe
            </Link>
          </Button>
          <Button type="button" onClick={() => setDraft({ work_id: search.obra ?? "" })}>
            <Plus className="h-4 w-4" />
            Nova pendência
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Vencidas"
          icon={AlertTriangle}
          tone="negative"
          value={open.filter((i) => issueOverdue(i, today)).length}
        />
        <KpiCard
          label="Com o cliente"
          icon={UserRound}
          tone="alert"
          value={open.filter((i) => i.owner_kind === "cliente").length}
        />
        <KpiCard
          label="Travando tarefas"
          icon={Lock}
          value={open.filter((i) => i.blocks_task_id).length}
        />
        <KpiCard label="Automáticas do sistema" icon={Bot} tone="brand" value={auto.length} />
      </div>

      <section className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
        {list.map((i) => {
          const overdue = issueOverdue(i, today);
          const who = responsibleName(i, data.people);
          const blocked = taskTitle(i.blocks_task_id);
          return (
            <article
              key={i.id}
              className={cn(
                "flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5",
                overdue
                  ? "shadow-[inset_4px_0_0_var(--color-negative)]"
                  : i.status === "resolvida"
                    ? "shadow-[inset_4px_0_0_var(--color-positive)]"
                    : "shadow-[inset_4px_0_0_var(--color-alert)]",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setDraft(i)}
              >
                <span className="block font-medium">{i.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{workName(i.work_id)}</span>
                  <Badge variant={i.owner_kind === "cliente" ? "alert" : "neutral"}>
                    {OWNER_LABEL[i.owner_kind as OwnerKind] ?? i.owner_kind}
                  </Badge>
                  {who && <span>{who}</span>}
                  {i.due_date && (
                    <span className={cn(overdue && "font-semibold text-negative")}>
                      {overdue ? "venceu" : "prazo"} {fmtDate(i.due_date)}
                    </span>
                  )}
                  {i.priority === "urgente" && i.status === "aberta" && (
                    <Badge variant="negative">Urgente</Badge>
                  )}
                  {blocked && i.status === "aberta" && (
                    <Badge variant="neutral">
                      <Lock className="mr-1 h-3 w-3" />
                      trava: {blocked}
                    </Badge>
                  )}
                  {i.status === "resolvida" && (
                    <span>
                      Resolvida {i.resolved_at ? fmtStamp(i.resolved_at) : ""}
                      {i.resolution ? ` · ${i.resolution}` : ""}
                    </span>
                  )}
                </span>
              </button>
              {i.status === "aberta" ? (
                <Button type="button" size="sm" onClick={() => setResolving(i)}>
                  Resolver
                </Button>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => void reopen(i)}>
                  Reabrir
                </Button>
              )}
            </article>
          );
        })}
        {showAuto &&
          auto.map((a) => (
            <article
              key={a.key}
              className="flex flex-wrap items-center gap-3 px-4 py-3 shadow-[inset_4px_0_0_var(--color-primary)] sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <span className="block font-medium">{a.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{workName(a.work_id)}</span>
                  <Badge variant="info">automática · {AUTO_ORIGIN_LABEL[a.origin]}</Badge>
                  <span>{a.detail}</span>
                </span>
              </div>
              <Button type="button" size="sm" variant="outline" asChild>
                {a.target.kind === "obra" ? (
                  <Link to="/obras/$id" params={{ id: a.work_id }} search={{ tab: a.target.tab }}>
                    Ver origem
                  </Link>
                ) : (
                  <Link
                    to="/planejamento"
                    search={{
                      view: "dia",
                      ...(a.target.date ? { data: a.target.date } : {}),
                      obra: a.work_id,
                    }}
                  >
                    Ver origem
                  </Link>
                )}
              </Button>
            </article>
          ))}
        {!list.length && !(showAuto && auto.length) && (
          <EmptyState
            compact
            icon={CircleAlert}
            title={
              status === "abertas" ? "Nenhuma pendência aberta" : "Nenhuma pendência resolvida"
            }
            className="py-10"
          />
        )}
      </section>

      <IssueDialog draft={draft} data={data} onClose={() => setDraft(null)} />
      <ResolveIssueDialog issue={resolving} onClose={() => setResolving(null)} />
    </div>
  );
}
