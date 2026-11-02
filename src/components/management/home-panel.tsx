import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { targetMargin } from "@/lib/pricing";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CalendarX2,
  Filter,
  HardHat,
  Percent,
  Plus,
  Wallet,
} from "lucide-react";
import type { WorkSummary } from "@/lib/dashboard-data";
import { businessDate, inPeriod, periodRange } from "@/lib/dashboard-math";
import { attentionItems, lastRow, type AttentionKind } from "@/lib/dashboard-home";
import {
  indicatorTotal,
  type CompositionRow,
  type ExecutiveData,
  type ExecutiveFilter,
  type Indicator,
} from "@/lib/executive";
import { fmtDate, fmtNum } from "@/lib/format";
import { useBRL } from "@/lib/hidden-values";
import { lateStages } from "@/lib/schedule-dashboard";
import {
  cashProjection,
  commercialFunnel,
  delinquency,
  type FunnelStage,
} from "@/lib/business-indicators";
import {
  cashChart,
  followUps,
  marginRanking,
  weekAgenda,
  whatsappLink,
  type AgendaKind,
  type MarginTone,
} from "@/lib/panel-insights";
import { commercialOptions } from "@/lib/commercial-data";
import { WorkCard } from "@/components/works/work-card";
import { EmptyState } from "@/components/feedback";
import { Segmented } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/works/fields";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";

// Painel inicial (visão executiva): faixa de abertura (saudação, saldo em caixa com a linha dos
// meses, a receber, a pagar, valor em obras e resultado), filtros, "Precisa de você", próximos 7
// dias, Dinheiro (fluxo de caixa com a projeção e inadimplência), Obras (cards com a linha do tempo
// das etapas e margem por obra) e Comercial (funil, indicadores e follow-up). Os valores saem das
// mesmas composições dos detalhes (executive.ts) e dos módulos puros business-indicators.ts e
// panel-insights.ts, então cartão e detalhe não divergem.

type Compositions = Record<Indicator, CompositionRow[]>;

const PERIODS: [string, string][] = [
  ["mes", "Mês"],
  ["trimestre", "Trimestre"],
  ["ano", "Ano"],
  ["todos", "Todo o período"],
  ["personalizado", "Personalizado"],
];

