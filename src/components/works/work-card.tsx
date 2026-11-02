import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, MapPin, User, Wallet } from "lucide-react";
import type { WorkSummary } from "@/lib/dashboard-data";
import { marginBaseLabel, targetMargin } from "@/lib/pricing";
import { progressAttention } from "@/lib/work-progress";
import { businessDate } from "@/lib/dashboard-math";
import {
  STAGE_STATE_LABEL,
  nextStage,
  receiptPace,
  stageTimeline,
  type StageState,
} from "@/lib/panel-insights";
import { fmtNum } from "@/lib/format";
import { useBRL } from "@/lib/hidden-values";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/kpi";
import { cn } from "@/lib/utils";
import { WORK_STATUS_LABEL, workStatusLabel } from "@/lib/work-status";

const STAGE_TONE: Record<StageState, string> = {
  concluida: "bg-primary",
  andamento: "bg-gold",
  atrasada: "bg-negative",
  afazer: "bg-muted-foreground/25",
};

/**
 * Card de uma obra no Painel: valor, recebido, resultado e custo realizado já calculados em
 * dashboard-data; os percentuais vêm de balance.financialProgress e progressAttention, a linha do
 * tempo das etapas de stageTimeline. Faixa azul com a situação e o anel de avanço físico; atalhos
 * para cronograma, financeiro e a obra.
 */
export function WorkCard({ s }: { s: WorkSummary }) {
  const brl = useBRL();
  const unconfirmed = s.work.origin === "direto" && !s.result.estimateConfirmed;
  const { consumed } = progressAttention(
    s.progress,
    s.balance.financialProgress,
    s.incurred,
    unconfirmed ? null : s.result.cost,
  );
  const progress = Math.min(100, Math.max(0, s.progress));
  const minMargin = Number(s.budget.params?.min_margin) || 0;
  const timeline = stageTimeline(s.stages, businessDate());
  const next = nextStage(timeline);
  const pace = receiptPace(s.progress, s.balance.financialProgress);
  // Margem na mesma base da mínima do orçamento (sobre a mão de obra nos orçamentos novos).
  const margin = targetMargin(s.budget.params, s.result);
  const lowMargin = !unconfirmed && s.result.sale > 0 && minMargin > 0 && margin * 100 < minMargin;
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card transition-shadow hover:shadow-elevated">
      <div className="flex items-start justify-between gap-2 bg-gradient-to-br from-hero to-hero-end px-5 py-4 text-hero-foreground">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
            {WORK_STATUS_LABEL[s.work.status] ?? s.work.status}
          </span>
          {lowMargin && (
            <span className="rounded-full bg-gold px-2.5 py-1 text-xs font-semibold text-hero-end">
              Margem {fmtNum(Math.round(margin * 1000) / 10)}%
            </span>
          )}
          {s.overdue > 0 && (
            <span className="rounded-full bg-negative px-2.5 py-1 text-xs font-semibold text-white">
              {brl(s.overdue)} vencido
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--gold) ${progress * 3.6}deg, rgba(255,255,255,.18) 0)`,
            }}
            aria-label={`Avanço ${fmtNum(s.progress)}%`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-hero-end text-xs font-bold num">
              {fmtNum(Math.round(s.progress))}%
            </span>
          </span>
          <span className="mt-0.5 text-[10px] text-hero-foreground/70">avanço</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <Link
          to="/obras/$id"
          params={{ id: s.work.id }}
          aria-label={`Abrir obra ${s.work.name}`}
          className="flex items-start justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="min-w-0">
            <h3 className="text-lg font-bold uppercase leading-tight tracking-tight break-words">
              {s.work.name}
            </h3>
            {(s.work.work_type || s.work.is_pilot) && (
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {[s.work.work_type, s.work.is_pilot ? "Obra de teste" : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <ChevronRight
            aria-hidden
            className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </Link>
        <div className="-mt-2 space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.client}</span>
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.work.address || "Local não informado"}</span>
          </p>
        </div>
        {timeline.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Etapas
            </p>
            <div className="flex gap-0.5" role="list" aria-label="Etapas da obra">
              {timeline.map((st) => (
                <span
                  key={st.id}
                  role="listitem"
                  title={`${st.name} · ${STAGE_STATE_LABEL[st.state]}`}
                  aria-label={`${st.name}: ${STAGE_STATE_LABEL[st.state]}`}
                  className={cn("h-2.5 min-w-1.5 rounded-sm", STAGE_TONE[st.state])}
                  style={{ flex: `${st.size} 1 0` }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {(Object.keys(STAGE_TONE) as StageState[]).map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <i className={cn("h-2 w-2 rounded-sm", STAGE_TONE[k])} />
                  {STAGE_STATE_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl bg-primary-soft p-3">
            <p className="text-[11px] font-semibold text-primary">Recebido do contrato</p>
            <p className="text-lg font-bold text-primary num">
              {fmtNum(Math.round(s.balance.financialProgress))}%
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {brl(s.totals.received)} de {brl(s.result.sale)}
            </p>
          </div>
          <div className="min-w-0 rounded-xl bg-gold-soft p-3">
            <p className="text-[11px] font-semibold text-alert">Resultado previsto</p>
            <p className="text-lg font-bold">
              {unconfirmed ? (
                <span className="text-sm text-muted-foreground">Não conferido</span>
              ) : (
                <Money value={s.result.result} tone="auto" />
              )}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {unconfirmed || s.result.sale <= 0
                ? "custo previsto pendente"
                : `margem ${fmtNum(Math.round(margin * 1000) / 10)}% ${marginBaseLabel(s.budget.params).replace("sobre a ", "s/ ")}`}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs">
          {s.result.sale > 0 && (
            <p className={cn("font-semibold", pace.behind ? "text-alert" : "text-positive")}>
              {pace.behind
                ? `Recebido ${fmtNum(pace.gap)} pontos atrás do avanço`
                : "Recebimento em dia com o avanço"}
            </p>
          )}
          <p className="text-muted-foreground">
            Custo realizado <b className="text-foreground">{brl(s.incurred)}</b>
            {consumed === null
              ? " · previsto não conferido"
              : ` · ${fmtNum(consumed)}% do previsto`}
          </p>
          {next && (
            <p className="flex flex-wrap gap-x-1.5 border-t border-border/60 pt-2 text-sm">
              <span className="text-muted-foreground">Próxima etapa</span>
              <b className={cn(next.state === "atrasada" && "text-negative")}>
                {next.name}
                {next.state === "atrasada" ? " · atrasada" : ""}
              </b>
            </p>
          )}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/obras/$id" params={{ id: s.work.id }} search={{ tab: "cronograma" }}>
              <CalendarDays className="h-4 w-4" />
              Cronograma
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/obras/$id" params={{ id: s.work.id }} search={{ tab: "financeiro" }}>
              <Wallet className="h-4 w-4" />
              Financeiro
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/obras/$id" params={{ id: s.work.id }}>
              Abrir obra
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
