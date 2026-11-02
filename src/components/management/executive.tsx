import { ReceiptButton } from "@/components/works/finance";
import { HomeDashboard, type PanelHeroProps } from "@/components/management/home-panel";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch, useLocation } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  HardHat,
  Wallet,
  TrendingUp,
  CalendarClock,
  FilePlus2,
  Building2,
  Receipt,
  FilterX,
} from "lucide-react";
import { dashboardOptions } from "@/lib/dashboard-data";
import { ScheduleSituation } from "@/components/works/schedule-situation";
import { WorkCard } from "@/components/works/work-card";
import {
  executiveComposition,
  indicatorTotal,
  selectWorks,
  type Indicator,
  type ExecutiveFilter,
  type CompositionRow,
} from "@/lib/executive";
import { fmtDate, fmtNum } from "@/lib/format";
import { useBRL } from "@/lib/hidden-values";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/works/fields";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
import { KpiCard, Money, Segmented, type Tone } from "@/components/kpi";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { WORK_STATUS_LABEL } from "@/lib/work-status";

/** Situação da linha para a tela: nome da situação da obra ou a palavra com inicial maiúscula. */
const statusText = (s: string) =>
  WORK_STATUS_LABEL[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");
/** Ordem = prioridade no celular; `tone`/`filled`/`span` só definem a aparência do card. */
const indicators: {
  id: Indicator;
  label: string;
  icon: typeof HardHat;
  tone: Tone;
  filled?: boolean;
  span?: string;
}[] = [
  {
    id: "cash",
    label: "Saldo em caixa",
    icon: Wallet,
    tone: "brand",
    span: "col-span-2",
  },
  { id: "received", label: "Entradas recebidas", icon: ArrowUp, tone: "positive" },
  { id: "spent", label: "Saídas pagas", icon: ArrowDown, tone: "negative" },
  { id: "receivable", label: "A receber", icon: CalendarClock, tone: "positive", filled: true },
  { id: "payable", label: "Contas a pagar", icon: Receipt, tone: "negative", filled: true },
  { id: "active", label: "Obras ativas", icon: HardHat, tone: "neutral" },
  { id: "value", label: "Valor em obras ativas", icon: Building2, tone: "neutral" },
  {
    id: "result",
    label: "Resultado previsto das obras",
    icon: TrendingUp,
    tone: "brand",
    span: "xl:col-span-2",
  },
  {
    id: "extras",
    label: "Aditivos aprovados",
    icon: FilePlus2,
    tone: "extra",
    span: "xl:col-span-2",
  },
];
export function ManagementFilters({
  works,
}: {
  works: { work: { id: string; name: string; client_id: string | null }; client: string }[];
}) {
  const search = useSearch({ strict: false }) as ExecutiveFilter;
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const target = pathname === "/financeiro" ? "/financeiro" : "/painel";
  const set = (key: string, value: string | boolean) =>
    navigate({ to: target, search: (old: Record<string, unknown>) => ({ ...old, [key]: value }) });
  const active = !!(
    search.work ||
    search.client ||
    search.status ||
    (search.period && search.period !== "todos") ||
    search.pilot
  );
  return (
    <div className={cn(panelClass, "mb-6 space-y-3 p-4")}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <label className="text-xs font-medium text-muted-foreground">
          Período
          <select
            aria-label="Período"
            value={search.period || "todos"}
            onChange={(e) => set("period", e.target.value)}
            className={selectClass}
          >
            {[
              ["todos", "Todo o período"],
              ["hoje", "Hoje"],
              ["semana", "Semana"],
              ["mes", "Mês"],
              ["trimestre", "Trimestre"],
              ["ano", "Ano"],
              ["personalizado", "Personalizado"],
            ].map(([v, l]) => (
              <option key={v} value={v || ""}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Obra
          <select
            aria-label="Filtro obra"
            value={search.work || ""}
            onChange={(e) => set("work", e.target.value)}
            className={selectClass}
          >
            <option value="">Todas as obras</option>
            {works.map((s) => (
              <option key={s.work.id} value={s.work.id}>
                {s.work.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Cliente
          <select
            aria-label="Filtro cliente"
            value={search.client || ""}
            onChange={(e) => set("client", e.target.value)}
            className={selectClass}
          >
            <option value="">Todos os clientes</option>
            {[
              ...new Map(
                works.filter((s) => s.work.client_id).map((s) => [s.work.client_id, s]),
              ).values(),
            ].map((s) => (
              <option key={s.work.client_id} value={s.work.client_id ?? ""}>
                {s.client}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Status
          <select
            aria-label="Filtro status"
            value={search.status || ""}
            onChange={(e) => set("status", e.target.value)}
            className={selectClass}
          >
            <option value="">Todos os status</option>
            <option value="contratacao">Em contratação</option>
            <option value="execucao">Em execução</option>
            <option value="pausada">Pausada</option>
            <option value="concluida">Concluída</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {search.period === "personalizado" && (
          <>
            <label className="text-xs">
              De
              <input
                aria-label="Data inicial"
                className={selectClass}
                type="date"
                value={search.from || ""}
                onChange={(e) => set("from", e.target.value)}
              />
            </label>
            <label className="text-xs">
              Até
              <input
                aria-label="Data final"
                className={selectClass}
                type="date"
                value={search.to || ""}
                onChange={(e) => set("to", e.target.value)}
              />
            </label>
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={search.pilot || false}
            onChange={(e) => set("pilot", e.target.checked)}
          />
          Incluir PILOTO — TESTE
        </label>
        {active && (
          <>
            <span className="text-xs font-semibold text-primary">Filtros ativos</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate({ to: target, search: { period: "todos", pilot: false } })}
            >
              <FilterX className="h-4 w-4" />
              Limpar filtros
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
export function OriginLink({ row }: { row: CompositionRow }) {
  return row.workId ? (
    <Button asChild variant="ghost" size="sm" className="h-auto min-h-9 whitespace-normal">
      <Link
        to="/obras/$id"
        params={{ id: row.workId }}
        search={{ tab: row.tab, record: row.recordId || "", entry: row.entryId || "" }}
      >
        {row.work}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </Button>
  ) : (
    <Button asChild variant="ghost" size="sm">
      <Link to="/financeiro" search={{ entry: row.entryId || "" }}>
        Geral JMG
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </Button>
  );
}
export function CompositionTable({
  rows,
  indicator,
}: {
  rows: CompositionRow[];
  indicator: Indicator;
}) {
  const brl = useBRL();
  return (
    <div className={cn(panelClass, "overflow-x-auto shadow-none")}>
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {[
              "Data",
              "Obra / origem",
              "Cliente / pessoa",
              "Descrição",
              "Situação / parcela",
              "Valor",
            ].map((h) => (
              <th className="whitespace-nowrap px-3 py-3 font-medium" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              <td className="whitespace-nowrap p-3 text-xs">{fmtDate(r.date)}</td>
              <td className="p-2">
                <OriginLink row={r} />
              </td>
              <td className="p-3 text-xs">
                {r.personId ? (
                  <Link to="/cadastros/$id" params={{ id: r.personId }} className="text-primary">
                    {r.client}
                  </Link>
                ) : (
                  r.client
                )}
              </td>
              <td className="min-w-48 p-3">
                {r.description}
                {r.method && <p className="mt-1 text-xs text-muted-foreground">{r.method}</p>}
                {r.status === "recebido" && (
                  <div className="mt-1.5">
                    <ReceiptButton id={r.id} small />
                  </div>
                )}
                {indicator === "extras" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recebido / saldo: {r.paid === null ? "sem vínculo individual" : brl(r.paid)}
                    {r.pending != null ? " / " + brl(r.pending) : ""}
                  </p>
                )}
              </td>
              <td className="p-3 text-xs">
                {statusText(r.status)}
                {r.installment && (
                  <span className="block text-muted-foreground">Parcela {r.installment}</span>
                )}
                {r.paid != null && (
                  <span className="block text-muted-foreground">Baixado {brl(r.paid)}</span>
                )}
              </td>
              <td className="whitespace-nowrap p-3 text-right font-semibold num">
                {r.amount === null
                  ? "Não conferido"
                  : indicator === "active"
                    ? fmtNum(r.amount)
                    : brl(r.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum registro neste filtro.
        </p>
      )}
    </div>
  );
}
export function ExecutivePanel({ hero }: { hero: PanelHeroProps }) {
  const brl = useBRL();
  const { data, error } = useQuery(dashboardOptions);
  const search = useSearch({ strict: false }) as ExecutiveFilter & { detail?: Indicator };
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const target = pathname === "/financeiro" ? "/financeiro" : "/painel";
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  if (!data) return <PageSkeleton />;
  const compositions = executiveComposition(data, search);
  const detail = indicators.find((x) => x.id === search.detail);
  const rows = detail ? compositions[detail.id] : [];
  const total = indicatorTotal(rows);
  /** Ordem de exibição: em execução, em contratação, pausadas e concluídas. */
  const order = ["execucao", "contratacao", "pausada", "concluida"];
  const cards = [...selectWorks(data.works, search)].sort(
    (a, b) => order.indexOf(a.work.status) - order.indexOf(b.work.status),
  );
  return (
    <section>
      <HomeDashboard
        works={cards}
        allWorks={data.works.filter((s) => search.pilot || !s.work.is_pilot)}
        compositions={compositions}
        allTime={executiveComposition(data, { ...search, period: "todos" })}
        data={data}
        hero={hero}
        onDetail={(id) =>
          navigate({
            to: target,
            search: (old: Record<string, unknown>) => ({ ...old, detail: id }),
          })
        }
      />
      <Dialog
        open={!!detail}
        onOpenChange={(v) => {
          if (!v)
            navigate({
              to: target,
              search: (old: Record<string, unknown>) => ({ ...old, detail: "" }),
            });
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{detail?.label}</DialogTitle>
          </DialogHeader>
          <ManagementFilters works={data.works.filter((s) => search.pilot || !s.work.is_pilot)} />
          <div className="flex flex-wrap items-end justify-between gap-3 pb-1">
            <span className="text-xs text-muted-foreground">
              {rows.length} registros ·{" "}
              {["active", "value", "extras", "result"].includes(detail?.id || "")
                ? "posição acumulada"
                : "composição do período"}
            </span>
            <span className="text-2xl font-bold tracking-tight num">
              {total === null
                ? "Não conferido"
                : detail?.id === "active"
                  ? fmtNum(total)
                  : brl(total)}
            </span>
          </div>
          {detail?.id === "result" && (
            <p className="text-xs text-muted-foreground">
              Resultados das obras · custos gerais não rateados permanecem separados no Financeiro.
            </p>
          )}
          {detail?.id === "receivable" && (
            <p className="text-xs text-muted-foreground">
              Todo o período inclui saldo contratual sem parcelas; períodos específicos incluem
              somente vencimentos detalhados.
            </p>
          )}
          <CompositionTable rows={rows} indicator={detail?.id || "received"} />
          {detail?.id === "active" && (
            <div className="divide-y">
              {rows.map((r) => {
                const s = data.works.find((s) => s.work.id === r.workId);
                return s ? (
                  <section key={r.id} className="py-4">
                    <Link
                      to="/obras/$id"
                      params={{ id: s.work.id }}
                      className="mb-3 block text-sm font-semibold text-primary"
                    >
                      {s.work.name} · {fmtNum(s.progress)}%
                    </Link>
                    <ScheduleSituation
                      workId={s.work.id}
                      stages={s.stages}
                      end={s.work.planned_end}
                    />
                  </section>
                ) : null;
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function FinancialComposition() {
  const { data, error } = useQuery(dashboardOptions);
  const search = useSearch({ strict: false }) as ExecutiveFilter;
  const [indicator, setIndicator] = useState<Indicator>("received");
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  if (!data) return <PageSkeleton cards={3} />;
  const rows = executiveComposition(data, search)[indicator];
  const total = indicatorTotal(rows);
  const current = indicators.find((i) => i.id === indicator);
  return (
    <section>
      <ManagementFilters works={data.works.filter((s) => search.pilot || !s.work.is_pilot)} />
      <Segmented>
        {indicators
          .filter((i) => ["received", "receivable", "payable", "spent", "cash"].includes(i.id))
          .map((i) => (
            <button
              key={i.id}
              type="button"
              role="tab"
              aria-selected={indicator === i.id}
              onClick={() => setIndicator(i.id)}
              className={segmentClass(indicator === i.id)}
            >
              <i.icon />
              {i.label}
            </button>
          ))}
      </Segmented>
      <div className="my-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">{current?.label}</h2>
        <span className="text-2xl font-bold tracking-tight">
          {total === null ? (
            "Não conferido"
          ) : (
            <Money
              value={total}
              tone={!current || current.tone === "brand" ? "auto" : current.tone}
            />
          )}
        </span>
      </div>
      <CompositionTable rows={rows} indicator={indicator} />
    </section>
  );
}
