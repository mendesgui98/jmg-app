import { businessDate } from "@/lib/dashboard-math";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { commitOnEnter } from "@/lib/enter-submit";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Field, Memo, selectClass } from "./fields";
import { text, number } from "@/lib/form-values";
import { weightedProgress } from "@/lib/operations";
import { physicalProgress } from "@/lib/work-progress";
import { calendarDays, endFromDuration } from "@/lib/work-schedule";
import { scheduleVersionsOptions } from "@/lib/work-data";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SchedulePlanning } from "./schedule-planning";
import { ClientMaterials } from "./client-materials";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stageStatus } from "@/lib/work-progress";
import { uploadDocument } from "@/lib/work-data";
import { useMe } from "@/hooks/use-me";
import { useRecordFocus } from "@/hooks/use-record-focus";
import { fmtDate, fmtStamp, fmtNum } from "@/lib/format";
import {
  AlertTriangle,
  Plus,
  Pencil,
  Camera,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Layers,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { STAGE_STATUS_VARIANT } from "@/lib/status-badges";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { StagePhotos } from "./photos";
import { StageServicesPanel } from "./stage-services";
import {
  saveStageValues,
  stageServicesOptions,
  stageValuesOptions,
} from "@/lib/stage-services-data";
import { MoneyInput } from "@/components/money-input";
import { parseBRL } from "@/lib/money";
import { fmtBRL } from "@/lib/format";
import { stagesOptions } from "@/lib/budget-api";
import { Input } from "@/components/ui/input";
import { servicesProgress } from "@/lib/work-progress";
import { stageLabels } from "@/lib/stage-labels";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
type Stage = Database["public"]["Tables"]["work_stages"]["Row"];
type RecordRow = Database["public"]["Tables"]["work_records"]["Row"];
export function Schedule({
  workId,
  stages,
  records = [],
  onChange,
  mode = "etapas",
  work,
}: {
  workId: string;
  stages: Stage[];
  records?: RecordRow[];
  onChange: () => void;
  mode?: "etapas" | "cronograma";
  work?: Database["public"]["Tables"]["work_registry"]["Row"];
}) {
  const selected = useRecordFocus(stages);
  const qc = useQueryClient();
  const { data: versions = [] } = useQuery(scheduleVersionsOptions(workId));
  const versioned = versions.length > 0;
  const { data: opening } = useQuery({
    queryKey: ["work-opening-progress", workId],
    queryFn: async () => {
      const r = await supabase
        .from("work_openings")
        .select("progress")
        .eq("work_id", workId)
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const [ordering, setOrdering] = useState<string[] | null>(null);
  const [orderReason, setOrderReason] = useState("");
  const [plannedStart, setPlannedStart] = useState(""),
    [plannedEnd, setPlannedEnd] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["schedule-versions", workId] });
    onChange();
  };
  const beginEdit = (s: Stage | null) => {
    setEditing(s);
    setCreating(!s);
    setPlannedStart(s?.planned_start || "");
    setPlannedEnd(s?.planned_end || "");
  };
  async function reorder() {
    if (!ordering) return;
    setBusy(true);
    const r = await supabase.rpc("reorder_work_schedule", {
      _work_id: workId,
      _ids: ordering,
      _reason: orderReason,
    });
    setBusy(false);
    if (r.error) toast.error(r.error.message);
    else {
      setOrdering(null);
      setOrderReason("");
      refresh();
      toast.success("Ordem atualizada.");
    }
  }
  const [removing, setRemoving] = useState<Stage | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [editing, setEditing] = useState<Stage | null>(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false);
  const { data: me } = useMe();
  const { data: services = [] } = useQuery({
    ...stageServicesOptions(workId),
    enabled: !!me?.canSeeCosts,
  });
  const { data: stageValues = [] } = useQuery({
    ...stageValuesOptions(workId),
    enabled: !!me?.canSeeCosts,
  });
  // Etapa com serviços tem o avanço calculado por eles (ponderado pelo valor).
  const computed = (id: string) => servicesProgress(services.filter((x) => x.stage_id === id));
  const w = weightedProgress(stages),
    today = businessDate();
  async function quick(stage: Stage, value: string) {
    const progress = Number(value);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      toast.error("Informe um avanço entre 0 e 100%.");
      return;
    }
    if (progress === stage.progress) return;
    const r = await supabase
      .from("work_stages")
      .update({
        progress,
        status:
          progress === 100
            ? "concluido"
            : stage.status === "pausado"
              ? "pausado"
              : progress > 0
                ? "andamento"
                : "nao_iniciado",
      })
      .eq("id", stage.id);
    if (r.error) toast.error(r.error.message);
    else {
      refresh();
      toast.success("Avanço atualizado.");
    }
  }
  async function save(d: FormData) {
    setBusy(true);
    try {
      const fromServices = editing && !creating ? computed(editing.id) : null;
      const progress = fromServices ?? number(d, "progress"),
        weight = number(d, "weight");
      if (progress > 100 || weight > 100) throw Error("Percentuais devem estar entre 0 e 100%.");
      const payload = {
        work_id: workId,
        name: stageName(d),
        responsible: text(d, "responsible"),
        planned_start: text(d, "planned_start") || null,
        planned_end: text(d, "planned_end") || null,
        actual_start: text(d, "actual_start") || null,
        actual_end: text(d, "actual_end") || null,
        dependency_id: text(d, "dependency") || null,
        weight,
        progress,
        status: progress === 100 ? "concluido" : text(d, "status"),
        observations: text(d, "observations"),
        pending_services: text(d, "pending"),
        executed_services: text(d, "executed"),
        next_services: text(d, "next"),
        schedule_change_reason: text(d, "reason"),
      };
      const r =
        editing && !creating
          ? await supabase
              .from("work_stages")
              .update(payload)
              .eq("id", editing.id)
              .select("id")
              .single()
          : await supabase
              .from("work_stages")
              .insert({ ...payload, sort: Math.max(-1, ...stages.map((s) => s.sort)) + 1 })
              .select("id")
              .single();
      if (r.error) throw r.error;
      // Valor da etapa e dos materiais (custo): só sem serviços, que senão já somam o previsto.
      if (
        me?.canSeeCosts &&
        !services.some((x) => x.stage_id === r.data.id) &&
        d.has("labor_planned")
      )
        await saveStageValues(workId, r.data.id, {
          labor_planned: parseBRL(text(d, "labor_planned")),
          material_planned: parseBRL(text(d, "material_planned")),
        });
      qc.invalidateQueries({ queryKey: ["stage-values", workId] });
      const files = d.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
      for (const f of files) {
        if (!f.type.startsWith("image/")) throw Error("Anexe somente imagens às etapas.");
        const path = await uploadDocument(f, `records/${workId}`);
        const photo = await supabase.from("work_records").insert({
          work_id: workId,
          stage_id: r.data.id,
          kind: "diario",
          title: `Avanço · ${payload.name}`,
          record_date: text(d, "photo_date") || today,
          body: payload.observations,
          next_steps: payload.next_services,
          status: "andamento",
          responsible: me?.name || payload.responsible,
          file_path: path,
          caption: text(d, "caption") || `${payload.name} — ${fmtNum(progress)}%`,
        });
        if (photo.error) throw photo.error;
      }
      setEditing(null);
      setCreating(false);
      refresh();
      toast.success("Etapa salva.");
    } catch (e) {
      refresh();
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <section className="space-y-4">
      {mode === "cronograma" && work && (
        <SchedulePlanning
          workId={workId}
          work={work}
          stages={stages}
          notes={work.schedule_notes}
          linkedBudgetId={work.linked_budget_id}
          onChange={refresh}
          onSelect={(id) => {
            const s = stages.find((s) => s.id === id);
            if (s) beginEdit(s);
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {mode === "cronograma" ? "Cronograma" : "Etapas"} · Avanço físico{" "}
            {fmtNum(physicalProgress(stages, opening?.progress ?? 0))}%
          </h2>
          <p className={`text-sm ${w.valid ? "text-muted-foreground" : "text-alert"}`}>
            Avanço distribuído: {fmtNum(w.weightSum)}%
            {!w.valid ? " · a soma das etapas precisa dar 100%" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOrdering(stages.map((s) => s.id))}>
            <ArrowUp className="h-4 w-4" />
            Ordenar etapas
          </Button>
          <Button variant="outline" onClick={() => beginEdit(null)}>
            <Plus className="h-4 w-4" />
            Nova etapa
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {stages.map((s) => {
          const state = stageStatus(s, today);
          return (
            <article
              key={s.id}
              id={`record-${s.id}`}
              className={cn(
                panelClass,
                "scroll-mt-6 p-4 sm:p-5",
                selected === s.id && "bg-accent/40 ring-2 ring-primary/50",
              )}
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="link"
                      className="h-auto whitespace-normal p-0 text-left text-base font-semibold text-foreground hover:text-primary"
                      onClick={() => beginEdit(s)}
                    >
                      {s.name}
                    </Button>
                    <Badge variant={STAGE_STATUS_VARIANT[state] ?? "neutral"}>
                      {stageLabels[state]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.responsible || "Sem responsável"} · Avanço: vale {fmtNum(s.weight)}% da obra
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(s.planned_start)} → {fmtDate(s.planned_end)} ·{" "}
                    {calendarDays(s.planned_start, s.planned_end) ?? "—"} dias
                  </p>
                  {mode === "cronograma" && (
                    <p className="text-xs text-muted-foreground">
                      Real: {fmtDate(s.actual_start)} → {fmtDate(s.actual_end)}
                      {s.dependency_id
                        ? ` · Após ${stages.find((x) => x.id === s.dependency_id)?.name}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {computed(s.id) !== null ? (
                    <span
                      className="text-sm font-semibold num"
                      title="Calculado pelos serviços da etapa"
                      aria-label={`Avanço ${s.name}`}
                    >
                      {fmtNum(s.progress)}%
                    </span>
                  ) : (
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        key={`${s.id}-${s.progress}`}
                        aria-label={`Avanço ${s.name}`}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        defaultValue={s.progress}
                        onBlur={(e) => quick(s, e.target.value)}
                        onKeyDown={commitOnEnter}
                        className="h-10 w-20 rounded-lg border border-input bg-background px-2 text-right num"
                      />
                      %
                    </label>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${s.name}`}
                    title="Detalhar etapa"
                    onClick={() => beginEdit(s)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {me?.canSeeCosts && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Duplicar ${s.name}`}
                        title="Duplicar etapa"
                        onClick={() => {
                          beginEdit({
                            ...s,
                            id: crypto.randomUUID(),
                            name: s.name + " · cópia",
                            progress: 0,
                            status: "nao_iniciado",
                            actual_start: null,
                            actual_end: null,
                          });
                          setCreating(true);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="danger"
                        aria-label={`Excluir ${s.name}`}
                        title="Excluir etapa"
                        onClick={() => {
                          setRemoving(s);
                          setRemoveReason("");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {mode === "etapas" && me?.canSeeCosts ? (
                <StageServicesPanel workId={workId} stage={s} onChange={refresh} />
              ) : (
                <progress
                  max="100"
                  value={s.progress}
                  className="mt-3 h-1.5 w-full accent-primary"
                />
              )}
              {s.scope_services && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {s.scope_services}
                </p>
              )}
              {s.pending_services && (
                <p className="mt-3 flex gap-2 whitespace-pre-wrap rounded-xl bg-alert-soft px-3 py-2 text-sm text-alert">
                  <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">Pendências: {s.pending_services}</span>
                </p>
              )}
            </article>
          );
        })}
      </div>
      {!stages.length && (
        <EmptyState
          compact
          icon={Layers}
          title="Nenhuma etapa cadastrada"
          description="Cadastre as etapas para acompanhar o avanço físico."
        />
      )}
      <Dialog
        open={!!editing || creating}
        onOpenChange={(v) => {
          if (!v) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.name || "Nova etapa"}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save(new FormData(e.currentTarget));
            }}
          >
            <StageNameField
              key={editing?.id ?? "nova"}
              current={editing?.name ?? ""}
              used={stages.filter((x) => x.id !== editing?.id).map((x) => x.name)}
            />
            <Field name="responsible" label="Responsável" value={editing?.responsible} />
            <label className="text-sm">
              Status
              <select
                name="status"
                className={selectClass}
                defaultValue={editing ? stageStatus(editing, today) : "nao_iniciado"}
              >
                {Object.entries(stageLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <Field
              name="progress"
              type="number"
              label="Percentual concluído (%)"
              value={editing?.progress ?? 0}
            />
            <Field
              name="weight"
              type="number"
              label="Avanço (% da obra)"
              value={editing?.weight ?? (stages.length ? 0 : 100)}
            />
            {me?.canSeeCosts && (
              <StageCostFields
                stage={editing}
                creating={creating}
                services={services}
                values={stageValues}
              />
            )}
            <label className="text-sm">
              Início previsto
              <input
                name="planned_start"
                aria-label="Início previsto"
                type="date"
                className={selectClass}
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Término previsto
              <input
                name="planned_end"
                aria-label="Término previsto"
                type="date"
                className={selectClass}
                min={plannedStart || undefined}
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Quantidade de dias prevista
              <input
                aria-label="Quantidade de dias prevista"
                type="number"
                min="1"
                step="1"
                className={selectClass}
                value={calendarDays(plannedStart, plannedEnd) ?? ""}
                onChange={(e) =>
                  setPlannedEnd(endFromDuration(plannedStart, Number(e.target.value)))
                }
              />
            </label>
            <Field
              name="actual_start"
              type="date"
              label="Início real"
              value={editing?.actual_start}
            />
            <Field name="actual_end" type="date" label="Término real" value={editing?.actual_end} />
            <label className="text-sm">
              Dependência
              <select
                name="dependency"
                className={selectClass}
                defaultValue={editing?.dependency_id ?? ""}
              >
                <option value="">Nenhuma</option>
                {stages
                  .filter((s) => s.id !== editing?.id)
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Memo name="observations" label="Observações" value={editing?.observations} />
            </div>
            <Memo name="pending" label="Pendências" value={editing?.pending_services} />
            <Memo name="executed" label="Serviços executados" value={editing?.executed_services} />
            <div className="sm:col-span-2">
              <Memo name="next" label="Próximos serviços" value={editing?.next_services} />
            </div>
            <label className="block space-y-2 text-sm sm:col-span-2">
              <span className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Fotos da etapa
              </span>
              <input
                name="photos"
                type="file"
                accept="image/*"
                multiple
                className="block w-full text-sm"
              />
            </label>
            <Field name="photo_date" label="Data das fotos" type="date" value={today} />
            <Field name="caption" label="Legenda das fotos" />
            {versioned && (
              <div className="sm:col-span-2">
                <Memo name="reason" label="Motivo da reprogramação (ao alterar planejamento)" />
              </div>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar etapa"}
            </Button>
          </form>
          {editing && (
            <>
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Atualizada em {fmtStamp(editing.updated_at)} ·{" "}
                {editing.updated_by === me?.id
                  ? me.name
                  : editing.responsible || "Autor registrado no histórico"}
              </p>
              <StagePhotos
                records={records.filter((r) => r.stage_id === editing.id)}
                stages={stages}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!ordering}
        onOpenChange={(v) => {
          if (!v) setOrdering(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ordem das etapas</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 divide-y overflow-y-auto">
            {ordering?.map((id, i) => {
              const s = stages.find((s) => s.id === id);
              return (
                <div key={id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 text-sm">{s?.name}</span>
                  {[-1, 1].map((delta) => (
                    <Button
                      key={delta}
                      size="icon"
                      variant="ghost"
                      aria-label={`${delta < 0 ? "Subir" : "Descer"} ${s?.name}`}
                      disabled={i + delta < 0 || i + delta >= ordering.length}
                      onClick={() => {
                        const next = [...ordering];
                        const other = next[i + delta];
                        if (other) {
                          next[i + delta] = id;
                          next[i] = other;
                          setOrdering(next);
                        }
                      }}
                    >
                      {delta < 0 ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </Button>
                  ))}
                </div>
              );
            })}
          </div>
          {versioned && (
            <label className="text-sm">
              Motivo da reprogramação
              <input
                className={selectClass}
                value={orderReason}
                onChange={(e) => setOrderReason(e.target.value)}
              />
            </label>
          )}
          <Button disabled={busy} onClick={reorder}>
            Salvar ordem
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(v) => {
          if (!v) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir etapa</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Excluir {removing?.name}? O histórico será preservado. Etapas com registros ou
            dependências não serão excluídas.
          </p>
          {versioned && (
            <label className="text-sm">
              Motivo da exclusão
              <input
                className={selectClass}
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
              />
            </label>
          )}
          <Button
            disabled={busy}
            variant="destructive"
            onClick={async () => {
              if (!removing) return;
              setBusy(true);
              const r = await supabase.rpc("remove_schedule_stage", {
                _id: removing.id,
                _reason: removeReason,
              });
              setBusy(false);
              if (r.error) toast.error(r.error.message);
              else {
                setRemoving(null);
                refresh();
              }
            }}
          >
            Confirmar exclusão
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
  if (mode !== "cronograma") return content;
  // Cronograma: planejamento e etapas numa aba; entregas de material do cliente na outra.
  return (
    <Tabs defaultValue="cronograma" className="space-y-4">
      <TabsList>
        <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
        <TabsTrigger value="materiais">Materiais do cliente</TabsTrigger>
      </TabsList>
      <TabsContent value="cronograma">{content}</TabsContent>
      <TabsContent value="materiais">
        <ClientMaterials workId={workId} stages={stages} />
      </TabsContent>
    </Tabs>
  );
}

const OTHER_STAGE = "__outra";
/** Nome escolhido na lista de etapas cadastradas ou digitado em "Outra etapa". */
function stageName(d: FormData) {
  const choice = text(d, "name_choice");
  const name = (choice === OTHER_STAGE ? text(d, "name_custom") : choice).trim();
  if (!name) throw Error("Escolha a etapa ou digite o nome.");
  return name;
}

function StageNameField({ current, used }: { current: string; used: string[] }) {
  const { data: catalog = [] } = useQuery(stagesOptions);
  const active = catalog.filter((c) => c.active || c.name === current);
  const inCatalog = !current || active.some((c) => c.name === current);
  const [choice, setChoice] = useState(inCatalog ? current : OTHER_STAGE);
  return (
    <div className="space-y-1 text-sm">
      <label className="block">
        Etapa
        <select
          name="name_choice"
          required
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={selectClass}
        >
          <option value="">Selecione a etapa</option>
          {active.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
              {used.includes(c.name) ? " (já nesta obra)" : ""}
            </option>
          ))}
          <option value={OTHER_STAGE}>Outra etapa (digitar)</option>
        </select>
      </label>
      {choice === OTHER_STAGE && (
        <Input
          name="name_custom"
          aria-label="Nome da etapa"
          placeholder="Nome da etapa"
          defaultValue={inCatalog ? "" : current}
          required
          autoFocus
        />
      )}
    </div>
  );
}

/** Custo previsto da etapa no formulário: mão de obra/serviço e materiais, em reais. */
function StageCostFields({
  stage,
  creating,
  services,
  values,
}: {
  stage: Stage | null;
  creating: boolean;
  services: { stage_id: string; labor_planned: number; material_planned: number }[];
  values: { stage_id: string; labor_planned: number; material_planned: number }[];
}) {
  const own = stage && !creating ? services.filter((s) => s.stage_id === stage.id) : [];
  const typed = stage && !creating ? values.find((v) => v.stage_id === stage.id) : undefined;
  if (own.length)
    return (
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Valor da etapa {fmtBRL(own.reduce((t, s) => t + s.labor_planned, 0))} · materiais{" "}
        {fmtBRL(own.reduce((t, s) => t + s.material_planned, 0))} — soma dos serviços da etapa.
      </p>
    );
  return (
    <>
      <label className="block space-y-1 text-sm">
        <span>Valor da etapa (mão de obra / serviço)</span>
        <MoneyInput
          key={`l-${stage?.id ?? "nova"}-${typed?.labor_planned ?? 0}`}
          name="labor_planned"
          aria-label="Valor da etapa"
          value={typed?.labor_planned}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Valor dos materiais da etapa</span>
        <MoneyInput
          key={`m-${stage?.id ?? "nova"}-${typed?.material_planned ?? 0}`}
          name="material_planned"
          aria-label="Valor dos materiais"
          value={typed?.material_planned}
        />
      </label>
    </>
  );
}
