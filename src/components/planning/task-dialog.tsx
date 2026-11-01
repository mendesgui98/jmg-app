import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitForm } from "@/components/enter-submit";
import { selectClass } from "@/components/works/fields";
import { fmtDate } from "@/lib/format";
import { TASK_STATUS_LABEL, isOpenTask, wouldCycle, type TaskStatus } from "@/lib/planning";
import type { PlanningData, WorkTask } from "@/lib/planning-data";
import { cn } from "@/lib/utils";
import { ResponsibleField } from "./responsible-field";

export type TaskDraft = Partial<WorkTask> & { work_id?: string };

/** Nova tarefa / editar tarefa: obra, etapa, dia, responsável, prioridade e tarefas anteriores. */
export function TaskDialog({
  draft,
  data,
  onClose,
}: {
  draft: TaskDraft | null;
  data: PlanningData;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>
        {draft && <TaskForm key={draft.id ?? "new"} draft={draft} data={data} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  draft,
  data,
  onDone,
}: {
  draft: TaskDraft;
  data: PlanningData;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!draft.id;
  const [f, setF] = useState({
    work_id: draft.work_id ?? "",
    stage_id: draft.stage_id ?? "",
    title: draft.title ?? "",
    planned_date: draft.planned_date ?? "",
    person_id: draft.person_id ?? "",
    responsible: draft.responsible ?? "",
    priority: draft.priority ?? "normal",
    status: (draft.status ?? "a_fazer") as TaskStatus,
    notes: draft.notes ?? "",
  });
  const [deps, setDeps] = useState<string[]>(
    draft.id ? data.deps.filter((d) => d.task_id === draft.id).map((d) => d.depends_on_id) : [],
  );
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const stages = data.stages.filter((s) => s.work_id === f.work_id);
  // Tarefas da mesma obra que podem ser anteriores (sem criar espera circular).
  const otherDeps = data.deps.filter((d) => d.task_id !== draft.id);
  const candidates = data.tasks.filter(
    (t) =>
      t.work_id === f.work_id &&
      t.id !== draft.id &&
      !deps.includes(t.id) &&
      t.status !== "cancelada" &&
      (!draft.id || !wouldCycle(otherDeps, draft.id, t.id)),
  );
  const byId = new Map(data.tasks.map((t) => [t.id, t]));

  async function save() {
    if (!f.work_id) {
      toast.error("Escolha a obra.");
      return;
    }
    setBusy(true);
    try {
      const row = {
        work_id: f.work_id,
        stage_id: f.stage_id || null,
        title: f.title.trim(),
        planned_date: f.planned_date || null,
        person_id: f.person_id || null,
        responsible: f.person_id ? null : f.responsible.trim() || null,
        priority: f.priority,
        notes: f.notes.trim() || null,
      };
      let id = draft.id;
      if (id) {
        const r = await supabase.from("work_tasks").update(row).eq("id", id);
        if (r.error) throw r.error;
      } else {
        const r = await supabase.from("work_tasks").insert(row).select("id").single();
        if (r.error) throw r.error;
        id = r.data.id;
      }
      const before = data.deps.filter((d) => d.task_id === id).map((d) => d.depends_on_id);
      const removed = before.filter((x) => !deps.includes(x));
      const added = deps.filter((x) => !before.includes(x));
      if (removed.length) {
        const r = await supabase
          .from("work_task_dependencies")
          .delete()
          .eq("task_id", id!)
          .in("depends_on_id", removed);
        if (r.error) throw r.error;
      }
      if (added.length) {
        const r = await supabase
          .from("work_task_dependencies")
          .insert(added.map((depends_on_id) => ({ task_id: id!, depends_on_id })));
        if (r.error) throw r.error;
      }
      // Situação por último: concluir pode ser recusado se ainda houver algo anterior aberto.
      if (editing && f.status !== draft.status) {
        const r = await supabase.from("work_tasks").update({ status: f.status }).eq("id", id!);
        if (r.error) throw r.error;
      }
      toast.success(editing ? "Tarefa atualizada." : "Tarefa criada.");
      onDone();
    } catch (e) {
      toast.error((e as { message?: string }).message ?? "Não foi possível salvar.");
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["planning"] });
    }
  }

  async function remove() {
    if (!draft.id || !window.confirm(`Excluir a tarefa "${draft.title}"?`)) return;
    const r = await supabase.from("work_tasks").delete().eq("id", draft.id);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success("Tarefa excluída.");
    void qc.invalidateQueries({ queryKey: ["planning"] });
    onDone();
  }

  return (
    <SubmitForm onSubmit={() => void save()} pending={busy} className="grid gap-3">
      <label className="block space-y-1 text-sm">
        <Label>O que fazer</Label>
        <Input
          required
          value={f.title}
          placeholder="Ex.: Impermeabilizar box"
          onChange={(e) => set("title", e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <Label>Obra</Label>
          <select
            required
            className={selectClass}
            value={f.work_id}
            disabled={editing}
            onChange={(e) => {
              set("work_id", e.target.value);
              set("stage_id", "");
              setDeps([]);
            }}
          >
            <option value="">Escolher obra</option>
            {data.works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <Label>Etapa (opcional)</Label>
          <select
            className={selectClass}
            value={f.stage_id}
            disabled={!f.work_id}
            onChange={(e) => set("stage_id", e.target.value)}
          >
            <option value="">Sem etapa</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <Label>Dia</Label>
          <Input
            type="date"
            value={f.planned_date}
            onChange={(e) => set("planned_date", e.target.value)}
          />
          <span className="block text-xs text-muted-foreground">
            Sem dia, a tarefa fica na lista de espera.
          </span>
        </label>
        <ResponsibleField
          people={data.people}
          personId={f.person_id}
          text={f.responsible}
          onChange={({ personId, text }) =>
            setF((p) => ({ ...p, person_id: personId, responsible: text }))
          }
        />
      </div>
      <div className="space-y-1 text-sm">
        <Label>Prioridade</Label>
        <div className="flex gap-2" role="radiogroup" aria-label="Prioridade">
          {(
            [
              ["normal", "Normal"],
              ["urgente", "Urgente"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={f.priority === v}
              onClick={() => set("priority", v)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium",
                f.priority === v &&
                  (v === "urgente"
                    ? "border-negative bg-negative-soft text-negative"
                    : "border-primary bg-primary-soft text-primary"),
              )}
            >
              {v === "urgente" ? "● " : ""}
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        <Label>Só pode começar depois de</Label>
        {deps.map((id) => {
          const t = byId.get(id);
          return (
            <div key={id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{t?.title ?? "Tarefa"}</span>
              <span className="text-xs text-muted-foreground">
                {t?.planned_date ? fmtDate(t.planned_date) : "sem dia"} ·{" "}
                {t ? (isOpenTask(t) ? TASK_STATUS_LABEL[t.status as TaskStatus] : "concluída") : ""}
              </span>
              <button
                type="button"
                aria-label="Remover tarefa anterior"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDeps((d) => d.filter((x) => x !== id))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <select
          className={selectClass}
          value=""
          disabled={!f.work_id || !candidates.length}
          onChange={(e) => e.target.value && setDeps((d) => [...d, e.target.value])}
          aria-label="Adicionar tarefa anterior"
        >
          <option value="">
            {!f.work_id
              ? "Escolha a obra primeiro"
              : candidates.length
                ? "+ Adicionar tarefa anterior"
                : "Nenhuma outra tarefa nesta obra"}
          </option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.planned_date ? ` · ${fmtDate(t.planned_date)}` : ""}
            </option>
          ))}
        </select>
      </div>
      {editing && (
        <label className="block space-y-1 text-sm">
          <Label>Situação</Label>
          <select
            className={selectClass}
            value={f.status}
            onChange={(e) => set("status", e.target.value as TaskStatus)}
          >
            {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <Label>Observação</Label>
        <Textarea
          rows={2}
          value={f.notes}
          placeholder="Detalhes para a equipe"
          onChange={(e) => set("notes", e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            className="text-negative"
            onClick={() => void remove()}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar tarefa"}
          </Button>
        </div>
      </div>
    </SubmitForm>
  );
}