function CompactFilters({ works }: { works: WorkSummary[] }) {
  const search = useSearch({ strict: false }) as ExecutiveFilter;
  const navigate = useNavigate();
  const target = useLocation().pathname === "/financeiro" ? "/financeiro" : "/painel";
  const set = (key: string, value: string | boolean) =>
    navigate({ to: target, search: (old: Record<string, unknown>) => ({ ...old, [key]: value }) });
  const period = search.period || "todos";
  const clients = [
    ...new Map(works.filter((s) => s.work.client_id).map((s) => [s.work.client_id, s])).values(),
  ];
  return (
    <div className={cn(panelClass, "mb-5 flex flex-wrap items-center gap-2 p-2.5")}>
      <Segmented>
        {PERIODS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={period === v}
            className={cn(
              segmentClass(period === v),
              period === v && "bg-foreground text-background hover:bg-foreground",
            )}
            onClick={() => set("period", v)}
          >
            {l}
          </button>
        ))}
      </Segmented>
      {period === "personalizado" && (
        <>
          <input
            aria-label="Data inicial"
            type="date"
            className={cn(selectClass, "h-9 w-auto")}
            value={search.from || ""}
            onChange={(e) => set("from", e.target.value)}
          />
          <input
            aria-label="Data final"
            type="date"
            className={cn(selectClass, "h-9 w-auto")}
            value={search.to || ""}
            onChange={(e) => set("to", e.target.value)}
          />
        </>
      )}
      <select
        aria-label="Filtro obra"
        className={cn(selectClass, "h-9 w-full py-1 text-sm sm:w-auto sm:max-w-48")}
        value={search.work || ""}
        onChange={(e) => set("work", e.target.value)}
      >
        <option value="">Todas as obras</option>
        {works.map((s) => (
          <option key={s.work.id} value={s.work.id}>
            {s.work.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtro cliente"
        className={cn(selectClass, "h-9 w-full py-1 text-sm sm:w-auto sm:max-w-48")}
        value={search.client || ""}
        onChange={(e) => set("client", e.target.value)}
      >
        <option value="">Todos os clientes</option>
        {clients.map((s) => (
          <option key={s.work.client_id} value={s.work.client_id ?? ""}>
            {s.client}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtro status"
        className={cn(selectClass, "h-9 w-full py-1 text-sm sm:w-auto sm:max-w-48")}
        value={search.status || ""}
        onChange={(e) => set("status", e.target.value)}
      >
        <option value="">Todos os status</option>
        <option value="contratacao">Em contratação</option>
        <option value="execucao">Em execução</option>
        <option value="pausada">Pausada</option>
        <option value="concluida">Concluída</option>
      </select>
      <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--primary)]"
          checked={search.pilot || false}
          onChange={(e) => set("pilot", e.target.checked)}
        />
        Incluir PILOTO — TESTE
      </label>
    </div>
  );
}

const ATTENTION_ICON: Record<AttentionKind, typeof Percent> = {
  vencido: CalendarX2,
  atraso: CalendarClock,
  margem: Percent,
  custo: AlertTriangle,
  cronograma: CalendarClock,
};
// Vermelho só para o grave; laranja pede atenção; azul é informação.
const ATTENTION_TONE: Record<AttentionKind, { box: string; icon: string }> = {
  vencido: { box: "bg-negative-soft", icon: "bg-negative text-white" },
  atraso: { box: "bg-negative-soft", icon: "bg-negative text-white" },
  margem: { box: "bg-gold-soft", icon: "bg-gold text-hero-end" },
  custo: { box: "bg-gold-soft", icon: "bg-gold text-hero-end" },
  cronograma: { box: "bg-primary-soft", icon: "bg-primary text-primary-foreground" },
};

/** Título de bloco do Painel com o quadradinho colorido. */
function SectionTitle({
  id,
  icon: Icon,
  tone,
  children,
  aside,
}: {
  id: string;
  icon: typeof Wallet;
  tone: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tone)}
        >
          <Icon className="h-5 w-5" />
        </span>
        <h2 id={id} className="text-xl font-bold tracking-tight">
          {children}
        </h2>
      </div>
      {aside}
    </div>
  );
}

export interface PanelHeroProps {
  title: string;
  subtitle: string;
  actions: ReactNode;
}

/**
 * Faixa de abertura: saudação e atalhos, saldo em caixa com a linha dos últimos meses, o que
 * entrou e saiu no período e quatro blocos (a receber, a pagar, valor em obras e resultado).
 */
function PanelHero({
  hero,
  compositions,
  cashNow,
  chart,
  activeCount,
  pctReceived,
  alertCount,
  onDetail,
}: {
  hero: PanelHeroProps;
  compositions: Compositions;
  /** Saldo de hoje: sempre todos os períodos (o filtro de período não muda o caixa de hoje). */
  cashNow: number;
  chart: ReturnType<typeof cashChart>;
  activeCount: number;
  pctReceived: number;
  alertCount: number;
  onDetail: (id: Indicator) => void;
}) {
  const brl = useBRL();
  const total = (id: Indicator) => indicatorTotal(compositions[id]);
  const cash = cashNow;
  const past = chart.months.filter((m) => !m.future);
  const prev = past.at(-2);
  const change = prev && cash !== null ? cash - prev.balance : null;
  const W = 360;
  const H = 64;
  const hi = Math.max(...past.map((m) => m.balance), 1);
  const lo = Math.min(...past.map((m) => m.balance), 0);
  const x = (i: number) => (past.length > 1 ? (i / (past.length - 1)) * (W - 10) + 5 : W / 2);
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  const line = past.map((m, i) => `${x(i).toFixed(1)},${y(m.balance).toFixed(1)}`).join(" ");
  const nextReceivable = [...compositions.receivable]
    .filter((r) => r.date)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
  const nextPayable = [...compositions.payable]
    .filter((r) => r.date)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
  const overduePayable = compositions.payable.filter((r) => (r.date ?? "") < businessDate()).length;
  const lastIn = lastRow(compositions.received);
  const tiles: {
    id: Indicator;
    label: string;
    value: number | null;
    hint: string;
    tag: string;
    tagClass: string;
  }[] = [
    {
      id: "receivable",
      label: "A receber",
      value: total("receivable"),
      hint: nextReceivable
        ? `próxima: ${brl(Math.abs(nextReceivable.amount ?? 0))} em ${fmtDate(nextReceivable.date)}`
        : "nenhuma parcela em aberto",
      tag: `${compositions.receivable.length} ${compositions.receivable.length === 1 ? "parcela" : "parcelas"}`,
      tagClass: "bg-[#8FB4FF] text-hero-end",
    },
    {
      id: "payable",
      label: "A pagar",
      value: total("payable") === null ? null : Math.abs(total("payable")!),
      hint: nextPayable
        ? `próxima: ${brl(Math.abs(nextPayable.amount ?? 0))} em ${fmtDate(nextPayable.date)}`
        : "nenhuma conta em aberto",
      tag: overduePayable
        ? `${overduePayable} ${overduePayable === 1 ? "vencida" : "vencidas"}`
        : "nada vencido",
      tagClass: overduePayable ? "bg-negative text-white" : "bg-[#7EE2AE] text-hero-end",
    },
    {
      id: "value",
      label: "Valor em obras ativas",
      value: total("value"),
      hint: `${fmtNum(Math.round(pctReceived))}% já recebido`,
      tag: `${activeCount} ${activeCount === 1 ? "obra" : "obras"}`,
      tagClass: "bg-gold text-hero-end",
    },
    {
      id: "result",
      label: "Resultado previsto",
      value: total("result"),
      hint:
        total("result") === null
          ? "conferir custos previstos"
          : "após custos, estrutura e impostos",
      tag: `+ ${brl(total("extras") ?? 0)} aditivos`,
      tagClass: "bg-gold text-hero-end",
    },
  ];
  return (
    <section
      aria-label="Resumo"
      className="relative overflow-hidden rounded-3xl bg-hero p-5 text-hero-foreground shadow-elevated sm:p-7"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full border-[36px] border-gold/20"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">
            {hero.subtitle}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{hero.title}</h1>
          <p className="mt-1 text-sm text-hero-foreground/70">
            {activeCount} {activeCount === 1 ? "obra ativa" : "obras ativas"} ·{" "}
            {alertCount
              ? `${alertCount} ${alertCount === 1 ? "aviso" : "avisos"} para ver`
              : "nenhum aviso"}
          </p>
        </div>
        {hero.actions}
      </div>

      <div className="relative mt-6 flex flex-wrap gap-6">
        <div className="min-w-0 flex-[1_1_340px]">
          <button
            type="button"
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            onClick={() => onDetail("cash")}
            aria-label="Detalhar Saldo em caixa"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-hero-foreground/70">
              Saldo em caixa hoje
            </span>
            <span className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-extrabold tracking-tight num sm:text-5xl">
                {cash === null ? "Não conferido" : brl(cash)}
              </span>
              {change !== null && change !== 0 && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-bold text-hero-end",
                    change > 0 ? "bg-[#7EE2AE]" : "bg-gold",
                  )}
                >
                  {change > 0 ? "▲" : "▼"} {brl(Math.abs(change))} no mês
                </span>
              )}
            </span>
          </button>
          {past.length > 1 && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="mt-2 h-16 w-full max-w-xl"
              role="img"
              aria-label={`Saldo no fim de cada mês: ${past.map((m) => `${m.label} ${brl(m.balance)}`).join(", ")}`}
            >
              <polygon points={`5,${H} ${line} ${W - 5},${H}`} fill="var(--gold)" opacity="0.18" />
              <polyline
                points={line}
                fill="none"
                stroke="var(--gold)"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <button
              type="button"
              className="text-left"
              onClick={() => onDetail("received")}
              aria-label="Detalhar Entradas recebidas"
            >
              <span className="block text-hero-foreground/70">Entrou no período</span>
              <b className="text-base text-[#8FB4FF] num">{brl(total("received") ?? 0)}</b>
            </button>
            <button
              type="button"
              className="text-left"
              onClick={() => onDetail("spent")}
              aria-label="Detalhar Saídas pagas"
            >
              <span className="block text-hero-foreground/70">Saiu no período</span>
              <b className="text-base text-[#FFC370] num">{brl(Math.abs(total("spent") ?? 0))}</b>
            </button>
            {lastIn && (
              <span className="min-w-0">
                <span className="block text-hero-foreground/70">Última entrada</span>
                <b className="block truncate text-sm font-semibold">
                  {[fmtDate(lastIn.date), lastIn.work, brl(Math.abs(lastIn.amount ?? 0))]
                    .filter(Boolean)
                    .join(" · ")}
                </b>
              </span>
            )}
          </div>
        </div>
        <div className="grid min-w-0 flex-[1_1_400px] grid-cols-1 gap-3 sm:grid-cols-2">
          {tiles.map((tl) => (
            <button
              key={tl.id}
              type="button"
              onClick={() => onDetail(tl.id)}
              aria-label={`Detalhar ${tl.label}`}
              className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-left transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-hero-foreground/70">{tl.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                    tl.tagClass,
                  )}
                >
                  {tl.tag}
                </span>
              </span>
              <b className="text-xl num">{tl.value === null ? "Não conferido" : brl(tl.value)}</b>
              <span className="truncate text-xs text-hero-foreground/70">{tl.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Attention({
  works,
  company = [],
}: {
  works: WorkSummary[];
  /** Alertas da empresa (ex.: caixa negativo previsto), antes dos das obras. */
  company?: { title: string; detail: string; to: string; action: string }[];
}) {
  const items = useAttentionItems(works);
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, Math.max(0, 4 - company.length));
  const totalAlerts = items.length + company.length;
  return (
    <section aria-labelledby="painel-avisos" className={cn(panelClass, "p-4 sm:p-5")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id="painel-avisos" className="text-lg font-bold">
          Precisa de você
        </h2>
        {totalAlerts > 0 && (
          <span className="rounded-full bg-negative px-2.5 py-0.5 text-xs font-bold text-white">
            {totalAlerts} {totalAlerts === 1 ? "aviso" : "avisos"}
          </span>
        )}
      </div>
      {totalAlerts ? (
        <ul className="space-y-2">
          {company.map((c) => (
            <li key={c.title}>
              <Link
                to={c.to}
                className="flex items-center gap-3 rounded-xl bg-negative-soft p-3 transition-colors hover:brightness-95"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-negative text-white">
                  <Wallet className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <b className="block leading-snug">{c.title}</b>
                  <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>
                </span>
                <span className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold">
                  {c.action}
                </span>
              </Link>
            </li>
          ))}
          {shown.map((i) => {
            const Icon = ATTENTION_ICON[i.kind];
            const tone = ATTENTION_TONE[i.kind];
            return (
              <li key={i.kind + i.workId}>
                <Link
                  to="/obras/$id"
                  params={{ id: i.workId }}
                  search={{ tab: i.tab }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-3 transition-colors hover:brightness-95",
                    tone.box,
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      tone.icon,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <b className="block leading-snug">{i.title}</b>
                    <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
                  </span>
                  <span className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold">
                    {i.action}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Tudo em dia: nenhum aviso nas obras do filtro.
        </p>
      )}
      {items.length > shown.length && !all && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-primary hover:underline"
          onClick={() => setAll(true)}
        >
          {`Ver todos (${totalAlerts})`}
        </button>
      )}
    </section>
  );
}

/** Itens de "Precisa de você" das obras do filtro (attentionItems de dashboard-home.ts). */
function useAttentionItems(works: WorkSummary[]) {
  const brl = useBRL();
  const today = businessDate();
  return attentionItems(
    works.map((s) => {
      const confirmed = s.work.origin !== "direto" || s.result.estimateConfirmed;
      return {
        id: s.work.id,
        name: s.work.name,
        status: s.work.status,
        overdue: s.overdue,
        margin: confirmed && s.result.sale > 0 ? targetMargin(s.budget.params, s.result) : null,
        minMargin: Number(s.budget.params?.min_margin) || 0,
        costConfirmed: confirmed,
        datedStages: s.stages.filter((x) => x.planned_start).length,
        lateStages: lateStages(s.stages, today).length,
      };
    }),
    brl,
  );
}

const AGENDA_TONE: Record<AgendaKind, { date: string; value: string; sign: string }> = {
  entrada: { date: "bg-primary-soft text-primary", value: "text-primary", sign: "+ " },
  saida: { date: "bg-gold-soft text-alert", value: "text-alert", sign: "− " },
  etapa: { date: "bg-muted text-foreground", value: "text-muted-foreground", sign: "" },
};

/** Próximos 7 dias: o que entra, o que sai e as etapas que começam. */
function WeekCard({ agenda }: { agenda: ReturnType<typeof weekAgenda> }) {
  const brl = useBRL();
  const [all, setAll] = useState(false);
  const shown = all ? agenda.items : agenda.items.slice(0, 6);
  return (
    <section aria-labelledby="painel-semana" className={cn(panelClass, "p-4 sm:p-5")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="painel-semana" className="text-lg font-bold">
          Próximos 7 dias
        </h2>
        <span className="text-xs text-muted-foreground">
          entra <b className="text-primary num">{brl(agenda.inflow)}</b> · sai{" "}
          <b className="text-alert num">{brl(agenda.outflow)}</b>
        </span>
      </div>
      {agenda.items.length ? (
        <ul className="divide-y divide-border/60">
          {shown.map((i, n) => {
            const tone = AGENDA_TONE[i.kind];
            const body = (
              <>
                <span
                  className={cn(
                    "flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5",
                    tone.date,
                  )}
                >
                  <b className="text-lg leading-none">{i.day}</b>
                  <span className="text-[11px] font-semibold uppercase">{i.weekday}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{i.title}</b>
                  <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
                </span>
                <b className={cn("shrink-0 text-sm num", tone.value)}>
                  {i.amount === null ? "etapa" : `${tone.sign}${brl(i.amount)}`}
                </b>
              </>
            );
            return (
              <li key={`${i.kind}-${i.date}-${n}`}>
                {i.workId ? (
                  <Link
                    to="/obras/$id"
                    params={{ id: i.workId }}
                    search={{ tab: i.tab }}
                    className="flex items-center gap-3 py-2 hover:text-primary"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nada vence nem começa nos próximos 7 dias.
        </p>
      )}
      {agenda.items.length > shown.length && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-primary hover:underline"
          onClick={() => setAll(true)}
        >
          {`Ver tudo (${agenda.items.length})`}
        </button>
      )}
    </section>
  );
}

/**
 * Fluxo de caixa e projeção num gráfico: barras de entradas (azul) e saídas (laranja) por mês e
 * a linha do saldo, contínua até hoje e tracejada nos meses projetados pelos vencimentos.
 */
function CashChartCard({
  chart,
  projection,
}: {
  chart: ReturnType<typeof cashChart>;
  projection: Projection;
}) {
  const brl = useBRL();
  const { months } = chart;
  const W = 760;
  const H = 260;
  const left = 76;
  const top = 18;
  const bottom = 222;
  const step = (W - left - 16) / Math.max(1, months.length);
  const cx = (i: number) => left + step * (i + 0.5);
  const values = months.flatMap((m) => [m.received, m.spent, m.balance]);
  const hi = Math.max(1, ...values);
  const lo = Math.min(0, ...values);
  const y = (v: number) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);
  const firstFuture = months.findIndex((m) => m.future);
  const currentIdx = months.findIndex((m) => m.current);
  const realPts = months
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !m.future)
    .map(({ m, i }) => `${cx(i).toFixed(1)},${y(m.balance).toFixed(1)}`)
    .join(" ");
  const projPts =
    firstFuture > 0
      ? months
          .map((m, i) => ({ m, i }))
          .filter(({ m, i }) => m.future || i === currentIdx)
          .map(({ m, i }) => `${cx(i).toFixed(1)},${y(m.balance).toFixed(1)}`)
          .join(" ")
      : "";
  const lowIdx =
    firstFuture > 0
      ? months.reduce(
          (best, m, i) => (m.future && m.balance < months[best]!.balance ? i : best),
          firstFuture,
        )
      : -1;
  const short = (n: number) => brl(n).replace(/,\d{2}$/, "");
  const ticks = [lo, (lo + hi) / 2, hi];
  const bar = Math.min(22, step / 3);
  return (
    <section className={cn(panelClass, "min-w-0 p-4 sm:p-5 lg:col-span-2")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">Fluxo de caixa e projeção</h3>
          <p className="text-xs text-muted-foreground">
            Barras: o que entrou e saiu por mês. Linha: saldo, real até hoje e previsto pelos
            vencimentos.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="h-3 w-3 rounded bg-primary" /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-3 w-3 rounded bg-gold" /> Saídas
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-0.5 w-4 bg-foreground" /> Saldo
          </span>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full min-w-[560px]"
          role="img"
          aria-label={`Saldo por mês: ${months.map((m) => `${m.label} ${brl(m.balance)}${m.future ? " previsto" : ""}`).join(", ")}`}
        >
          {firstFuture > 0 && (
            <>
              <rect
                x={cx(firstFuture) - step / 2}
                y={top - 8}
                width={W - 16 - (cx(firstFuture) - step / 2)}
                height={bottom - top + 8}
                rx="10"
                fill="var(--gold-soft)"
              />
              <text
                x={cx(firstFuture) - step / 2 + 10}
                y={bottom - 8}
                fontSize="11"
                fontWeight="700"
                fill="var(--alert)"
              >
                PREVISTO
              </text>
            </>
          )}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} x2={W - 16} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text
                x={left - 6}
                y={y(v) + 4}
                fontSize="11"
                textAnchor="end"
                fill="var(--muted-foreground)"
              >
                {short(v)}
              </text>
            </g>
          ))}
          {months.map((m, i) =>
            m.future ? null : (
              <g key={m.month}>
                <title>{`${m.label}: entrou ${brl(m.received)} · saiu ${brl(m.spent)}`}</title>
                <rect
                  x={cx(i) - bar - 1}
                  y={y(m.received)}
                  width={bar}
                  height={Math.max(0, y(0) - y(m.received))}
                  rx="4"
                  fill="var(--primary)"
                />
                <rect
                  x={cx(i) + 1}
                  y={y(m.spent)}
                  width={bar}
                  height={Math.max(0, y(0) - y(m.spent))}
                  rx="4"
                  fill="var(--gold)"
                />
              </g>
            ),
          )}
          <polyline
            points={realPts}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {projPts && (
            <polyline
              points={projPts}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth="3"
              strokeDasharray="7 6"
              strokeLinejoin="round"
            />
          )}
          {lowIdx > 0 && (
            <g>
              <circle
                cx={cx(lowIdx)}
                cy={y(months[lowIdx]!.balance)}
                r="7"
                fill={months[lowIdx]!.balance < 0 ? "var(--negative)" : "var(--gold)"}
                stroke="var(--card)"
                strokeWidth="3"
              />
              <text
                x={cx(lowIdx)}
                y={y(months[lowIdx]!.balance) + 24}
                fontSize="12"
                fontWeight="700"
                textAnchor="middle"
                fill={months[lowIdx]!.balance < 0 ? "var(--negative)" : "var(--alert)"}
              >
                {short(months[lowIdx]!.balance)}
              </text>
            </g>
          )}
          {months.map((m, i) => (
            <text
              key={m.month}
              x={cx(i)}
              y={bottom + 22}
              fontSize="12"
              textAnchor="middle"
              fontWeight={m.current ? 800 : 500}
              fill={m.current ? "var(--alert)" : "var(--muted-foreground)"}
            >
              {m.current ? "hoje" : m.label}
            </text>
          ))}
        </svg>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs sm:grid-cols-4">
        {(
          [
            ["Entra em 90 dias", projection.inflow, "text-primary"],
            ["Sai em 90 dias", projection.outflow, "text-alert"],
            [
              "Menor saldo nas próximas semanas",
              projection.min,
              projection.min < 0 ? "text-negative" : "",
            ],
            ["Saldo em 90 dias", projection.end, projection.end < 0 ? "text-negative" : ""],
          ] as const
        ).map(([l, v, tone]) => (
          <div key={l}>
            <dt className="text-muted-foreground">{l}</dt>
            <dd className={cn("text-sm font-bold num", tone)}>{brl(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Inadimplência: vencido em aberto sobre o que já deveria ter entrado, com os clientes. */
function DelinquencyCard({ d }: { d: ReturnType<typeof delinquency> }) {
  const brl = useBRL();
  const rate = Math.min(100, Math.max(0, d.rate));
  return (
    <section className={cn(panelClass, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-bold">Inadimplência</h3>
        <Badge variant={d.overdue ? (d.rate >= 10 ? "negative" : "alert") : "positive"}>
          {d.overdue ? `${d.count} ${d.count === 1 ? "parcela" : "parcelas"}` : "Em dia"}
        </Badge>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <svg
          width="104"
          height="104"
          viewBox="0 0 42 42"
          role="img"
          aria-label={`${fmtNum(d.rate)}% do valor vencido está em atraso`}
          className="shrink-0"
        >
          <circle
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke="var(--primary-soft)"
            strokeWidth="6"
          />
          {rate > 0 && (
            <circle
              cx="21"
              cy="21"
              r="15.9"
              fill="none"
              stroke={d.rate >= 10 ? "var(--negative)" : "var(--gold)"}
              strokeWidth="6"
              strokeDasharray={`${rate} ${100 - rate}`}
              strokeDashoffset="25"
              strokeLinecap="round"
            />
          )}
          <text
            x="21"
            y="23.5"
            textAnchor="middle"
            fontSize="7"
            fontWeight="800"
            fill="var(--foreground)"
          >
            {fmtNum(Math.round(d.rate * 10) / 10)}%
          </text>
        </svg>
        <div className="min-w-0 text-xs text-muted-foreground">
          <p>do que já venceu está em atraso</p>
          <p
            className={cn(
              "text-xl font-bold num",
              d.overdue ? (d.rate >= 10 ? "text-negative" : "text-alert") : "text-positive",
            )}
          >
            {brl(d.overdue)}
          </p>
          <p>
            de {brl(d.expected)}
            {d.overdue ? ` · atraso médio de ${d.avgDaysLate} dias` : ""}
          </p>
        </div>
      </div>
      {d.byClient.length > 0 && (
        <ul className="mt-3 divide-y divide-border/60 border-t border-border/60 text-sm">
          {d.byClient.slice(0, 4).map((c) => (
            <li key={c.client} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                {c.clientId ? (
                  <Link
                    to="/cadastros/$id"
                    params={{ id: c.clientId }}
                    className="block truncate font-semibold hover:text-primary"
                  >
                    {c.client}
                  </Link>
                ) : (
                  <b className="block truncate">{c.client}</b>
                )}
                <span className="text-xs text-muted-foreground">{c.avgDays} dias de atraso</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <b className="text-negative num">{brl(c.overdue)}</b>
                <Button size="sm" asChild>
                  <Link to="/financeiro" search={{ view: "composicao" }}>
                    Cobrar
                  </Link>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MARGIN_TONE: Record<MarginTone, { bar: string; text: string }> = {
  meta: { bar: "bg-primary", text: "text-primary" },
  atencao: { bar: "bg-gold", text: "text-alert" },
  abaixo: { bar: "bg-negative", text: "text-negative" },
};

/** Margem prevista de cada obra com a linha da meta (azul na meta, laranja abaixo, vermelho abaixo da mínima). */
function MarginCard({ works }: { works: WorkSummary[] }) {
  const ranking = marginRanking(
    works
      .filter((s) => s.work.status !== "concluida")
      .map((s) => {
        const confirmed = s.work.origin !== "direto" || s.result.estimateConfirmed;
        return {
          id: s.work.id,
          name: s.work.name,
          margin: confirmed && s.result.sale > 0 ? targetMargin(s.budget.params, s.result) : null,
          target: Number(s.budget.params?.desired_margin) || 0,
          min: Number(s.budget.params?.min_margin) || 0,
        };
      }),
  );
  if (!ranking.length) return null;
  const target = Math.max(...ranking.map((w) => w.target));
  const scale = Math.max(20, target * 1.4, ...ranking.map((w) => w.pct));
  return (
    <section className={cn(panelClass, "mt-4 p-4 sm:p-5")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">Margem por obra</h3>
        <span className="text-xs text-muted-foreground">
          margem prevista na mesma base da meta de cada orçamento
          {target > 0 ? ` · linha = meta de ${fmtNum(target)}%` : ""}
        </span>
      </div>
      <ul className="space-y-2.5">
        {ranking.map((w) => (
          <li
            key={w.id}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm"
          >
            <Link
              to="/obras/$id"
              params={{ id: w.id }}
              className="truncate font-semibold hover:text-primary"
            >
              {w.name}
            </Link>
            <span className="relative block h-3.5 rounded-full bg-muted">
              <i
                className={cn("absolute inset-y-0 left-0 rounded-full", MARGIN_TONE[w.tone].bar)}
                style={{ width: `${Math.max(0, Math.min(100, (w.pct / scale) * 100))}%` }}
              />
              {w.target > 0 && (
                <i
                  aria-hidden
                  className="absolute -inset-y-1 w-0.5 bg-foreground"
                  style={{ left: `${(w.target / scale) * 100}%` }}
                />
              )}
            </span>
            <b className={cn("text-right num", MARGIN_TONE[w.tone].text)}>{fmtNum(w.pct)}%</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Funil comercial em degraus: enviados → aprovados → em obra, com os indicadores coloridos. */
function FunnelCard({
  f,
  inWork,
}: {
  f: ReturnType<typeof commercialFunnel> | null;
  inWork: number;
}) {
  const brl = useBRL();
  if (!f)
    return (
      <section className={cn(panelClass, "p-4 text-sm text-muted-foreground sm:p-5")}>
        Carregando funil comercial…
      </section>
    );
  const stage = (k: FunnelStage) => f.stages.find((s) => s.stage === k);
  const sent =
    (stage("enviado")?.count ?? 0) +
    (stage("aprovado")?.count ?? 0) +
    (stage("recusado")?.count ?? 0);
  const steps = [
    {
      label: "Em elaboração",
      count: stage("elaboracao")?.count ?? 0,
      value: stage("elaboracao")?.value ?? 0,
      cls: "bg-muted text-foreground",
      w: 100,
    },
    {
      label: "Enviados",
      count: sent,
      value:
        (stage("enviado")?.value ?? 0) +
        (stage("aprovado")?.value ?? 0) +
        (stage("recusado")?.value ?? 0),
      cls: "bg-hero text-hero-foreground",
      w: 88,
    },
    {
      label: "Aprovados",
      count: stage("aprovado")?.count ?? 0,
      value: stage("aprovado")?.value ?? 0,
      cls: "bg-primary text-primary-foreground",
      w: 72,
    },
  ];
  return (
    <section className={cn(panelClass, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-base font-bold">Funil de orçamentos</h3>
        <Link to="/orcamentos" className="text-xs font-semibold text-primary hover:underline">
          Orçamentos →
        </Link>
      </div>
      <ol className="flex flex-col items-center gap-1">
        {steps.map((st, i) => (
          <li key={st.label} className="flex w-full flex-col items-center gap-1">
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm",
                st.cls,
              )}
              style={{ width: `${st.w}%` }}
            >
              <b>
                {st.label} · {st.count}
              </b>
              <span className="num">{brl(st.value)}</span>
            </div>
            {i === 1 && f.conversion !== null && (
              <span className="text-xs font-bold text-alert">
                ↓ {fmtNum(f.conversion)}% aprovam
              </span>
            )}
          </li>
        ))}
        <li className="flex w-full flex-col items-center gap-1">
          <span className="text-xs font-bold text-alert">↓ viraram obra</span>
          <div
            className="flex items-center justify-between gap-2 rounded-xl bg-gold px-3.5 py-2.5 text-sm text-hero-end"
            style={{ width: "56%" }}
          >
            <b>Em obra · {inWork}</b>
          </div>
        </li>
      </ol>
      {f.reasons.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3 text-xs">
          <span className="mr-1 font-semibold text-muted-foreground">Recusas:</span>
          {f.reasons.slice(0, 4).map((r, i) => (
            <span
              key={r.reason}
              className={cn(
                "rounded-full px-2.5 py-1 font-semibold",
                i === 0 ? "bg-gold-soft text-alert" : "bg-primary-soft text-primary",
              )}
            >
              {r.reason} · {r.count}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function SalesKpis({ f }: { f: ReturnType<typeof commercialFunnel> | null }) {
  const brl = useBRL();
  const kpis = [
    {
      label: "Conversão",
      value: f?.conversion == null ? "—" : `${fmtNum(f.conversion)}%`,
      hint: "dos orçamentos decididos",
      cls: "bg-primary text-primary-foreground",
    },
    {
      label: "Tempo até aprovar",
      value: f?.avgDaysToApprove == null ? "—" : `${f.avgDaysToApprove} dias`,
      hint: "média do período",
      cls: "bg-card text-foreground border border-border/70",
    },
    {
      label: "Ticket médio aprovado",
      value: f?.averageTicket == null ? "—" : brl(f.averageTicket),
      hint: "orçamentos aprovados",
      cls: "bg-card text-foreground border border-border/70",
    },
    {
      label: "Em propostas abertas",
      value: f ? brl(f.openValue) : "—",
      hint: "enviadas e em elaboração",
      cls: "bg-gold text-hero-end",
    },
  ];
  return (
    <div className="grid min-w-0 grid-cols-2 content-start gap-3">
      {kpis.map((k) => (
        <div
          key={k.label}
          className={cn("flex min-h-28 min-w-0 flex-col gap-1 rounded-2xl p-4 shadow-card", k.cls)}
        >
          <span className="text-xs font-semibold opacity-85">{k.label}</span>
          <b className="text-lg font-extrabold leading-tight tracking-tight num sm:text-xl">
            {k.value}
          </b>
          <span className="text-xs opacity-85">{k.hint}</span>
        </div>
      ))}
    </div>
  );
}

/** Propostas enviadas há 7 dias ou mais sem resposta, com o WhatsApp do cliente. */
function FollowUpCard({ list }: { list: ReturnType<typeof followUps> | null }) {
  const brl = useBRL();
  return (
    <section className={cn(panelClass, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <h3 className="text-base font-bold">Fazer follow-up</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Propostas enviadas há 7 dias ou mais sem resposta
      </p>
      {!list ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : list.length ? (
        <ul className="divide-y divide-border/60">
          {list.slice(0, 5).map((b) => {
            const wa = whatsappLink(b.phone);
            return (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link
                  to="/orcamentos/$id"
                  params={{ id: b.id }}
                  className="min-w-0 hover:text-primary"
                >
                  <b className="block truncate">{b.client}</b>
                  <span className="block truncate text-xs text-muted-foreground">
                    ORC-{b.issue_date.slice(0, 4)}-{String(b.number).padStart(4, "0")} ·{" "}
                    <b className={b.days >= 15 ? "text-negative" : "text-alert"}>
                      há {b.days} dias
                    </b>
                  </span>
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <b className="num">{brl(b.value)}</b>
                  {wa ? (
                    <Button size="sm" className="bg-gold text-hero-end hover:bg-gold/90" asChild>
                      <a href={wa} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">sem telefone</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma proposta esperando resposta há mais de uma semana.
        </p>
      )}
    </section>
  );
}

function WorkList({ cards }: { cards: WorkSummary[] }) {
  const brl = useBRL();
  return (
    <div className={cn(panelClass, "overflow-x-auto")}>
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Obra</th>
            <th className="px-3 font-medium">Cliente</th>
            <th className="px-3 text-right font-medium">Valor</th>
            <th className="px-3 text-right font-medium">Recebido</th>
            <th className="px-3 text-right font-medium">Avanço</th>
            <th className="px-4" />
          </tr>
        </thead>
        <tbody>
          {cards.map((s) => (
            <tr key={s.work.id} className="border-t border-border/60">
              <td className="px-4 py-3 font-medium">{s.work.name}</td>
              <td className="px-3 text-muted-foreground">{s.client}</td>
              <td className="px-3 text-right tabular-nums">{brl(s.result.sale)}</td>
              <td className="px-3 text-right tabular-nums">
                {brl(s.totals.received)}{" "}
                <span className="text-xs text-muted-foreground">
                  ({fmtNum(s.balance.financialProgress)}%)
                </span>
              </td>
              <td className="px-3 text-right tabular-nums">{fmtNum(s.progress)}%</td>
              <td className="px-4 text-right">
                <Button size="sm" asChild>
                  <Link to="/obras/$id" params={{ id: s.work.id }}>
                    Abrir obra
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Projection = ReturnType<typeof cashProjection>;

export function HomeDashboard({
  works,
  allWorks,
  compositions,
  allTime,
  data,
  hero,
  onDetail,
}: {
  /** Obras do filtro, na ordem dos cards. */
  works: WorkSummary[];
  /** Obras para os seletores do filtro. */
  allWorks: WorkSummary[];
  compositions: Compositions;
  /** Mesmas composições sem o filtro de período (projeção e gráfico de caixa). */
  allTime: Compositions;
  data: ExecutiveData;
  /** Saudação e atalhos da faixa de abertura. */
  hero: PanelHeroProps;
  onDetail: (id: Indicator) => void;
}) {
  const brl = useBRL();
  const search = useSearch({ strict: false }) as ExecutiveFilter;
  const [view, setView] = useState<"cards" | "lista">("cards");
  const total = (id: Indicator) => indicatorTotal(compositions[id]);
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const active = works.filter((s) => s.work.status !== "concluida");
  const planning = active.filter((s) => s.work.status === "contratacao").length;
  const running = active.filter((s) => s.work.status === "execucao").length;
  const value = total("value") ?? 0;
  // Mesma base do "valor em obras ativas" (execução e contratação), senão o % sai inflado.
  const receivedActive = active
    .filter((s) => ["execucao", "contratacao"].includes(s.work.status))
    .reduce((n, s) => n + s.totals.received, 0);
  const pctReceived = value > 0 ? Math.min(100, (receivedActive / value) * 100) : 0;
  const today = businessDate();
  // R2-1: projeção a partir do saldo de hoje, sempre com todos os vencimentos (sem filtro de período).
  const cashNow = indicatorTotal(allTime.cash) ?? 0;
  const projection = cashProjection(cashNow, allTime.receivable, allTime.payable, today);
  const chart = cashChart(
    { received: allTime.received, spent: allTime.spent },
    cashNow,
    projection,
    today,
  );
  const agenda = weekAgenda(
    allTime.receivable,
    allTime.payable,
    active.flatMap((s) =>
      s.stages.map((st) => ({
        workId: s.work.id,
        work: s.work.name,
        name: st.name,
        planned_start: st.planned_start,
        progress: st.progress,
      })),
    ),
    today,
  );
  // R2-2: funil dos orçamentos emitidos no período filtrado.
  const range =
    search.period === "personalizado"
      ? { from: search.from || "", to: search.to || "" }
      : periodRange(search.period || "todos");
  const { data: budgets } = useQuery(commercialOptions(true));
  const funnel = budgets
    ? commercialFunnel(budgets.filter((b) => inPeriod(b.issue_date, range.from, range.to)))
    : null;
  const pending = budgets ? followUps(budgets, today) : null;
  // R2-3: contas a receber das obras do filtro (ou todas, sem filtro de obra/cliente).
  const ids = new Set(works.map((s) => s.work.id));
  const scoped = !!(search.work || search.client || search.status);
  const people = new Map(data.finance.people.map((p) => [p.id, p.name]));
  const receivables = data.finance.entries
    .filter(
      (e) =>
        e.direction === "entrada" &&
        !e.canceled &&
        (!scoped || (e.work_id !== null && ids.has(e.work_id))),
    )
    .map((e) => {
      const w = data.works.find((s) => s.work.id === e.work_id);
      const clientId = w?.work.client_id ?? e.person_id ?? null;
      return {
        id: e.id,
        amount: e.amount,
        due_date: e.due_date,
        client: w?.client ?? (e.person_id ? (people.get(e.person_id) ?? "Cliente") : "Sem cliente"),
        clientId,
      };
    });
  const late = delinquency(receivables, data.finance.settlements, today);
  const company = projection.firstNegative
    ? [
        {
          title: `Caixa negativo previsto em ${fmtDate(projection.firstNegative.start)}`,
          detail: `Menor saldo projetado: ${brl(projection.min)}`,
          to: "/financeiro",
          action: "Ver contas",
        },
      ]
    : [];
  const alertCount = useAttentionItems(works).length + company.length;
  const inWork = data.works.filter(
    (s) => s.work.linked_budget_id && s.work.status !== "concluida",
  ).length;
  return (
    <div className="space-y-6">
      <PanelHero
        hero={hero}
        compositions={compositions}
        cashNow={cashNow}
        chart={chart}
        activeCount={active.length}
        pctReceived={pctReceived}
        alertCount={alertCount}
        onDetail={onDetail}
      />
      <CompactFilters works={allWorks} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Attention works={works} company={company} />
        <WeekCard agenda={agenda} />
      </div>

      <section aria-labelledby="painel-dinheiro">
        <SectionTitle id="painel-dinheiro" icon={Wallet} tone="bg-primary text-primary-foreground">
          Dinheiro
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CashChartCard chart={chart} projection={projection} />
          <DelinquencyCard d={late} />
        </div>
      </section>

      <section aria-labelledby="painel-obras">
        <SectionTitle
          id="painel-obras"
          icon={HardHat}
          tone="bg-gold text-hero-end"
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onDetail("active")}
                className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary hover:brightness-95"
              >
                {count(running, "em execução", "em execução")} ·{" "}
                {count(planning, "em contratação", "em contratação")}
              </button>
              <button
                type="button"
                onClick={() => onDetail("extras")}
                className="rounded-full bg-gold-soft px-3 py-1.5 text-xs font-semibold text-alert hover:brightness-95"
              >
                Aditivos {brl(total("extras") ?? 0)}
              </button>
              <Segmented>
                {(["cards", "lista"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    className={segmentClass(view === v)}
                    onClick={() => setView(v)}
                  >
                    {v === "cards" ? "Cards" : "Lista"}
                  </button>
                ))}
              </Segmented>
              <Button asChild variant="outline" size="sm">
                <Link to="/obras">
                  Todas as obras
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          }
        >
          Obras
        </SectionTitle>
        {!works.length ? (
          <EmptyState
            icon={HardHat}
            title="Nenhuma obra neste filtro"
            description="Ajuste os filtros acima ou cadastre uma nova obra."
          />
        ) : view === "lista" ? (
          <WorkList cards={works} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {works.map((s) => (
              <WorkCard key={s.work.id} s={s} />
            ))}
            <Link
              to="/orcamentos"
              className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-card text-primary shadow-card">
                <Plus className="h-5 w-5" />
              </span>
              <b className="text-foreground">Nova obra</b>a partir de um orçamento aprovado
            </Link>
          </div>
        )}
        <MarginCard works={works} />
      </section>

      <section aria-labelledby="painel-comercial">
        <SectionTitle id="painel-comercial" icon={Filter} tone="bg-hero text-gold">
          Comercial
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <FunnelCard f={funnel} inWork={inWork} />
          <SalesKpis f={funnel} />
          <FollowUpCard list={pending} />
        </div>
      </section>
    </div>
  );
}
