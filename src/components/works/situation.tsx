import { businessDate } from "@/lib/dashboard-math";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { planningOptions } from "@/lib/planning-data";
import { OWNER_LABEL, sortIssues, taskState, type OwnerKind } from "@/lib/planning";
import { AlertTriangle, CircleAlert, ClipboardList, ListChecks } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { WORK_STATUS_VARIANT } from "@/lib/status-badges";
import { IconBubble } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { fmtDate, fmtNum } from "@/lib/format";
import { physicalProgress, workDeadline, stageStatus } from "@/lib/work-progress";
import { stageLabels } from "@/lib/stage-labels";
import { ScheduleSituation } from "./schedule-situation";
import { scheduleSituation } from "@/lib/work-schedule";
import type { Database } from "@/integrations/supabase/types";
import { WORK_STATUS_LABEL, workStatusLabel } from "@/lib/work-status";
type Stage = Database["public"]["Tables"]["work_stages"]["Row"];
type Work = Database["public"]["Tables"]["work_registry"]["Row"];
type RecordRow = Database["public"]["Tables"]["work_records"]["Row"];
export function WorkSituation({
  work,
  stages,
  records,
  progress,
  client,
}: {
  work: Work;
  stages: Stage[];
  records: RecordRow[];
  progress?: number;
  client?: string;
}) {
  const p = progress ?? physicalProgress(stages);
  const today = businessDate();
  const scheduling = scheduleSituation(stages, today, work.planned_end);
  const deadline = workDeadline(scheduling.end, p, stages, today);
  const pending = records.filter(
    (r) =>
      !["concluido", "aceito"].includes(r.status) &&
      r.kind !== "documento" &&
      (!!r.due_date || r.kind === "assistencia" || r.kind === "entrega") &&
      (!r.stage_id || !r.file_path),
  );
  const attention = stages
    .filter((s) => s.pending_services || stageStatus(s, today) === "atrasado")
    .slice(0, 3);
  // Pendências e tarefas do Planejamento desta obra (o mesmo módulo do menu Pendências).
  const { data: plan } = useQuery(planningOptions);
  const openIssues = plan
    ? sortIssues(
        plan.issues.filter((i) => i.work_id === work.id && i.status === "aberta"),
        today,
      )
    : [];
  const hotTasks = plan
    ? plan.tasks
        .filter((t) => t.work_id === work.id)
        .map((t) => ({ t, state: taskState(t, plan.tasks, plan.deps, plan.issues, today) }))
        .filter((x) => ["atrasada", "urgente", "bloqueada"].includes(x.state))
    : [];
  const TASK_STATE_TEXT: Record<string, string> = {
    atrasada: "atrasada",
    urgente: "urgente",
    bloqueada: "esperando outra tarefa ou pendência",
  };
  const statusLabel = WORK_STATUS_LABEL[work.status] ?? work.status;
  const statusVariant = WORK_STATUS_VARIANT[work.status] ?? "neutral";
  return (
    <section className="space-y-4">
      <div className={cn(panelClass, "grid grid-cols-2 gap-4 p-4 sm:p-5 lg:grid-cols-4")}>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Cliente</p>
          {work.client_id ? (
            <Link
              to="/cadastros/$id"
              params={{ id: work.client_id }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {client || "Ver cliente"}
            </Link>
          ) : (
            <p className="text-sm">{client || "Não informado"}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Situação</p>
          <Badge variant={statusVariant} className="mt-1">
            {statusLabel}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Início</p>
          <p className="text-sm font-semibold">
            {fmtDate(work.actual_start || work.planned_start)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Previsão de término</p>
          <p className="text-sm font-semibold">{fmtDate(scheduling.end)}</p>
          <span
            className={`text-xs font-medium ${deadline === "Atrasada" ? "text-negative" : deadline === "Atenção" ? "text-alert" : "text-positive"}`}
          >
            {deadline}
            {!work.planned_end ? " · prazo não informado" : ""}
          </span>
        </div>
      </div>
      <ScheduleSituation workId={work.id} stages={stages} end={work.planned_end} />
      {progress === undefined && (
        <div className={cn(panelClass, "space-y-2 p-4 sm:p-5")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Avanço físico</p>
            <p className="text-lg font-bold num">{fmtNum(p)}%</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, p))}%` }}
            />
          </div>
        </div>
      )}
      <div className={cn(panelClass, "overflow-hidden")}>
        <h2 className="px-4 pt-4 text-base font-semibold sm:px-5">Pendências principais</h2>
        <div className="divide-y divide-border/60">
          {attention.map((s) => (
            <Link
              key={s.id}
              to="/obras/$id"
              params={{ id: work.id }}
              search={{ tab: "etapas", record: s.id }}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 sm:px-5"
            >
              <IconBubble icon={AlertTriangle} tone="alert" />
              <span className="min-w-0">
                <span className="font-semibold">{s.name}</span> ·{" "}
                {s.pending_services || stageLabels[stageStatus(s, today)]}
              </span>
            </Link>
          ))}
          {pending.slice(0, 3).map((r) => (
            <Link
              key={r.id}
              to="/obras/$id"
              params={{ id: work.id }}
              search={{ tab: r.kind, record: r.id }}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 sm:px-5"
            >
              <IconBubble icon={ClipboardList} tone="brand" />
              <span className="min-w-0 text-primary">
                {r.title} · {fmtDate(r.due_date)}
              </span>
            </Link>
          ))}
          {openIssues.slice(0, 3).map((i) => (
            <Link
              key={i.id}
              to="/pendencias"
              search={{ obra: work.id }}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 sm:px-5"
            >
              <IconBubble icon={CircleAlert} tone={i.priority === "urgente" ? "alert" : "brand"} />
              <span className="min-w-0">
                <span className="font-semibold">{i.title}</span> · com{" "}
                {(OWNER_LABEL[i.owner_kind as OwnerKind] ?? i.owner_kind).toLowerCase()}
                {i.due_date ? ` · até ${fmtDate(i.due_date)}` : ""}
              </span>
            </Link>
          ))}
          {hotTasks.slice(0, 3).map(({ t, state }) => (
            <Link
              key={t.id}
              to="/planejamento"
              search={{ obra: work.id, view: "dia" }}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 sm:px-5"
            >
              <IconBubble icon={ListChecks} tone={state === "bloqueada" ? "brand" : "alert"} />
              <span className="min-w-0">
                <span className="font-semibold">{t.title}</span> · tarefa {TASK_STATE_TEXT[state]}
                {t.planned_date ? ` · ${fmtDate(t.planned_date)}` : ""}
              </span>
            </Link>
          ))}
          {(openIssues.length > 3 || hotTasks.length > 3) && (
            <Link
              to="/pendencias"
              search={{ obra: work.id }}
              className="block px-4 py-3 text-sm font-semibold text-primary hover:underline sm:px-5"
            >
              Ver todas ({openIssues.length} pendências, {hotTasks.length} tarefas)
            </Link>
          )}
          {!pending.length && !attention.length && !openIssues.length && !hotTasks.length && (
            <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">
              Nenhuma pendência registrada.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
