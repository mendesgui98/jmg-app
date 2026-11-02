import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarDays, CalendarPlus, FileDown, LockKeyhole, History } from "lucide-react";
import { IconBubble } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Memo, selectClass } from "./fields";
import { text } from "@/lib/form-values";
import { ScaledSheets } from "./schedule-sheets";
import { useWorkSheetProps } from "@/hooks/use-work-sheet-props";
import { scheduleVersionsOptions } from "@/lib/work-data";
import { snapshotStages, calendarDays, type ScheduleStage } from "@/lib/work-schedule";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtStamp } from "@/lib/format";
import { useMe } from "@/hooks/use-me";
export function SchedulePlanning({
  workId,
  work,
  stages,
  notes,
  linkedBudgetId,
  onChange,
  onSelect,
}: {
  workId: string;
  work: { name: string; address: string | null; linked_budget_id: string | null };
  stages: ScheduleStage[];
  notes: string | null;
  linkedBudgetId: string | null;
  onChange: () => void;
  onSelect: (id: string) => void;
}) {
  const { data: versions = [], error } = useQuery(scheduleVersionsOptions(workId));
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [selected, setSelected] = useState("current"),
    [dialog, setDialog] = useState(false),
    [busy, setBusy] = useState(false);
  const base = versions[0];
  const v = versions.find((x) => String(x.version) === selected);
  const shown = v ? snapshotStages(v.stages) : stages;
  const original = base ? snapshotStages(base.stages) : [];
  const sheet = useWorkSheetProps({ workId, work, stages: shown, version: v?.version });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["schedule-versions", workId] });
    onChange();
  };
  async function action(kind: "import" | "approve") {
    setBusy(true);
    try {
      const r =
        kind === "import"
          ? await supabase.rpc("import_work_schedule", { _work_id: workId })
          : await supabase.rpc("approve_work_schedule", { _work_id: workId });
      if (r.error) throw r.error;
      refresh();
      setDialog(false);
      toast.success(
        kind === "import" ? "Escopo importado sem recadastro." : "Cronograma original preservado.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={cn(panelClass, "space-y-4 p-4 sm:p-5")}>
      {error && (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconBubble icon={CalendarDays} tone="brand" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Planejamento da obra</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {base
                ? `Original preservado em ${fmtStamp(base.created_at)} · ${versions.length} versões`
                : "Planejamento em elaboração · original ainda não aprovado"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {me?.canSeeCosts && linkedBudgetId && (
            <Button variant="outline" disabled={busy} onClick={() => action("import")}>
              <CalendarPlus className="h-4 w-4" />
              Criar Cronograma da Obra
            </Button>
          )}
          {me?.canSeeCosts && !base && (
            <Button variant="outline" disabled={busy} onClick={() => setDialog(true)}>
              <LockKeyhole className="h-4 w-4" />
              Aprovar cronograma original
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link
              to="/obras/$id/cronograma/pdf"
              params={{ id: workId }}
              search={v ? { version: v.version } : {}}
            >
              <FileDown className="h-4 w-4" />
              Gerar Cronograma
            </Link>
          </Button>
        </div>
      </div>
      <label className="block max-w-sm text-sm">
        Versão
        <select
          aria-label="Versão do cronograma"
          className={selectClass}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="current">Cronograma Atual</option>
          {versions.map((x) => (
            <option key={x.id} value={x.version}>
              {x.version === 1 ? "Cronograma Original" : `Reprogramação ${x.version - 1}`} ·{" "}
              {fmtStamp(x.created_at)}
            </option>
          ))}
        </select>
      </label>
      {/* Mesma visualização do cronograma enviado ao cliente (folhas de 10 semanas). */}
      <ScaledSheets {...sheet} onSelect={selected === "current" ? onSelect : undefined} />
      {base && (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Etapa</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Original</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Atual</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Duração atual</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const o = original.find((x) => x.id === s.id);
                return (
                  <tr className="border-t border-border/60" key={s.id}>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {o
                        ? `${fmtDate(o.planned_start)} → ${fmtDate(o.planned_end)}`
                        : "Incluída depois do original"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {fmtDate(s.planned_start)} → {fmtDate(s.planned_end)}
                    </td>
                    <td className="px-3 py-2">
                      {calendarDays(s.planned_start, s.planned_end) ?? "—"} dias
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form
        key={selected}
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const d = new FormData(e.currentTarget);
          const r = await supabase
            .from("work_registry")
            .update({ schedule_notes: text(d, "notes"), schedule_change_reason: text(d, "reason") })
            .eq("id", workId);
          setBusy(false);
          if (r.error) toast.error(r.error.message);
          else {
            refresh();
            toast.success("Observações salvas.");
          }
        }}
      >
        <Memo name="notes" label="Observações gerais do cronograma" value={v?.notes ?? notes} />
        {me?.canSeeCosts && selected === "current" && (
          <>
            {base && <Memo name="reason" label="Motivo da alteração" />}
            <Button type="submit" variant="outline" disabled={busy}>
              Salvar observações
            </Button>
          </>
        )}
      </form>
      {versions.length > 1 && (
        <details className="rounded-xl bg-muted/40 px-4 py-3 text-xs">
          <summary className="flex min-h-8 cursor-pointer items-center gap-2 font-medium">
            <History className="h-4 w-4" />
            Histórico de reprogramações
          </summary>
          <ul className="mt-2 divide-y divide-border/60">
            {versions.slice(1).map((x) => (
              <li key={x.id} className="py-3">
                <strong>
                  Versão {x.version} · {new Date(x.created_at).toLocaleString("pt-BR")}
                </strong>
                <p>{x.reason}</p>
                <p className="text-muted-foreground">
                  {x.created_by === me?.id ? me.name : "Autoria registrada"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar cronograma original</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Este planejamento ficará preservado. Alterações posteriores serão registradas como
            reprogramações.
          </p>
          <Button disabled={busy} onClick={() => action("approve")}>
            Confirmar original
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
