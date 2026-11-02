import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarDays, Check, ClipboardCheck, FileDown, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  checklistByStage,
  checklistCount,
  checklistOptions,
  nextChecklistSort,
  type ChecklistItem,
} from "@/lib/work-checklist";
import { stageStatus } from "@/lib/work-progress";
import { stageLabels } from "@/lib/stage-labels";
import { STAGE_STATUS_VARIANT } from "@/lib/status-badges";
import { businessDate } from "@/lib/dashboard-math";
import { commitOnEnter } from "@/lib/enter-submit";
import { fmtDate, fmtStamp } from "@/lib/format";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconBubble, Meter } from "@/components/kpi";
import { EmptyState, ListSkeleton } from "@/components/feedback";

type Stage = Database["public"]["Tables"]["work_stages"]["Row"];

/**
 * Checklist de conferência por etapa: os serviços da etapa entram sozinhos (banco) e a equipe
 * pode incluir itens avulsos. Marcar um item não muda o avanço da etapa nem o financeiro.
 */
export function WorkChecklist({ workId, stages }: { workId: string; stages: Stage[] }) {
  const { data, error } = useQuery(checklistOptions(workId));
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  if (!data) return <ListSkeleton />;
  const groups = checklistByStage(stages, data.items);
  const all = checklistCount(groups.flatMap((g) => g.items));
  return (
    <section className="space-y-4">
      <div className={cn(panelClass, "flex flex-wrap items-center gap-4 p-4 sm:p-5")}>
        <IconBubble icon={ClipboardCheck} tone="brand" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Checklist de conferência</h2>
          <p className="text-xs text-muted-foreground">
            {all.done} de {all.total} itens conferidos · os serviços de cada etapa entram
            automaticamente
          </p>
        </div>
        <div className="w-full sm:w-48">
          <Meter size="sm" value={all.pct} tone="positive" />
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to="/obras/$id/checklist/pdf" params={{ id: workId }} search={{ stage: "" }}>
            <FileDown className="h-4 w-4" />
            PDF de todas as etapas
          </Link>
        </Button>
      </div>
      {groups.length ? (
        groups.map((g) => (
          <StageChecklist
            key={g.stage.id}
            workId={workId}
            stage={g.stage}
            items={g.items}
            names={data.names}
            done={g.done}
            total={g.total}
            pct={g.pct}
          />
        ))
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhuma etapa na obra"
          description="Cadastre as etapas no cronograma para montar o checklist."
        />
      )}
    </section>
  );
}

function StageChecklist({
  workId,
  stage,
  items,
  names,
  done,
  total,
  pct,
}: {
  workId: string;
  stage: Stage;
  items: ChecklistItem[];
  names: Record<string, string>;
  done: number;
  total: number;
  pct: number;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const status = stageStatus(stage, businessDate());
  const refresh = () => qc.invalidateQueries({ queryKey: ["work-checklist", workId] });

  async function update(item: ChecklistItem, patch: Partial<ChecklistItem>) {
    const r = await supabase.from("work_checklist_items").update(patch).eq("id", item.id);
    if (r.error) toast.error(r.error.message);
    await refresh();
  }
  async function add() {
    const description = draft.trim();
    if (!description || busy) return;
    setBusy(true);
    const r = await supabase.from("work_checklist_items").insert({
      work_id: workId,
      stage_id: stage.id,
      description,
      sort: nextChecklistSort(items),
    });
    setBusy(false);
    if (r.error) return void toast.error(r.error.message);
    setDraft("");
    await refresh();
  }
  async function remove(item: ChecklistItem) {
    const r = await supabase.from("work_checklist_items").delete().eq("id", item.id);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Item removido.");
    await refresh();
  }

  return (
    <article className={cn(panelClass, "overflow-hidden")}>
      <header className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{stage.name}</h3>
            <Badge variant={STAGE_STATUS_VARIANT[status] ?? "neutral"}>{stageLabels[status]}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {stage.planned_start || stage.planned_end
              ? `${fmtDate(stage.planned_start)} → ${fmtDate(stage.planned_end)}`
              : "Sem datas no cronograma"}
          </p>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-40">
            <Meter size="sm" label={`${done}/${total} conferidos`} value={pct} tone="positive" />
          </div>
          <Button asChild size="sm" variant="soft">
            <Link
              to="/obras/$id/checklist/pdf"
              params={{ id: workId }}
              search={{ stage: stage.id }}
            >
              <FileDown className="h-4 w-4" />
              PDF
            </Link>
          </Button>
        </div>
      </header>

      {items.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <button
                type="button"
                role="checkbox"
                aria-checked={item.checked}
                aria-label={`Conferir ${item.description}`}
                onClick={() => update(item, { checked: !item.checked })}
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  item.checked
                    ? "border-positive bg-positive text-white"
                    : "border-input bg-card hover:border-positive",
                )}
              >
                {item.checked && <Check className="h-4 w-4 stroke-[3]" />}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm leading-snug",
                    item.checked && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  {item.description}
                  {!item.service_id && (
                    <span className="ml-2 inline-block align-middle text-[11px] font-medium text-muted-foreground">
                      avulso
                    </span>
                  )}
                </p>
                {item.checked && item.checked_at && (
                  <p className="mt-0.5 text-xs text-positive">
                    Conferido por {names[item.checked_by ?? ""] ?? "usuário"} em{" "}
                    {fmtStamp(item.checked_at)}
                  </p>
                )}
                <input
                  aria-label={`Observação de ${item.description}`}
                  defaultValue={item.note ?? ""}
                  placeholder="Observação"
                  onKeyDown={commitOnEnter}
                  onBlur={(e) => {
                    const note = e.currentTarget.value.trim() || null;
                    if (note !== item.note) void update(item, { note });
                  }}
                  className="mt-1 w-full rounded-md bg-transparent px-1 py-0.5 text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:bg-muted/60 focus:bg-muted/60 focus:text-foreground"
                />
              </div>
              {!item.service_id && (
                <Button
                  type="button"
                  size="icon"
                  variant="danger"
                  aria-label={`Remover ${item.description}`}
                  className="h-8 w-8"
                  onClick={() => remove(item)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2 border-t border-border/60 bg-muted/30 px-4 py-3 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label={`Novo item em ${stage.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={total ? "Adicionar item avulso" : "Sem serviços · adicionar item"}
          className="h-9 bg-card"
        />
        <Button
          type="submit"
          size="sm"
          variant="soft"
          disabled={!draft.trim() || busy}
          className="h-9"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </form>
    </article>
  );
}
