import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SubmitForm } from "@/components/enter-submit";
import { selectClass } from "@/components/works/fields";
import { ResponsibleField } from "@/components/planning/responsible-field";
import { businessDate } from "@/lib/dashboard-math";
import { fmtDate } from "@/lib/format";
import { maskBRL, parseBRL } from "@/lib/money";
import { capitalizeWordsProps } from "@/lib/text-case";
import { uploadDocument } from "@/lib/work-data";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABEL,
  EVALUATION_LABEL,
  OUTCOME_LABEL,
  PHASE_LABEL,
  SLA_BUSINESS_DAYS,
  WARRANTY_MONTHS,
  addBusinessDays,
  claimCode,
  warrantyEnd,
  warrantyState,
  type Evaluation,
} from "@/lib/warranty";
import {
  warrantyInfo,
  type Warranty,
  type WarrantyClaim,
  type WarrantyData,
  type WarrantyVisit,
} from "@/lib/warranty-data";

const TERMS = [6, 12, 24, 60];
const termLabel = (m: number) => (m < 24 ? `${m} meses` : `${m / 12} anos`);
const chip = (on: boolean) =>
  cn(
    "min-h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
    on ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-muted",
  );

const useRefresh = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["warranty"] });
    void qc.invalidateQueries({ queryKey: ["financial-dashboard"] });
  };
};

async function uploadAll(files: FileList | null) {
  const paths: string[] = [];
  for (const f of Array.from(files ?? []))
    if (f.size) paths.push(await uploadDocument(f, "records/warranty"));
  return paths;
}

/** Parecer ao vivo: quantos dias faltam, % do prazo e fase. */
export function WarrantyVerdict({
  start,
  end,
  today,
}: {
  start: string;
  end: string;
  today: string;
}) {
  if (!start || !end)
    return (
      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        Preencha o início e o fim para ver quantos dias faltam.
      </p>
    );
  if (end <= start)
    return (
      <p className="rounded-xl bg-negative-soft p-3 text-sm font-medium text-negative">
        O fim precisa ser depois do início.
      </p>
    );
  const s = warrantyState({ start_date: start, end_date: end }, today);
  const tone = {
    ativa: "bg-positive-soft text-positive",
    vencendo: "bg-alert-soft text-alert",
    encerrada: "bg-muted text-muted-foreground",
    futura: "bg-primary-soft text-primary",
  }[s.phase];
  const bar = {
    ativa: "bg-positive",
    vencendo: "bg-gold",
    encerrada: "bg-muted-foreground/50",
    futura: "bg-primary",
  }[s.phase];
  return (
    <div className={cn("space-y-2 rounded-xl p-4", tone)} aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold">
        <span>Parecer</span>
        <span>{PHASE_LABEL[s.phase]}</span>
      </div>
      <p className="text-2xl font-bold num">
        {s.label}
        {(s.phase === "ativa" || s.phase === "vencendo") && s.left > 30 && (
          <span className="ml-2 text-sm font-medium">({s.span})</span>
        )}
      </p>
      <p className="text-xs num">
        {fmtDate(start)} a {fmtDate(end)} · prazo de {s.total} dias
        {s.phase !== "futura" && ` · ${s.elapsed}% já passou`}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-white/60">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${s.elapsed}%` }} />
      </div>
    </div>
  );
}

