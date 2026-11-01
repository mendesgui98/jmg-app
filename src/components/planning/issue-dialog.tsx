import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitForm } from "@/components/enter-submit";
import { selectClass } from "@/components/works/fields";
import { fmtDate } from "@/lib/format";
import { OWNER_LABEL, isOpenTask, type OwnerKind } from "@/lib/planning";
import type { PlanningData, WorkIssue } from "@/lib/planning-data";
import { cn } from "@/lib/utils";
import { ResponsibleField } from "./responsible-field";

export type IssueDraft = Partial<WorkIssue> & { work_id?: string };

/** Nova pendência / editar pendência: obra, quem resolve, prazo, prioridade e tarefa que trava. */
export function IssueDialog({
  draft,
  data,
  onClose,
}: {
  draft: IssueDraft | null;
  data: PlanningData;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Editar pendência" : "Nova pendência"}</DialogTitle>
        </DialogHeader>
        {draft && <IssueForm key={draft.id ?? "new"} draft={draft} data={data} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

const OWNER_PEOPLE: Record<OwnerKind, string[]> = {
  jmg: ["prestador", "contato"],
  cliente: ["cliente", "contato"],
  arquiteto: ["arquiteto", "contato"],
  fornecedor: ["fornecedor", "prestador", "contato"],
  condominio: ["contato"],
  outro: ["contato", "prestador", "fornecedor", "arquiteto", "cliente"],
};

function IssueForm({
  draft,
  data,
  onDone,
}: {
  draft: IssueDraft;
  data: PlanningData;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!draft.id;
  const [f, setF] = useState({
    work_id: draft.work_id ?? "",
    title: draft.title ?? "",
    owner_kind: (draft.owner_kind ?? "cliente") as OwnerKind,
    person_id: draft.person_id ?? "",
    responsible: draft.responsible ?? "",
    due_date: draft.due_date ?? "",
    priority: draft.priority ?? "normal",
    blocks_task_id: draft.blocks_task_id ?? "",
    notes: draft.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const tasks = data.tasks.filter(
    (t) => t.work_id === f.work_id && (isOpenTask(t) || t.id === f.blocks_task_id),
  );

  async function save() {
    if (!f.work_id) {
      toast.error("Escolha a obra.");
      return;
    }
    setBusy(true);
    const row = {
      work_id: f.work_id,
      title: f.title.trim(),
      owner_kind: f.owner_kind,
      person_id: f.person_id || null,
      responsible: f.person_id ? null : f.responsible.trim() || null,
      due_date: f.due_date || null,
      priority: f.priority,
      blocks_task_id: f.blocks_task_id || null,
      notes: f.notes.trim() || null,
    };
    const r = editing
      ? await supabase.from("work_issues").update(row).eq("id", draft.id!)
      : await supabase.from("work_issues").insert(row);
    setBusy(false);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success(editing ? "Pendência atualizada." : "Pendência criada.");
    void qc.invalidateQueries({ queryKey: ["planning"] });
    onDone();
  }

  async function remove() {
    if (!draft.id || !window.confirm(`Excluir a pendência "${draft.title}"?`)) return;
    const r = await supabase.from("work_issues").delete().eq("id", draft.id);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success("Pendência excluída.");
    void qc.invalidateQueries({ queryKey: ["planning"] });
    onDone();
  }

  return (
    <SubmitForm onSubmit={() => void save()} pending={busy} className="grid gap-3">
      <label className="block space-y-1 text-sm">
        <Label>O que está pendente</Label>
        <Input
          required
          value={f.title}
          placeholder="Ex.: Cliente escolher o porcelanato"
          onChange={(e) => set("title", e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <Label>Obra</Label>
        <select
          required
          className={selectClass}
          value={f.work_id}
          disabled={editing}
          onChange={(e) => {
            set("work_id", e.target.value);
            set("blocks_task_id", "");
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
      <div className="space-y-1 text-sm">
        <Label>Quem resolve</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Quem resolve">
          {(Object.keys(OWNER_LABEL) as OwnerKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={f.owner_kind === k}
              onClick={() => set("owner_kind", k)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-sm font-medium",
                f.owner_kind === k && "border-primary bg-primary-soft text-primary",
              )}
            >
              {OWNER_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ResponsibleField
          label="Pessoa (opcional)"
          people={data.people}
          kinds={OWNER_PEOPLE[f.owner_kind]}
          personId={f.person_id}
          text={f.responsible}
          onChange={({ personId, text }) =>
            setF((p) => ({ ...p, person_id: personId, responsible: text }))
          }
        />
        <label className="block space-y-1 text-sm">
          <Label>Prazo</Label>
          <Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <Label>Prioridade</Label>
          <select
            className={selectClass}
            value={f.priority}
            onChange={(e) => set("priority", e.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <Label>Trava a tarefa (opcional)</Label>
          <select
            className={selectClass}
            value={f.blocks_task_id}
            disabled={!f.work_id}
            onChange={(e) => set("blocks_task_id", e.target.value)}
          >
            <option value="">Nenhuma</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.planned_date ? ` · ${fmtDate(t.planned_date)}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <Label>Observação</Label>
        <Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
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
            {busy ? "Salvando…" : "Salvar pendência"}
          </Button>
        </div>
      </div>
    </SubmitForm>
  );
}

/** Resolver pendência: observação curta; quem e quando ficam gravados pelo banco. */
export function ResolveIssueDialog({
  issue,
  onClose,
}: {
  issue: WorkIssue | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!issue) return;
    setBusy(true);
    const r = await supabase
      .from("work_issues")
      .update({ status: "resolvida", resolution: text.trim() || null })
      .eq("id", issue.id);
    setBusy(false);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success(
      issue.blocks_task_id ? "Pendência resolvida. A tarefa foi liberada." : "Pendência resolvida.",
    );
    setText("");
    void qc.invalidateQueries({ queryKey: ["planning"] });
    onClose();
  }
  return (
    <Dialog open={!!issue} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver pendência</DialogTitle>
        </DialogHeader>
        <SubmitForm onSubmit={() => void save()} pending={busy} className="grid gap-3">
          <p className="text-sm font-medium">{issue?.title}</p>
          <label className="block space-y-1 text-sm">
            <Label>Como foi resolvida (opcional)</Label>
            <Input
              value={text}
              placeholder="Ex.: Cliente escolheu o modelo 60x60 bege"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Marcar como resolvida"}
            </Button>
          </div>
        </SubmitForm>
      </DialogContent>
    </Dialog>
  );
}
