import { Camera, CalendarPlus, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { useBRL } from "@/lib/hidden-values";
import { openDocument } from "@/lib/work-data";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABEL,
  CLAIM_STATUS_LABEL,
  EVALUATION_LABEL,
  OUTCOME_LABEL,
  PHASE_LABEL,
  claimCode,
  claimSla,
  claimStatus,
  finalInspectionDate,
  repeatIndex,
  slaLabel,
  warrantyState,
  type ClaimStatus,
  type Evaluation,
  type SlaState,
  type WarrantyPhase,
} from "@/lib/warranty";
import {
  executorNameOf,
  stageNameOf,
  type Warranty,
  type WarrantyClaim,
  type WarrantyData,
  type WarrantyVisit,
} from "@/lib/warranty-data";

const PHASE_VARIANT: Record<WarrantyPhase, BadgeProps["variant"]> = {
  ativa: "positive",
  vencendo: "alert",
  encerrada: "neutral",
  futura: "info",
};
const PHASE_BAR: Record<WarrantyPhase, string> = {
  ativa: "bg-primary",
  vencendo: "bg-gold",
  encerrada: "bg-muted-foreground/40",
  futura: "bg-primary/50",
};
const STATUS_VARIANT: Record<ClaimStatus, BadgeProps["variant"]> = {
  aberto: "alert",
  agendado: "info",
  em_atendimento: "info",
  resolvido: "positive",
  nao_coberto: "neutral",
};
const SLA_VARIANT: Record<SlaState, BadgeProps["variant"]> = {
  no_prazo: "positive",
  fora_do_prazo: "negative",
  cumprido: "positive",
  atrasou: "alert",
  nao_conta: "neutral",
};

/** Barra do prazo: % já passado e, opcionalmente, a marca da vistoria final. */
export function WarrantyBar({
  warranty,
  today,
  marker = false,
}: {
  warranty: Warranty;
  today: string;
  marker?: boolean;
}) {
  const s = warrantyState(warranty, today);
  const inspection = finalInspectionDate(warranty);
  const at = Math.max(
    0,
    Math.min(
      100,
      ((Date.parse(inspection) - Date.parse(warranty.start_date)) /
        Math.max(1, Date.parse(warranty.end_date) - Date.parse(warranty.start_date))) *
        100,
    ),
  );
  return (
    <div
      className="relative h-2.5 rounded-full bg-muted"
      role="img"
      aria-label={`${s.elapsed}% do prazo da garantia já passou`}
    >
      <div
        className={cn("h-full rounded-full", PHASE_BAR[s.phase])}
        style={{ width: `${s.elapsed}%` }}
      />
      {marker && (
        <span
          aria-hidden="true"
          className="absolute -top-1 h-[18px] w-1 rounded bg-gold"
          style={{ left: `calc(${at}% - 2px)` }}
        />
      )}
    </div>
  );
}

export function PhaseBadge({ warranty, today }: { warranty: Warranty; today: string }) {
  const s = warrantyState(warranty, today);
  return (
    <Badge variant={PHASE_VARIANT[s.phase]} className="whitespace-nowrap">
      {PHASE_LABEL[s.phase]}
    </Badge>
  );
}