function DateTerm({
  start,
  end,
  term,
  onChange,
  startLabel,
}: {
  start: string;
  end: string;
  term: number | null;
  onChange: (v: { start: string; end: string; term: number | null }) => void;
  startLabel: string;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <Label>{startLabel}</Label>
          <Input
            type="date"
            required
            value={start}
            onChange={(e) =>
              onChange({
                start: e.target.value,
                end: term && e.target.value ? warrantyEnd(e.target.value, term) : end,
                term,
              })
            }
          />
        </label>
        <label className="block space-y-1 text-sm">
          <Label>Fim da garantia</Label>
          <Input
            type="date"
            required
            value={end}
            onChange={(e) => onChange({ start, end: e.target.value, term: null })}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">Preencher o fim pelo prazo:</span>
        {TERMS.map((m) => (
          <button
            key={m}
            type="button"
            className={chip(term === m)}
            aria-pressed={term === m}
            onClick={() => onChange({ start, end: start ? warrantyEnd(start, m) : end, term: m })}
          >
            {termLabel(m)}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Garantia nova: de uma obra da plataforma ("Registrar entrega", com a data de entrega) ou de uma
 * obra entregue antes da plataforma (nome, cliente, endereço, início e fim). Editar: datas,
 * vistoria final e observações.
 */
export function WarrantyDialog({
  open,
  onClose,
  data,
  workId,
  warranty,
  canSeeCosts,
}: {
  open: boolean;
  onClose: () => void;
  data: WarrantyData;
  /** Obra da plataforma (registrar entrega). */
  workId?: string | undefined;
  warranty?: Warranty | undefined;
  canSeeCosts: boolean;
}) {
  const title = warranty
    ? "Editar garantia"
    : workId
      ? "Registrar entrega da obra"
      : "Cadastrar garantia de obra já entregue";
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open && (
          <WarrantyForm
            data={data}
            workId={workId}
            warranty={warranty}
            canSeeCosts={canSeeCosts}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WarrantyForm({
  data,
  workId,
  warranty,
  canSeeCosts,
  onDone,
}: {
  data: WarrantyData;
  workId?: string | undefined;
  warranty?: Warranty | undefined;
  canSeeCosts: boolean;
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  const today = businessDate();
  const work = workId ? data.works.find((w) => w.id === workId) : undefined;
  const legacy = warranty ? !warranty.work_id : !workId;
  const firstStart = warranty?.start_date ?? work?.actual_end ?? (workId ? today : "");
  const [f, setF] = useState({
    name: warranty?.name ?? "",
    client_id: warranty?.client_id ?? "",
    address: warranty?.address ?? "",
    start: firstStart,
    end: warranty?.end_date ?? (firstStart ? warrantyEnd(firstStart) : ""),
    term: (warranty ? warranty.term_months : WARRANTY_MONTHS) as number | null,
    notes: warranty?.notes ?? "",
    inspection: warranty?.final_inspection_date ?? "",
    inspectionDone: warranty?.final_inspection_done ?? false,
    conclude: work ? work.status !== "concluida" : false,
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const clients = data.people.filter((p) => p.kind === "cliente" || p.id === f.client_id);

  async function save() {
    if (legacy && !f.name.trim()) {
      toast.error("Informe o nome da obra.");
      return;
    }
    if (!f.start || !f.end || f.end <= f.start) {
      toast.error("Confira as datas: o fim precisa ser depois do início.");
      return;
    }
    setBusy(true);
    try {
      const [handover] = await uploadAll(files);
      const row = {
        start_date: f.start,
        end_date: f.end,
        term_months: f.term,
        notes: f.notes.trim() || null,
        final_inspection_date: f.inspection || null,
        final_inspection_done: f.inspectionDone,
        ...(legacy
          ? { name: f.name, client_id: f.client_id || null, address: f.address || null }
          : {}),
        ...(handover ? { handover_path: handover } : {}),
      };
      const r = warranty
        ? await supabase.from("warranties").update(row).eq("id", warranty.id)
        : await supabase.from("warranties").insert({ ...row, work_id: workId ?? null });
      if (r.error) throw r.error;
      if (workId && f.conclude && canSeeCosts) {
        const u = await supabase
          .from("work_registry")
          .update({ status: "concluida", actual_end: f.start })
          .eq("id", workId);
        if (u.error) throw u.error;
        void qc.invalidateQueries({ queryKey: ["work", workId] });
        void qc.invalidateQueries({ queryKey: ["works"] });
      }
      refresh();
      toast.success(
        warranty
          ? "Garantia atualizada."
          : workId
            ? "Entrega registrada: garantia iniciada."
            : "Garantia cadastrada.",
      );
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!warranty) return;
    const n = data.claims.filter((c) => c.warranty_id === warranty.id).length;
    if (
      !window.confirm(
        n
          ? `Excluir a garantia e os ${n} chamados dela? Chamados com custo lançado no Financeiro impedem a exclusão.`
          : "Excluir esta garantia?",
      )
    )
      return;
    const r = await supabase.from("warranties").delete().eq("id", warranty.id).select("id");
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    if (!r.data?.length) {
      toast.error("Só administrador ou financeiro pode excluir.");
      return;
    }
    refresh();
    toast.success("Garantia excluída.");
    onDone();
  }

  return (
    <SubmitForm onSubmit={() => void save()} pending={busy} className="grid gap-3">
      {legacy ? (
        <>
          <p className="text-sm text-muted-foreground">
            Para obras entregues antes da plataforma: fica só o cadastro da garantia (sem orçamento
            nem financeiro da obra), com chamados e relatórios iguais aos das outras obras.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <Label>Nome da obra</Label>
              <Input
                required
                value={f.name}
                placeholder="Ex.: Casa Andrade"
                {...capitalizeWordsProps}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <Label>Cliente</Label>
              <select
                className={selectClass}
                value={f.client_id}
                onChange={(e) => set("client_id", e.target.value)}
              >
                <option value="">Sem cliente cadastrado</option>
                {clients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <Label>Endereço</Label>
            <Input
              value={f.address}
              {...capitalizeWordsProps}
              onChange={(e) => set("address", e.target.value)}
            />
          </label>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {work?.name ?? "Obra"} · a garantia conta a partir da data de entrega ({WARRANTY_MONTHS}{" "}
          meses pelo contrato).
        </p>
      )}

      <DateTerm
        start={f.start}
        end={f.end}
        term={f.term}
        startLabel={legacy ? "Início da garantia (data da entrega)" : "Data de entrega"}
        onChange={(v) => setF((p) => ({ ...p, ...v }))}
      />
      <WarrantyVerdict start={f.start} end={f.end} today={today} />

      {warranty && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <Label>Vistoria final</Label>
            <Input
              type="date"
              value={f.inspection}
              onChange={(e) => set("inspection", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Switch checked={f.inspectionDone} onCheckedChange={(v) => set("inspectionDone", v)} />
            Vistoria final feita
          </label>
        </div>
      )}

      <label className="block space-y-1 text-sm">
        <Label>
          {legacy ? "Termo de entrega ou contrato" : "Termo de entrega assinado"}{" "}
          <span className="font-normal text-muted-foreground">(opcional · PDF ou foto)</span>
        </Label>
        <Input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFiles(e.target.files)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <Label>Observações</Label>
        <Textarea value={f.notes} rows={2} onChange={(e) => set("notes", e.target.value)} />
      </label>
      {work && canSeeCosts && work.status !== "concluida" && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.conclude} onCheckedChange={(v) => set("conclude", v)} />
          Marcar a obra como concluída na data de entrega
        </label>
      )}
      <div className="flex flex-wrap justify-between gap-2 pt-1">
        {warranty && canSeeCosts ? (
          <Button
            type="button"
            variant="ghost"
            className="text-negative"
            onClick={() => void remove()}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {warranty ? "Salvar" : workId ? "Registrar entrega" : "Salvar garantia"}
          </Button>
        </div>
      </div>
    </SubmitForm>
  );
}

export type ClaimDraft = Partial<WarrantyClaim> & { warranty_id?: string };

/** Novo chamado / editar chamado: aviso, etapa, quem executou, avaliação, fotos e lição. */
export function ClaimDialog({
  draft,
  data,
  onClose,
}: {
  draft: ClaimDraft | null;
  data: WarrantyData;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {draft?.id ? `Chamado ${claimCode(draft.number ?? 0)}` : "Novo chamado de garantia"}
          </DialogTitle>
        </DialogHeader>
        {draft && <ClaimForm key={draft.id ?? "new"} draft={draft} data={data} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ClaimForm({
  draft,
  data,
  onDone,
}: {
  draft: ClaimDraft;
  data: WarrantyData;
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const today = businessDate();
  const editing = !!draft.id;
  const [f, setF] = useState({
    warranty_id: draft.warranty_id ?? "",
    reported_at: draft.reported_at ?? today,
    channel: draft.channel ?? "whatsapp",
    reported_by: draft.reported_by ?? "",
    description: draft.description ?? "",
    stage_id: draft.stage_id ?? "",
    work_stage_id: draft.work_stage_id ?? "",
    executor_kind: draft.executor_kind ?? "equipe",
    executor_id: draft.executor_id ?? "",
    evaluation: (draft.evaluation ?? "a_avaliar") as Evaluation,
    lesson: draft.lesson ?? "",
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const warranty = data.warranties.find((w) => w.id === f.warranty_id);
  const workStages = warranty?.work_id
    ? data.workStages.filter((s) => s.work_id === warranty.work_id)
    : [];
  const stages = data.stages.filter((s) => s.active || s.id === f.stage_id);
  const executors = data.people.filter(
    (p) => p.kind === "prestador" || p.kind === "fornecedor" || p.id === f.executor_id,
  );
  const selectable = data.warranties
    .map((w) => ({ w, info: warrantyInfo(w, data), s: warrantyState(w, today) }))
    .filter((x) => x.s.phase !== "encerrada" || x.w.id === f.warranty_id)
    .sort((a, b) => a.info.name.localeCompare(b.info.name));

  async function save() {
    if (!f.warranty_id) {
      toast.error("Escolha a obra em garantia.");
      return;
    }
    setBusy(true);
    try {
      const photos = await uploadAll(files);
      const row = {
        reported_at: f.reported_at,
        channel: f.channel,
        reported_by: f.reported_by || null,
        description: f.description.trim(),
        stage_id: f.stage_id || null,
        work_stage_id: f.work_stage_id || null,
        executor_kind: f.executor_kind,
        executor_id: f.executor_kind === "prestador" ? f.executor_id || null : null,
        evaluation: f.evaluation,
        lesson: f.lesson.trim() || null,
        photo_paths: [...(draft.photo_paths ?? []), ...photos],
      };
      const r = editing
        ? await supabase.from("warranty_claims").update(row).eq("id", draft.id!)
        : await supabase.from("warranty_claims").insert({ ...row, warranty_id: f.warranty_id });
      if (r.error) throw r.error;
      refresh();
      toast.success(editing ? "Chamado atualizado." : "Chamado aberto.");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id || !window.confirm("Excluir este chamado e as visitas dele?")) return;
    const r = await supabase.from("warranty_claims").delete().eq("id", draft.id);
    if (r.error) {
      toast.error(
        /foreign key/i.test(r.error.message)
          ? "Este chamado tem custo lançado no Financeiro: cancele a conta antes."
          : r.error.message,
      );
      return;
    }
    refresh();
    toast.success("Chamado excluído.");
    onDone();
  }

  return (
    <SubmitForm onSubmit={() => void save()} pending={busy} className="grid gap-3">
      <label className="block space-y-1 text-sm">
        <Label>Obra em garantia</Label>
        <select
          required
          className={selectClass}
          value={f.warranty_id}
          disabled={editing || !!draft.warranty_id}
          onChange={(e) => setF((p) => ({ ...p, warranty_id: e.target.value, work_stage_id: "" }))}
        >
          <option value="">Escolher obra</option>
          {selectable.map(({ w, info, s }) => (
            <option key={w.id} value={w.id}>
              {info.name}
              {info.client ? ` · ${info.client}` : ""} · {s.label.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1 text-sm">
          <Label>Avisado em</Label>
          <Input
            type="date"
            required
            value={f.reported_at}
            onChange={(e) => set("reported_at", e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <Label>Como avisou</Label>
          <select
            className={selectClass}
            value={f.channel}
            onChange={(e) => set("channel", e.target.value)}
          >
            {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <Label>Quem avisou</Label>
          <Input
            value={f.reported_by}
            placeholder="Ex.: a cliente"
            {...capitalizeWordsProps}
            onChange={(e) => set("reported_by", e.target.value)}
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <Label>O que o cliente relatou</Label>
        <Textarea
          required
          rows={3}
          value={f.description}
          placeholder="Ex.: vazamento embaixo da pia da cozinha"
          onChange={(e) => set("description", e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <Label>
            Etapa <span className="font-normal text-muted-foreground">(Etapas da obra)</span>
          </Label>
          <select
            className={selectClass}
            value={f.stage_id}
            onChange={(e) => set("stage_id", e.target.value)}
          >
            <option value="">Escolher etapa</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {workStages.length > 0 && (
          <label className="block space-y-1 text-sm">
            <Label>
              Etapa desta obra <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <select
              className={selectClass}
              value={f.work_stage_id}
              onChange={(e) => set("work_stage_id", e.target.value)}
            >
              <option value="">—</option>
              {workStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <Label>Quem executou o serviço</Label>
          <div className="flex gap-1.5">
            {(["equipe", "prestador"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={f.executor_kind === k}
                className={chip(f.executor_kind === k)}
                onClick={() => set("executor_kind", k)}
              >
                {k === "equipe" ? "Equipe própria" : "Prestador"}
              </button>
            ))}
          </div>
        </div>
        {f.executor_kind === "prestador" && (
          <label className="block space-y-1 text-sm">
            <Label>Prestador</Label>
            <select
              className={selectClass}
              value={f.executor_id}
              onChange={(e) => set("executor_id", e.target.value)}
            >
              <option value="">Não informado</option>
              {executors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="space-y-1 text-sm">
        <Label>Avaliação</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Avaliação">
          {(Object.keys(EVALUATION_LABEL) as Evaluation[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={f.evaluation === k}
              className={chip(f.evaluation === k)}
              onClick={() => set("evaluation", k)}
            >
              {EVALUATION_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <label className="block space-y-1 text-sm">
        <Label>
          Fotos do problema{" "}
          {!!draft.photo_paths?.length && (
            <span className="font-normal text-muted-foreground">
              ({draft.photo_paths.length} já anexadas)
            </span>
          )}
        </Label>
        <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
      </label>
      {editing && (
        <label className="block space-y-1 text-sm">
          <Label>
            Lição para as próximas obras{" "}
            <span className="font-normal text-muted-foreground">(entra no relatório)</span>
          </Label>
          <Input
            value={f.lesson}
            placeholder="Ex.: testar sifões com água na entrega"
            onChange={(e) => set("lesson", e.target.value)}
          />
        </label>
      )}
      {f.reported_at && (f.evaluation === "a_avaliar" || f.evaluation === "procedente") && (
        <p className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
          <CalendarClock className="h-4 w-4 shrink-0" />
          Prazo da 1ª visita: até{" "}
          <b className="num">{fmtDate(addBusinessDays(f.reported_at, SLA_BUSINESS_DAYS))}</b> (
          {SLA_BUSINESS_DAYS} dias úteis a partir do aviso)
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2 pt-1">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            className="text-negative"
            onClick={() => void remove()}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {editing ? "Salvar" : "Abrir chamado"}
          </Button>
        </div>
      </div>
    </SubmitForm>
  );
}

export type VisitDraft = Partial<WarrantyVisit> & { claim_id: string };

/** Agendar ou registrar uma visita do chamado; custo (só admin/financeiro) vai ao Financeiro. */
export function VisitDialog({
  draft,
  data,
  canSeeCosts,
  onClose,
}: {
  draft: VisitDraft | null;
  data: WarrantyData;
  canSeeCosts: boolean;
  onClose: () => void;
}) {
  const claim = draft ? data.claims.find((c) => c.id === draft.claim_id) : undefined;
  return (
    <Dialog open={!!draft} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Editar visita" : "Visita do chamado"}</DialogTitle>
        </DialogHeader>
        {draft && claim && (
          <VisitForm
            key={draft.id ?? "new"}
            draft={draft}
            claim={claim}
            data={data}
            canSeeCosts={canSeeCosts}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VisitForm({
  draft,
  claim,
  data,
  canSeeCosts,
  onDone,
}: {
  draft: VisitDraft;
  claim: WarrantyClaim;
  data: WarrantyData;
  canSeeCosts: boolean;
  onDone: () => void;
}) {
  const refresh = useRefresh();
  const today = businessDate();
  const editing = !!draft.id;
  const warranty = data.warranties.find((w) => w.id === claim.warranty_id)!;
  const info = warrantyInfo(warranty, data);
  const [f, setF] = useState({
    visit_date: draft.visit_date ?? today,
    done: draft.done ?? (draft.visit_date ? draft.visit_date <= today : true),
    person_id: draft.person_id ?? "",
    responsible: draft.responsible ?? "",
    outcome: draft.outcome ?? "reparo",
    notes: draft.notes ?? "",
    labor: "",
    material: "",
    lesson: claim.lesson ?? "",
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const nth =
    data.visits.filter((v) => v.claim_id === claim.id && (!draft.id || v.id !== draft.id)).length +
    (editing ? 0 : 1);

  async function save() {
    setBusy(true);
    try {
      const photos = await uploadAll(files);
      const row = {
        visit_date: f.visit_date,
        done: f.done,
        person_id: f.person_id || null,
        responsible: f.person_id ? null : f.responsible || null,
        outcome: f.done ? f.outcome : null,
        notes: f.notes.trim() || null,
        photo_paths: [...(draft.photo_paths ?? []), ...photos],
      };
      const r = editing
        ? await supabase.from("warranty_visits").update(row).eq("id", draft.id!)
        : await supabase.from("warranty_visits").insert({ ...row, claim_id: claim.id });
      if (r.error) throw r.error;
      if ((f.lesson.trim() || null) !== (claim.lesson ?? null)) {
        const l = await supabase
          .from("warranty_claims")
          .update({ lesson: f.lesson.trim() || null })
          .eq("id", claim.id);
        if (l.error) throw l.error;
      }
      const labor = parseBRL(f.labor);
      const material = parseBRL(f.material);
      if (canSeeCosts && f.done && labor + material > 0) {
        const parts = [
          labor ? `mão de obra ${maskBRL(f.labor)}` : "",
          material ? `material ${maskBRL(f.material)}` : "",
        ].filter(Boolean);
        const e = await supabase.from("financial_entries").insert({
          work_id: warranty.work_id,
          direction: "saida",
          category: "Garantia",
          description: `Garantia ${claimCode(claim.number)} · ${info.name} · ${parts.join(" + ")}`,
          amount: Math.round((labor + material) * 100) / 100,
          due_date: f.visit_date,
          incurred: true,
          warranty_claim_id: claim.id,
        });
        if (e.error) throw e.error;
      }
      refresh();
      toast.success(
        labor + material > 0 && canSeeCosts && f.done
          ? "Visita salva e custo lançado em Contas a pagar."
          : f.done
            ? "Visita registrada."
            : "Visita agendada.",
      );
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id || !window.confirm("Excluir esta visita?")) return;
    const r = await supabase.from("warranty_visits").delete().eq("id", draft.id);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    refresh();
    toast.success("Visita excluída.");
    onDone();
  }

  return (
    <SubmitForm onSubmit={() => void save()} pending={busy} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {claimCode(claim.number)} · {info.name} · visita {nth}
      </p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Situação da visita">
        {[
          [false, "Agendar visita"],
          [true, "Visita feita"],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={f.done === v}
            className={chip(f.done === v)}
            onClick={() => set("done", v as boolean)}
          >
            {label as string}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <Label>Data</Label>
          <Input
            type="date"
            required
            value={f.visit_date}
            onChange={(e) => set("visit_date", e.target.value)}
          />
        </label>
        <ResponsibleField
          people={data.people}
          personId={f.person_id}
          text={f.responsible}
          kinds={["prestador", "fornecedor", "contato"]}
          onChange={({ personId, text }) =>
            setF((p) => ({ ...p, person_id: personId, responsible: text }))
          }
        />
      </div>
      {f.done && (
        <div className="space-y-1 text-sm">
          <Label>Resultado</Label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Resultado">
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={f.outcome === k}
                className={chip(f.outcome === k)}
                onClick={() => set("outcome", k)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="block space-y-1 text-sm">
        <Label>{f.done ? "O que foi feito" : "Observações"}</Label>
        <Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
      {f.done && canSeeCosts && !editing && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <Label>Custo de mão de obra</Label>
            <Input
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={f.labor}
              onChange={(e) => set("labor", maskBRL(e.target.value))}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <Label>Custo de material</Label>
            <Input
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={f.material}
              onChange={(e) => set("material", maskBRL(e.target.value))}
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Com valor, vira uma conta a pagar no Financeiro (categoria Garantia
            {warranty.work_id ? ", ligada à obra" : ""}), para pagar com a conta e o comprovante.
          </p>
        </div>
      )}
      {f.done && (
        <label className="block space-y-1 text-sm">
          <Label>
            Lição para as próximas obras{" "}
            <span className="font-normal text-muted-foreground">
              (opcional · entra no relatório)
            </span>
          </Label>
          <Input
            value={f.lesson}
            placeholder="Ex.: testar sifões com água na entrega"
            onChange={(e) => set("lesson", e.target.value)}
          />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <Label>Fotos da visita</Label>
        <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
      </label>
      <div className="flex flex-wrap justify-between gap-2 pt-1">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            className="text-negative"
            onClick={() => void remove()}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {f.done ? "Salvar visita" : "Agendar"}
          </Button>
        </div>
      </div>
    </SubmitForm>
  );
}