/** Um chamado com avaliação, prazo de atendimento, visitas e ações. */
export function ClaimCard({
  claim,
  data,
  today,
  canSeeCosts,
  costs,
  showWork,
  onEdit,
  onVisit,
  highlight = false,
}: {
  claim: WarrantyClaim;
  data: WarrantyData;
  today: string;
  canSeeCosts: boolean;
  costs: Map<string, number>;
  /** Nome da obra na linha de detalhes (lista do menu). */
  showWork?: string | undefined;
  onEdit: () => void;
  onVisit: (v: Partial<WarrantyVisit> & { claim_id: string }) => void;
  highlight?: boolean;
}) {
  const brl = useBRL();
  const visits = data.visits.filter((v) => v.claim_id === claim.id);
  const status = claimStatus(claim, data.visits);
  const sla = claimSla(claim, data.visits, today);
  const nth = repeatIndex(claim, data.claims);
  const stageName = stageNameOf(data);
  const executor = executorNameOf(data)(claim.executor_kind, claim.executor_id);
  const workStage = data.workStages.find((s) => s.id === claim.work_stage_id)?.name;
  const cost = costs.get(claim.id) ?? 0;
  const person = (v: WarrantyVisit) =>
    (v.person_id && data.people.find((p) => p.id === v.person_id)?.name) || v.responsible;
  const open = status !== "resolvido" && status !== "nao_coberto";
  return (
    <article className={cn("space-y-3 px-4 py-4 sm:px-5", highlight && "bg-primary-soft/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground num">
          {claimCode(claim.number)}
        </span>
        <Badge variant={STATUS_VARIANT[status]}>{CLAIM_STATUS_LABEL[status]}</Badge>
        {sla.state !== "nao_conta" && (sla.state !== "cumprido" || open) && (
          <Badge variant={SLA_VARIANT[sla.state]}>{slaLabel(sla)}</Badge>
        )}
        <Badge variant="outline">{stageName(claim.stage_id)}</Badge>
        {nth > 1 && <Badge variant="alert">Repetiu: {nth}ª vez nesta etapa</Badge>}
        {canSeeCosts && cost > 0 && (
          <span className="ml-auto text-sm font-semibold num">{brl(cost)}</span>
        )}
      </div>
      <div>
        <h3 className="whitespace-pre-line text-[15px] font-semibold leading-snug">
          {claim.description}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[
            showWork,
            `Avisado em ${fmtDate(claim.reported_at)} (${CHANNEL_LABEL[claim.channel] ?? claim.channel}${
              claim.reported_by ? ` · ${claim.reported_by}` : ""
            })`,
            workStage && `Etapa da obra: ${workStage}`,
            `Executado por: ${executor}`,
            EVALUATION_LABEL[claim.evaluation as Evaluation],
            claim.resolved_at && `Resolvido em ${fmtDate(claim.resolved_at)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {claim.lesson && (
          <p className="mt-1 text-xs font-medium text-alert">Lição: {claim.lesson}</p>
        )}
      </div>
      {visits.length > 0 && (
        <ol className="ml-1.5 space-y-2.5 border-l-2 border-border pl-4">
          {visits.map((v, i) => (
            <li key={v.id} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2",
                  !v.done
                    ? "border-primary bg-card"
                    : v.outcome === "resolvido"
                      ? "border-positive bg-positive"
                      : "border-primary bg-primary",
                )}
              />
              <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold">
                Visita {i + 1} · {fmtDate(v.visit_date)}
                <span className="font-normal text-muted-foreground">
                  {v.done ? (OUTCOME_LABEL[v.outcome ?? ""] ?? "Feita") : "Agendada"}
                  {person(v) ? ` · ${person(v)}` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => onVisit(v)}
                >
                  {v.done ? "Editar" : "Registrar resultado"}
                </button>
              </div>
              {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
              {v.photo_paths.length > 0 && <Photos paths={v.photo_paths} />}
            </li>
          ))}
        </ol>
      )}
      {claim.photo_paths.length > 0 && <Photos paths={claim.photo_paths} label="Fotos do aviso" />}
      <div className="flex flex-wrap gap-2">
        {open && (
          <Button
            type="button"
            size="sm"
            onClick={() => onVisit({ claim_id: claim.id, done: false, visit_date: today })}
          >
            <CalendarPlus className="h-4 w-4" />
            Agendar visita
          </Button>
        )}
        {open && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onVisit({ claim_id: claim.id, done: true, visit_date: today })}
          >
            <ShieldCheck className="h-4 w-4" />
            Registrar visita feita
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Editar chamado
        </Button>
      </div>
    </article>
  );
}

function Photos({ paths, label = "Fotos" }: { paths: string[]; label?: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <Camera className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">{label}:</span>
      {paths.map((p, i) => (
        <button
          key={p}
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => openDocument(p).catch((e) => toast.error((e as Error).message))}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
