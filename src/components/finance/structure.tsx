import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Building2,
  CalendarClock,
  Landmark,
  Paperclip,
  Pencil,
  Plus,
  Power,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dashboardOptions, type WorkSummary } from "@/lib/dashboard-data";
import { financeOptions } from "@/lib/finance-data";
import { structureOptions, type FixedCost } from "@/lib/structure-data";
import { accountStatus } from "@/lib/operations";
import { businessDate } from "@/lib/dashboard-math";
import { fmtDate, fmtNum } from "@/lib/format";
import { parseBRL } from "@/lib/money";
import { useBRL } from "@/lib/hidden-values";
import { openDocument, uploadDocument } from "@/lib/work-data";
import { workStatusLabel } from "@/lib/work-status";
import {
  FIXED_COST_CATEGORY,
  RECURRENCE_LABEL,
  addMonths,
  anticipate,
  averageShare,
  breakEven,
  coverageMonths,
  coverageTone,
  firstNegative,
  minimumWork,
  monthLong,
  monthShort,
  monthlyCost,
  monthlyShare,
  structureForecast,
  structureLedger,
  structureShare,
  type ForecastMonth,
  type Receivable,
} from "@/lib/structure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SubmitForm } from "@/components/enter-submit";
import { MoneyInput } from "@/components/money-input";
import { KpiCard, Money, Segmented } from "@/components/kpi";
import { PageSkeleton } from "@/components/feedback";
import { selectClass } from "@/components/works/fields";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";

// Financeiro › Estrutura: custos fixos da empresa e o caixa da estrutura (a parte de estrutura de
// cada recebimento de obra menos o que a empresa paga sem obra). Regras em src/lib/structure.ts.

type Tab = "visao" | "custos" | "obras" | "sim";
const TABS: [Tab, string][] = [
  ["visao", "Visão geral"],
  ["custos", "Custos fixos"],
  ["obras", "Obras × estrutura"],
  ["sim", "Simulador"],
];
const TONE_TEXT = { confortavel: "confortável", atencao: "atenção", critico: "crítico" } as const;
const TONE_PILL = {
  confortavel: "bg-positive-soft text-positive",
  atencao: "bg-alert-soft text-alert",
  critico: "bg-negative-soft text-negative",
} as const;

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

function useStructure() {
  const dash = useQuery(dashboardOptions);
  const fin = useQuery(financeOptions);
  const st = useQuery(structureOptions);
  const today = businessDate();
  const ym = today.slice(0, 7);
  const data = useMemo(() => {
    if (!dash.data || !fin.data || !st.data) return null;
    const works = dash.data.works;
    const shares = new Map(works.map((s) => [s.work.id, structureShare(s.base)]));
    const ledger = structureLedger(shares, fin.data.entries, fin.data.settlements);
    const monthly = monthlyCost(st.data.costs, today);
    const paidThisMonth = ledger.rows
      .filter((r) => r.kind === "saida" && r.date.slice(0, 7) === ym)
      .reduce((t, r) => t - r.amount, 0);
    const receivables: Receivable[] = fin.data.entries
      .filter((e) => e.direction === "entrada" && e.work_id && !e.canceled)
      .map((e) => ({
        id: e.id,
        workId: e.work_id as string,
        description: e.description,
        due_date: e.due_date,
        pending: accountStatus(e, fin.data.settlements, today).pending,
      }))
      .filter((r) => r.pending > 0 && (shares.get(r.workId) ?? 0) > 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const forecast = structureForecast({
      balance: ledger.balance,
      monthlyCost: monthly,
      paidThisMonth,
      receivables,
      shares,
      today,
    });
    const toReceive = receivables.reduce((t, r) => t + r.pending * (shares.get(r.workId) ?? 0), 0);
    const active = works.filter(
      (s) => s.work.status !== "concluida" && (shares.get(s.work.id) ?? 0) > 0,
    );
    const share = averageShare(
      active.map((s) => ({ sale: s.base.saleNet, share: shares.get(s.work.id) ?? 0 })),
      st.data.structureRate / 100,
    );
    const months = coverageMonths(ledger.balance, monthly);
    return {
      works,
      shares,
      ledger,
      monthly,
      paidThisMonth,
      receivables,
      forecast,
      toReceive,
      share,
      months,
      tone: coverageTone(months, forecast),
      costs: st.data.costs,
      suppliers: st.data.suppliers,
      entries: fin.data.entries,
      settlements: fin.data.settlements,
      accounts: fin.data.accounts,
    };
  }, [dash.data, fin.data, st.data, today, ym]);
  return { data, error: dash.error || fin.error || st.error, today, ym };
}
type Data = NonNullable<ReturnType<typeof useStructure>["data"]>;

export function StructurePanel() {
  const qc = useQueryClient();
  const { data, error, today, ym } = useStructure();
  const [tab, setTab] = useState<Tab>("visao");
  const [editing, setEditing] = useState<FixedCost | "new" | null>(null);
  const generated = useRef(false);
  // As contas do mês dos custos fixos são geradas ao abrir a tela (idempotente no banco).
  useEffect(() => {
    if (generated.current) return;
    generated.current = true;
    void supabase.rpc("generate_fixed_cost_entries", { _month: `${ym}-01` }).then(({ data: n }) => {
      if (n) void qc.invalidateQueries({ queryKey: ["finance"] });
    });
  }, [qc, ym]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["structure"] });
    void qc.invalidateQueries({ queryKey: ["finance"] });
    void qc.invalidateQueries({ queryKey: ["financial-dashboard"] });
  };
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  if (!data) return <PageSkeleton cards={4} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={segmentClass(tab === id)}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </Segmented>
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Novo custo fixo
        </Button>
      </div>
      {tab === "visao" && (
        <Overview data={data} ym={ym} today={today} go={setTab} refresh={refresh} />
      )}
      {tab === "custos" && (
        <CostsTab data={data} ym={ym} today={today} onEdit={setEditing} refresh={refresh} />
      )}
      {tab === "obras" && <WorksTab data={data} />}
      {tab === "sim" && <Simulator data={data} today={today} />}
      <CostDialog
        cost={editing}
        suppliers={data.suppliers}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await supabase.rpc("generate_fixed_cost_entries", { _month: `${ym}-01` });
          refresh();
        }}
      />
    </div>
  );
}

/* ---------------- Visão geral ---------------- */

function Overview({
  data,
  ym,
  today,
  go,
  refresh,
}: {
  data: Data;
  ym: string;
  today: string;
  go: (t: Tab) => void;
  refresh: () => void;
}) {
  const brl = useBRL();
  const neg = firstNegative(data.forecast);
  const active = data.costs.filter((c) => c.active).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          label="Custo fixo mensal"
          icon={CalendarClock}
          value={<Money value={data.monthly} />}
          hint={`${active} ${active === 1 ? "conta" : "contas"} · anuais rateadas`}
        />
        <KpiCard
          label="Saldo da estrutura"
          icon={Wallet}
          tone={data.ledger.balance < 0 ? "negative" : "brand"}
          value={<Money value={data.ledger.balance} />}
          hint="parte de estrutura já recebida, menos o que a empresa pagou"
        />
        <KpiCard
          label="Cobertura"
          icon={TrendingUp}
          tone={
            data.tone === "confortavel"
              ? "positive"
              : data.tone === "atencao"
                ? "alert"
                : "negative"
          }
          value={
            data.months === null ? (
              "—"
            ) : (
              <span className="num">
                {fmtNum(Math.round(data.months * 10) / 10)} {data.months === 1 ? "mês" : "meses"}
              </span>
            )
          }
          hint={<Pill className={TONE_PILL[data.tone]}>{TONE_TEXT[data.tone]}</Pill>}
        />
        <KpiCard
          label="Estrutura a receber"
          icon={Landmark}
          value={<Money value={data.toReceive} />}
          hint="das parcelas já contratadas"
        />
      </div>

      {neg ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-negative/40 bg-negative-soft p-4 sm:flex-row sm:items-center">
          <span
            aria-hidden
            className="hidden h-2.5 w-2.5 shrink-0 rounded-full bg-negative sm:block"
          />
          <div className="min-w-0 flex-1 text-sm">
            <b className="text-negative">
              Em {monthLong(neg.ym)} o caixa da estrutura fica em {brl(neg.balance)}.
            </b>
            <p className="text-muted-foreground">
              As obras contratadas não cobrem os custos fixos a partir desse mês. Faltam{" "}
              {brl(-neg.balance)} de estrutura
              {data.share > 0
                ? `, o equivalente a ${brl(-neg.balance / data.share)} em recebimentos de obra`
                : ""}
              .
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => go("sim")}>
            Simular saída
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border p-4 text-sm",
            data.forecast.some((m) => m.balance < data.monthly)
              ? "border-alert/40 bg-alert-soft"
              : "border-positive/40 bg-positive-soft",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              data.forecast.some((m) => m.balance < data.monthly) ? "bg-alert" : "bg-positive",
            )}
          />
          <div>
            <b>Estrutura coberta nos próximos 6 meses.</b>
            <p className="text-muted-foreground">
              Menor saldo projetado: {brl(Math.min(...data.forecast.map((m) => m.balance)))}.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-bold">Previsão do caixa da estrutura</h3>
            <span className="text-xs text-muted-foreground">próximos 6 meses</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-primary" /> Entra para a estrutura
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-3 w-3 rounded bg-muted-foreground/40" /> Custos fixos
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-0.5 w-4 bg-foreground" /> Saldo projetado
            </span>
          </div>
          <ForecastChart forecast={data.forecast} />
        </section>
        <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
          <h3 className="text-base font-bold">Mês a mês</h3>
          <ForecastTable forecast={data.forecast} />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-bold">Contas do mês</h3>
            <button
              type="button"
              className="text-sm font-semibold text-primary hover:underline"
              onClick={() => go("custos")}
            >
              ver todas →
            </button>
          </div>
          <MonthBills data={data} ym={ym} today={today} refresh={refresh} compact />
        </section>
        <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
          <h3 className="text-base font-bold">O que resolve</h3>
          <Actions data={data} neg={neg} />
        </section>
      </div>
    </div>
  );
}

function ForecastChart({ forecast }: { forecast: ForecastMonth[] }) {
  const brl = useBRL();
  const W = 560;
  const H = 240;
  const L = 58;
  const R = 10;
  const T = 14;
  const B = 30;
  const top = Math.max(1, ...forecast.flatMap((m) => [m.inflow, m.cost, m.balance])) * 1.1;
  const bottom = Math.min(0, ...forecast.map((m) => m.balance)) * 1.15;
  const y = (v: number) => T + ((top - v) / (top - bottom || 1)) * (H - T - B);
  const bw = (W - L - R) / forecast.length;
  const ticks = Array.from({ length: 5 }, (_, i) => bottom + ((top - bottom) * i) / 4);
  const k = (v: number) =>
    Math.abs(v) >= 1000 ? `${fmtNum(Math.round(v / 1000))} mil` : fmtNum(Math.round(v));
  const pts = forecast.map((m, i) => [L + bw * i + bw / 2, y(m.balance), m.balance] as const);
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full min-w-[420px]"
        role="img"
        aria-label={`Saldo projetado: ${forecast.map((m) => `${monthShort(m.ym)} ${brl(m.balance)}`).join(", ")}`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
            <text
              x={L - 6}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {k(v)}
            </text>
          </g>
        ))}
        <line
          x1={L}
          x2={W - R}
          y1={y(0)}
          y2={y(0)}
          className="stroke-muted-foreground"
          strokeWidth={1}
        />
        {forecast.map((m, i) => {
          const cx = L + bw * i + bw / 2;
          const w = bw * 0.28;
          return (
            <g key={m.ym}>
              <rect
                x={cx - w - 2}
                y={y(m.inflow)}
                width={w}
                height={Math.max(0, y(0) - y(m.inflow))}
                rx={2}
                className="fill-primary"
              >
                <title>Entra: {brl(m.inflow)}</title>
              </rect>
              <rect
                x={cx + 2}
                y={y(m.cost)}
                width={w}
                height={Math.max(0, y(0) - y(m.cost))}
                rx={2}
                className="fill-muted-foreground/40"
              >
                <title>Custos: {brl(m.cost)}</title>
              </rect>
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {monthShort(m.ym)}
              </text>
            </g>
          );
        })}
        <polyline
          points={pts.map((p) => `${p[0]},${p[1]}`).join(" ")}
          fill="none"
          className="stroke-foreground"
          strokeWidth={2}
        />
        {pts.map(([x, py, v]) => (
          <circle
            key={x}
            cx={x}
            cy={py}
            r={4}
            strokeWidth={2}
            className={v < 0 ? "fill-negative stroke-negative" : "fill-card stroke-foreground"}
          >
            <title>Saldo: {brl(v)}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function ForecastTable({ forecast }: { forecast: ForecastMonth[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 text-left font-medium">Mês</th>
            <th className="py-2 text-right font-medium">Entra</th>
            <th className="py-2 text-right font-medium">Sai</th>
            <th className="py-2 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((m) => (
            <tr key={m.ym} className="border-b border-border/60 last:border-0">
              <td className="py-2">{monthShort(m.ym)}</td>
              <td className="py-2 text-right">
                <Money value={m.inflow} />
              </td>
              <td className="py-2 text-right">
                <Money value={m.cost} />
              </td>
              <td className={cn("py-2 text-right font-semibold", m.balance < 0 && "text-negative")}>
                <Money value={m.balance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Actions({ data, neg }: { data: Data; neg: ForecastMonth | null }) {
  const brl = useBRL();
  if (!neg)
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma ação urgente. Use o simulador para planejar a próxima obra.
      </p>
    );
  const deficit = -neg.balance;
  const work = (id: string) => data.works.find((s) => s.work.id === id)?.work.name ?? "Obra";
  const later = data.receivables
    .filter((r) => r.due_date.slice(0, 7) > neg.ym)
    .map((r) => ({ r, est: r.pending * (data.shares.get(r.workId) ?? 0) }))
    .sort((a, b) => b.est - a.est)
    .slice(0, 2);
  return (
    <div className="space-y-2.5">
      {data.share > 0 && (
        <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fechar obra nova
          </span>
          <p>
            Obra de no mínimo <b className="num">{brl(deficit / data.share / 0.3)}</b> com 30% de
            entrada até {monthLong(neg.ym)}.
          </p>
        </div>
      )}
      {later.map(({ r, est }) => {
        const pct = Math.min(100, (est / deficit) * 100);
        return (
          <div key={r.id} className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Antecipar parcela
            </span>
            <p>
              <b>
                {work(r.workId)} · {r.description}
              </b>{" "}
              para {monthLong(neg.ym)}: entram {brl(r.pending)}, sendo{" "}
              <b className="num">{brl(est)}</b> para a estrutura. Cobre {Math.round(pct)}% do que
              falta.
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {!later.length && data.share <= 0 && (
        <p className="text-sm text-muted-foreground">
          Cadastre o % de estrutura nos orçamentos para simular.
        </p>
      )}
    </div>
  );
}

/* ---------------- Contas do mês (geradas pelos custos fixos) ---------------- */

const BILL_PILL: Record<string, string> = {
  paga: "bg-positive-soft text-positive",
  pendente: "bg-primary/10 text-primary",
  parcial: "bg-primary/10 text-primary",
  vencida: "bg-negative-soft text-negative",
  provisionado: "bg-alert-soft text-alert",
};
const BILL_TEXT: Record<string, string> = {
  paga: "pago",
  pendente: "pendente",
  parcial: "parcial",
  vencida: "vencido",
  provisionado: "provisionado",
};

function monthBills(data: Data, ym: string, today: string) {
  return data.entries
    .filter((e) => e.fixed_cost_id && e.competence === ym && !e.canceled)
    .map((e) => ({ e, st: accountStatus(e, data.settlements, today) }))
    .sort((a, b) => {
      const o = { vencida: 0, pendente: 1, parcial: 1, paga: 3 } as Record<string, number>;
      return (
        (o[a.st.status] ?? 2) - (o[b.st.status] ?? 2) || a.e.due_date.localeCompare(b.e.due_date)
      );
    });
}

function MonthBills({
  data,
  ym,
  today,
  refresh,
  compact = false,
}: {
  data: Data;
  ym: string;
  today: string;
  refresh: () => void;
  compact?: boolean;
}) {
  const bills = monthBills(data, ym, today);
  const [paying, setPaying] = useState<(typeof bills)[number]["e"] | null>(null);
  const open = bills.reduce((t, b) => t + b.st.pending, 0);
  const list = compact ? bills.slice(0, 6) : bills;
  if (!bills.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma conta de custo fixo em {monthLong(ym)}. Cadastre os custos em "Novo custo fixo".
      </p>
    );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-left font-medium">Conta</th>
              <th className="py-2 text-left font-medium">Venc.</th>
              <th className="py-2 text-right font-medium">Valor</th>
              <th className="py-2 pl-3 text-left font-medium">Situação</th>
              {!compact && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {list.map(({ e, st }) => (
              <tr key={e.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-2">{e.description}</td>
                <td className="py-2 num">{fmtDate(e.due_date).slice(0, 5)}</td>
                <td className="py-2 text-right">
                  <Money value={e.amount} />
                </td>
                <td className="py-2 pl-3">
                  <Pill className={BILL_PILL[st.status] ?? ""}>
                    {BILL_TEXT[st.status] ?? st.status}
                  </Pill>
                </td>
                {!compact && (
                  <td className="py-2 text-right">
                    {st.pending > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPaying(e)}
                      >
                        Marcar pago
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-bold">
              <td className="py-2" colSpan={2}>
                A pagar ainda em {monthLong(ym)}
              </td>
              <td className="py-2 text-right">
                <Money value={open} />
              </td>
              <td colSpan={compact ? 1 : 2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <PayDialog
        entry={paying}
        data={data}
        today={today}
        onClose={() => setPaying(null)}
        onSaved={() => {
          setPaying(null);
          refresh();
        }}
      />
    </>
  );
}

function PayDialog({
  entry,
  data,
  today,
  onClose,
  onSaved,
}: {
  entry: Data["entries"][number] | null;
  data: Data;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const accounts = data.accounts.filter((a) => a.active);
  const pending = entry ? accountStatus(entry, data.settlements, today).pending : 0;
  async function save(form: HTMLFormElement) {
    if (!entry) return;
    const d = new FormData(form);
    const amount = parseBRL(String(d.get("amount") ?? ""));
    if (!d.get("account")) {
      toast.error("Escolha de qual conta saiu o pagamento.");
      return;
    }
    if (amount <= 0) {
      toast.error("Informe o valor pago.");
      return;
    }
    setBusy(true);
    try {
      const f = d.get("proof");
      const path = f instanceof File && f.size ? await uploadDocument(f, "finance") : null;
      const r = await supabase.from("financial_settlements").insert({
        entry_id: entry.id,
        account_id: String(d.get("account")),
        amount,
        paid_date: String(d.get("date") || today),
        payment_method: String(d.get("method") || "") || null,
        file_path: path,
      });
      if (r.error) throw r.error;
      toast.success("Pagamento registrado.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!entry} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como pago</DialogTitle>
        </DialogHeader>
        {entry && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(e.currentTarget);
            }}
          >
            <p className="text-sm text-muted-foreground">
              {entry.description} · vence {fmtDate(entry.due_date)}
            </p>
            <Label className="grid gap-1.5">
              De qual conta saiu?
              <select
                name="account"
                className={selectClass}
                required
                defaultValue={accounts[0]?.id ?? ""}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Label className="grid gap-1.5">
                Valor pago
                <MoneyInput name="amount" value={pending} />
              </Label>
              <Label className="grid gap-1.5">
                Data do pagamento
                <Input name="date" type="date" defaultValue={today} required />
              </Label>
            </div>
            <Label className="grid gap-1.5">
              Forma de pagamento
              <Input
                name="method"
                placeholder="Ex.: Pix, boleto, débito automático"
                defaultValue={entry.payment_method ?? ""}
              />
            </Label>
            <Label className="grid gap-1.5">
              Comprovante (opcional)
              <Input name="proof" type="file" accept="image/*,application/pdf" />
            </Label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Registrar pagamento"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Custos fixos ---------------- */

function CostsTab({
  data,
  ym,
  today,
  onEdit,
  refresh,
}: {
  data: Data;
  ym: string;
  today: string;
  onEdit: (c: FixedCost) => void;
  refresh: () => void;
}) {
  const brl = useBRL();
  const bills = monthBills(data, ym, today);
  const [uploading, setUploading] = useState<string | null>(null);
  const costs = [...data.costs].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
  );
  async function attach(entryId: string, file: File) {
    setUploading(entryId);
    try {
      const path = await uploadDocument(file, "finance");
      const r = await supabase
        .from("financial_entries")
        .update({ file_path: path })
        .eq("id", entryId);
      if (r.error) throw r.error;
      toast.success("Boleto anexado.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
    }
  }
  async function toggle(c: FixedCost) {
    const r = await supabase.from("fixed_costs").update({ active: !c.active }).eq("id", c.id);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success(c.active ? "Custo desativado: não gera mais contas." : "Custo reativado.");
    refresh();
  }
  return (
    <div className="space-y-4">
      <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold">Custos fixos cadastrados</h3>
          <span className="text-sm text-muted-foreground">
            Total mensal: <b className="num text-foreground">{brl(data.monthly)}</b>
          </span>
        </div>
        {costs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Custo</th>
                  <th className="py-2 font-medium">Categoria</th>
                  <th className="py-2 font-medium">Recorrência</th>
                  <th className="py-2 font-medium">Venc.</th>
                  <th className="py-2 text-right font-medium">Valor</th>
                  <th className="py-2 pl-3 font-medium">Boleto · comprovante</th>
                  <th className="py-2 font-medium">{monthShort(ym)}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => {
                  const bill = bills.find((b) => b.e.fixed_cost_id === c.id);
                  const proof = bill
                    ? data.settlements.find((s) => s.entry_id === bill.e.id && s.file_path)
                        ?.file_path
                    : null;
                  const status = bill
                    ? bill.st.status
                    : c.recurrence !== "mensal" && c.active
                      ? "provisionado"
                      : null;
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b border-border/60 last:border-0",
                        !c.active && "opacity-55",
                      )}
                    >
                      <td className="py-2.5 pr-2">
                        <b className="font-semibold">{c.name}</b>
                        {c.variable && (
                          <span className="block text-xs text-muted-foreground">
                            valor varia · prevê pela média das 3 últimas
                          </span>
                        )}
                        {!c.active && (
                          <span className="block text-xs text-muted-foreground">desativado</span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {FIXED_COST_CATEGORY[c.category] ?? c.category}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {RECURRENCE_LABEL[c.recurrence] ?? c.recurrence}
                        {c.recurrence !== "mensal" && ` · ${brl(monthlyShare(c))}/mês`}
                      </td>
                      <td className="py-2.5 num">dia {c.due_day}</td>
                      <td className="py-2.5 text-right">
                        <Money value={c.amount} />
                      </td>
                      <td className="py-2.5 pl-3">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {bill?.e.file_path ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                              onClick={() =>
                                void openDocument(bill.e.file_path!, `Boleto ${c.name}.pdf`)
                              }
                            >
                              <Paperclip className="h-3.5 w-3.5" /> boleto
                            </button>
                          ) : bill ? (
                            <label className="inline-flex cursor-pointer items-center gap-1 text-primary hover:underline">
                              <Paperclip className="h-3.5 w-3.5" />
                              {uploading === bill.e.id ? "enviando…" : "+ boleto"}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="sr-only"
                                onChange={(ev) => {
                                  const f = ev.target.files?.[0];
                                  if (f) void attach(bill.e.id, f);
                                }}
                              />
                            </label>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {proof && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                              onClick={() => void openDocument(proof, `Comprovante ${c.name}.pdf`)}
                            >
                              <Paperclip className="h-3.5 w-3.5" /> comprovante
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5">
                        {status ? (
                          <Pill className={BILL_PILL[status] ?? ""}>
                            {BILL_TEXT[status] ?? status}
                          </Pill>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Editar ${c.name}`}
                            onClick={() => onEdit(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={c.active ? `Desativar ${c.name}` : `Reativar ${c.name}`}
                            onClick={() => void toggle(c)}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="py-2" colSpan={4}>
                    Custo fixo mensal (anuais e trimestrais rateados)
                  </td>
                  <td className="py-2 text-right">
                    <Money value={data.monthly} />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum custo fixo ainda. Comece por aluguel, pró-labore, contas de consumo, sistemas e
            contabilidade em "Novo custo fixo".
          </p>
        )}
      </section>
      <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
        <h3 className="text-base font-bold">Contas de {monthLong(ym)}</h3>
        <MonthBills data={data} ym={ym} today={today} refresh={refresh} />
      </section>
      <p className="text-xs text-muted-foreground">
        As contas de cada mês são criadas sozinhas ao abrir esta tela e aparecem também em
        Financeiro → Contas a pagar (categoria "Custo fixo"). Custos anuais e trimestrais entram
        provisionados: o valor ÷ 12 (ou ÷ 3) conta todo mês no custo mensal, e a conta sai no mês do
        vencimento. Gastos sem obra (ex.: combustível que não é de uma obra) também saem do caixa da
        estrutura; com obra marcada, ficam na obra.
      </p>
    </div>
  );
}

function CostDialog({
  cost,
  suppliers,
  onClose,
  onSaved,
}: {
  cost: FixedCost | "new" | null;
  suppliers: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = cost && cost !== "new" ? cost : null;
  const [recurrence, setRecurrence] = useState(c?.recurrence ?? "mensal");
  const [busy, setBusy] = useState(false);
  const fieldsRef = useRef<HTMLDivElement>(null);
  useEffect(() => setRecurrence(c?.recurrence ?? "mensal"), [c]);
  async function save(form: HTMLFormElement) {
    const d = new FormData(form);
    const amount = parseBRL(String(d.get("amount") ?? ""));
    const name = String(d.get("name") ?? "").trim();
    if (!name) {
      toast.error("Dê um nome ao custo.");
      return;
    }
    if (amount <= 0) {
      toast.error("Informe o valor.");
      return;
    }
    const payload = {
      name,
      category: String(d.get("category")),
      amount,
      recurrence,
      due_day: Math.min(31, Math.max(1, Number(d.get("due_day")) || 10)),
      due_month: recurrence === "mensal" ? null : Number(d.get("due_month")) || 1,
      variable: d.get("variable") === "on",
      supplier_id: String(d.get("supplier") || "") || null,
      payment_method: String(d.get("method") || "") || null,
      starts_on: String(d.get("starts_on") || businessDate()),
      notes: String(d.get("notes") || "") || null,
    };
    setBusy(true);
    const r = c
      ? await supabase.from("fixed_costs").update(payload).eq("id", c.id)
      : await supabase.from("fixed_costs").insert(payload);
    setBusy(false);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success(c ? "Custo atualizado." : "Custo fixo cadastrado.");
    onSaved();
  }
  return (
    <Dialog open={!!cost} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{c ? "Editar custo fixo" : "Novo custo fixo"}</DialogTitle>
        </DialogHeader>
        {cost && (
          <SubmitForm
            pending={busy}
            onSubmit={() => {
              const form = fieldsRef.current?.closest("form");
              if (form) void save(form);
            }}
          >
            <div ref={fieldsRef} className="contents">
              <FixedCostFields
                c={c}
                recurrence={recurrence}
                setRecurrence={setRecurrence}
                suppliers={suppliers}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Salvar custo"}
              </Button>
            </div>
          </SubmitForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

const MONTH_OPTIONS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function FixedCostFields({
  c,
  recurrence,
  setRecurrence,
  suppliers,
}: {
  c: FixedCost | null;
  recurrence: string;
  setRecurrence: (v: string) => void;
  suppliers: { id: string; name: string }[];
}) {
  return (
    <>
      <Label className="grid gap-1.5">
        Nome
        <Input
          name="name"
          required
          defaultValue={c?.name ?? ""}
          placeholder="Ex.: Aluguel da sala comercial"
        />
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Label className="grid gap-1.5">
          Categoria
          <select name="category" className={selectClass} defaultValue={c?.category ?? "ocupacao"}>
            {Object.entries(FIXED_COST_CATEGORY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Label>
        <Label className="grid gap-1.5">
          Valor
          <MoneyInput name="amount" value={c?.amount ?? null} required />
        </Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Label className="grid gap-1.5">
          Recorrência
          <select
            name="recurrence"
            className={selectClass}
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
          >
            <option value="mensal">Mensal</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>
        </Label>
        <Label className="grid gap-1.5">
          Dia do vencimento
          <Input
            name="due_day"
            type="number"
            min={1}
            max={31}
            defaultValue={c?.due_day ?? 10}
            required
          />
        </Label>
      </div>
      {recurrence !== "mensal" && (
        <Label className="grid gap-1.5">
          {recurrence === "anual" ? "Mês do vencimento" : "Mês do primeiro vencimento"}
          <select name="due_month" className={selectClass} defaultValue={c?.due_month ?? 1}>
            {MONTH_OPTIONS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="variable"
          defaultChecked={c?.variable ?? false}
          className="mt-1"
        />
        <span>
          O valor muda todo mês (luz, água)
          <span className="block text-xs text-muted-foreground">
            A conta do mês usa a média das 3 últimas pagas.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Label className="grid gap-1.5">
          Fornecedor (opcional)
          <select name="supplier" className={selectClass} defaultValue={c?.supplier_id ?? ""}>
            <option value="">—</option>
            {suppliers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Label>
        <Label className="grid gap-1.5">
          Forma de pagamento
          <Input
            name="method"
            defaultValue={c?.payment_method ?? ""}
            placeholder="Ex.: boleto, Pix"
          />
        </Label>
      </div>
      <Label className="grid gap-1.5">
        Começa em
        <Input name="starts_on" type="date" defaultValue={c?.starts_on ?? businessDate()} />
      </Label>
      <Label className="grid gap-1.5">
        Observações (opcional)
        <Input name="notes" defaultValue={c?.notes ?? ""} />
      </Label>
    </>
  );
}

/* ---------------- Obras × estrutura ---------------- */

function WorksTab({ data }: { data: Data }) {
  const brl = useBRL();
  const rows = data.works
    .map((s) => {
      const share = data.shares.get(s.work.id) ?? 0;
      const sale = s.base.saleNet;
      const structure = sale * share;
      const received = data.ledger.rows
        .filter((r) => r.kind === "entrada_obra" && r.workId === s.work.id)
        .reduce((t, r) => t + r.amount, 0);
      return { s, share, sale, structure, received, pending: Math.max(0, structure - received) };
    })
    .filter((r) => r.structure > 0 && (r.s.work.status !== "concluida" || r.pending > 0.005))
    .sort((a, b) => b.structure - a.structure);
  const total = (k: "sale" | "structure" | "received" | "pending") =>
    rows.reduce((t, r) => t + r[k], 0);
  const work = (id: string) => data.works.find((s) => s.work.id === id)?.work.name ?? "Obra";
  return (
    <div className="space-y-4">
      <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold">Quanto cada obra coloca na estrutura</h3>
          <span className="text-xs text-muted-foreground">
            parte de estrutura do orçamento, proporcional a cada recebimento
          </span>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Obra</th>
                  <th className="py-2 font-medium">Situação</th>
                  <th className="py-2 text-right font-medium">Valor negociado</th>
                  <th className="py-2 text-right font-medium">Estrutura</th>
                  <th className="py-2 text-right font-medium">Já entrou</th>
                  <th className="py-2 text-right font-medium">A entrar</th>
                  <th className="py-2 pl-4 font-medium">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = r.structure > 0 ? Math.min(100, (r.received / r.structure) * 100) : 0;
                  return (
                    <tr key={r.s.work.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-2">
                        <Link
                          to="/obras/$id"
                          params={{ id: r.s.work.id }}
                          className="font-semibold hover:underline"
                        >
                          {r.s.work.name}
                        </Link>
                      </td>
                      <td className="py-2.5">
                        <Pill className="bg-primary/10 text-primary">
                          {workStatusLabel(r.s.work.status)}
                        </Pill>
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={r.sale} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={r.structure} />
                        <span className="block text-xs text-muted-foreground num">
                          {fmtNum(Math.round(r.share * 1000) / 10)}% da venda
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={r.received} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={r.pending} />
                      </td>
                      <td className="min-w-[120px] py-2.5 pl-4">
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground num">
                          {Math.round(pct)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="py-2 text-right">
                    <Money value={total("sale")} />
                  </td>
                  <td className="py-2 text-right">
                    <Money value={total("structure")} />
                  </td>
                  <td className="py-2 text-right">
                    <Money value={total("received")} />
                  </td>
                  <td className="py-2 text-right">
                    <Money value={total("pending")} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma obra com estrutura no orçamento. A estrutura vem do % de estrutura dos
            orçamentos aprovados (Configurações → Precificação).
          </p>
        )}
      </section>
      <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold">Próximas parcelas das obras</h3>
          <span className="text-xs text-muted-foreground">contas a receber de cada obra</span>
        </div>
        {data.receivables.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Previsto</th>
                  <th className="py-2 font-medium">Obra</th>
                  <th className="py-2 font-medium">Parcela</th>
                  <th className="py-2 text-right font-medium">Valor</th>
                  <th className="py-2 text-right font-medium">Vai p/ estrutura</th>
                  <th className="py-2 text-right font-medium">Cobre do mês</th>
                </tr>
              </thead>
              <tbody>
                {data.receivables.map((r) => {
                  const est = r.pending * (data.shares.get(r.workId) ?? 0);
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 num">{fmtDate(r.due_date)}</td>
                      <td className="py-2">{work(r.workId)}</td>
                      <td className="py-2">{r.description}</td>
                      <td className="py-2 text-right">
                        <Money value={r.pending} />
                      </td>
                      <td className="py-2 text-right">
                        <Money value={est} />
                      </td>
                      <td className="py-2 text-right num">
                        {data.monthly > 0 ? `${Math.round((est / data.monthly) * 100)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma parcela a receber cadastrada.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Total que ainda vai entrar para a estrutura: <b className="num">{brl(data.toReceive)}</b>.
        </p>
      </section>
    </div>
  );
}

/* ---------------- Simulador ---------------- */

function Simulator({ data, today }: { data: Data; today: string }) {
  const brl = useBRL();
  const start = today.slice(0, 7);
  const future = data.receivables.filter((r) => r.due_date.slice(0, 7) > start);
  const [pick, setPick] = useState(future[0]?.id ?? "");
  const chosen = future.find((r) => r.id === pick) ?? future[0];
  const monthsBefore = chosen
    ? Array.from({ length: 12 }, (_, i) => addMonths(start, i)).filter(
        (m) => m < chosen.due_date.slice(0, 7),
      )
    : [];
  const [to, setTo] = useState("");
  const target = monthsBefore.includes(to) ? to : (monthsBefore.at(-1) ?? start);
  const sim = chosen
    ? structureForecast({
        balance: data.ledger.balance,
        monthlyCost: data.monthly,
        paidThisMonth: data.paidThisMonth,
        receivables: anticipate(data.receivables, chosen.id, target),
        shares: data.shares,
        today,
      })
    : null;
  const negNow = data.forecast.filter((m) => m.balance < 0).length;
  const negSim = sim ? sim.filter((m) => m.balance < 0).length : negNow;
  const est = chosen ? chosen.pending * (data.shares.get(chosen.workId) ?? 0) : 0;
  const work = (id: string) =>
    data.works.find((s: WorkSummary) => s.work.id === id)?.work.name ?? "Obra";

  const [mMonths, setMMonths] = useState(3);
  const [mDown, setMDown] = useState(30);
  const [mDur, setMDur] = useState(4);
  const min = minimumWork({
    monthly: data.monthly,
    months: mMonths,
    share: data.share,
    downPct: mDown,
    duration: mDur,
  });
  const even = breakEven(data.monthly, data.share);
  const pct = fmtNum(Math.round(data.share * 1000) / 10);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
          <h3 className="text-base font-bold">Se eu antecipar uma parcela</h3>
          {chosen ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Label className="grid gap-1.5">
                  Parcela
                  <select
                    className={selectClass}
                    value={chosen.id}
                    onChange={(e) => setPick(e.target.value)}
                  >
                    {future.map((r) => (
                      <option key={r.id} value={r.id}>
                        {work(r.workId)} · {r.description} ({monthShort(r.due_date.slice(0, 7))})
                      </option>
                    ))}
                  </select>
                </Label>
                <Label className="grid gap-1.5">
                  Antecipar para
                  <select
                    className={selectClass}
                    value={target}
                    onChange={(e) => setTo(e.target.value)}
                  >
                    {monthsBefore.map((m) => (
                      <option key={m} value={m}>
                        {monthShort(m)}
                      </option>
                    ))}
                  </select>
                </Label>
              </div>
              <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
                <p>
                  Entram <b className="num">{brl(chosen.pending)}</b> em {monthShort(target)} ·{" "}
                  <b className="num">{brl(est)}</b> vão para a estrutura
                </p>
                <p className="text-lg font-bold num">
                  {data.monthly > 0
                    ? `${Math.round((est / data.monthly) * 100)}% de um mês de custos fixos`
                    : ""}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-1.5 text-left font-medium">Mês</th>
                        <th className="py-1.5 text-right font-medium">Saldo hoje</th>
                        <th className="py-1.5 text-right font-medium">Com antecipação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.forecast.map((m, i) => (
                        <tr key={m.ym} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5">{monthShort(m.ym)}</td>
                          <td className={cn("py-1.5 text-right", m.balance < 0 && "text-negative")}>
                            <Money value={m.balance} />
                          </td>
                          <td
                            className={cn(
                              "py-1.5 text-right font-semibold",
                              (sim?.[i]?.balance ?? 0) < 0 ? "text-negative" : "text-positive",
                            )}
                          >
                            <Money value={sim?.[i]?.balance ?? 0} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-muted-foreground">
                  {negSim < negNow
                    ? `Meses no vermelho caem de ${negNow} para ${negSim}.`
                    : negSim === 0
                      ? "Nenhum mês no vermelho."
                      : "Antecipar só essa parcela não resolve: combine com outra ou com uma obra nova."}{" "}
                  A etapa precisa estar pronta para ser cobrada.
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma parcela futura de obra para antecipar.
            </p>
          )}
        </section>
        <section className={cn(panelClass, "min-w-0 space-y-3 p-4 sm:p-5")}>
          <h3 className="text-base font-bold">Obra mínima para fechar</h3>
          <div className="grid grid-cols-3 gap-3">
            <Label className="grid gap-1.5">
              Meses a cobrir
              <Input
                type="number"
                min={1}
                max={12}
                value={mMonths}
                onChange={(e) => setMMonths(Number(e.target.value) || 1)}
              />
            </Label>
            <Label className="grid gap-1.5">
              Entrada (%)
              <Input
                type="number"
                min={5}
                max={100}
                value={mDown}
                onChange={(e) => setMDown(Number(e.target.value) || 30)}
              />
            </Label>
            <Label className="grid gap-1.5">
              Duração (meses)
              <Input
                type="number"
                min={1}
                max={24}
                value={mDur}
                onChange={(e) => setMDur(Number(e.target.value) || 1)}
              />
            </Label>
          </div>
          <div className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
            <p>
              Para pagar{" "}
              <b>
                {mMonths} {mMonths > 1 ? "meses" : "mês"}
              </b>{" "}
              de estrutura ({brl(min.needed)}) só com uma obra nova:
            </p>
            <p className="text-lg font-bold num">
              {min.sale === null ? "—" : `obra de no mínimo ${brl(min.sale)}`}
            </p>
            <p className="text-muted-foreground">
              Com {mDown}% de entrada e o restante em {mDur} meses, {Math.round(min.fraction * 100)}
              % do valor entra nesse período. Se o cliente pagasse tudo no período, bastaria{" "}
              {brl(min.saleUpfront)}.
            </p>
          </div>
        </section>
      </div>
      <section className={cn(panelClass, "min-w-0 space-y-2 p-4 sm:p-5")}>
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Building2 className="h-4 w-4 text-primary" /> Ponto de equilíbrio
        </h3>
        {even === null ? (
          <p className="text-sm text-muted-foreground">
            Sem % de estrutura nos orçamentos para calcular.
          </p>
        ) : (
          <>
            <p className="max-w-[68ch] text-sm">
              Com custo fixo de <b className="num">{brl(data.monthly)}</b>/mês e {pct}% de estrutura
              em cada venda (média das obras), a empresa precisa <b>receber {brl(even)} por mês</b>{" "}
              em parcelas de obra para a estrutura se pagar sozinha.
            </p>
            <p className="max-w-[68ch] text-sm text-muted-foreground">
              Cada R$ 1.000 a menos de custo fixo reduz essa meta em {brl(1000 / data.share)} por
              mês.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/* ---------------- Resumo para o Painel e a obra ---------------- */

/** Cartão "Saúde da estrutura" do Painel: cobertura e próximo mês em risco. */
export function StructureHealthCard() {
  const brl = useBRL();
  const { data } = useStructure();
  if (!data || (!data.costs.length && data.ledger.balance === 0)) return null;
  const neg = firstNegative(data.forecast);
  return (
    <Link
      to="/estrutura"
      className={cn(
        panelClass,
        "flex flex-col gap-3 p-4 transition-shadow hover:shadow-elevated sm:flex-row sm:items-center sm:p-5",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Landmark className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-bold">Saúde da estrutura</span>
          <span className="block text-sm text-muted-foreground">
            {neg
              ? `Em ${monthLong(neg.ym)} o caixa da estrutura fica em ${brl(neg.balance)}.`
              : "Custos fixos cobertos nos próximos 6 meses."}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span>
          Saldo <b className="num">{brl(data.ledger.balance)}</b>
        </span>
        <span>
          Custo fixo <b className="num">{brl(data.monthly)}</b>/mês
        </span>
        <Pill className={TONE_PILL[data.tone]}>
          {data.months === null ? "—" : `${fmtNum(Math.round(data.months * 10) / 10)} meses`} ·{" "}
          {TONE_TEXT[data.tone]}
        </Pill>
      </span>
    </Link>
  );
}

/** Quanto a obra coloca na estrutura (chip da tela da obra). */
export function WorkStructureChip({ workId }: { workId: string }) {
  const brl = useBRL();
  const dash = useQuery(dashboardOptions);
  const fin = useQuery(financeOptions);
  const s = dash.data?.works.find((w) => w.work.id === workId);
  if (!s || !fin.data) return null;
  const share = structureShare(s.base);
  if (share <= 0) return null;
  const structure = s.base.saleNet * share;
  const received = structureLedger(
    new Map([[workId, share]]),
    fin.data.entries.filter((e) => e.work_id === workId),
    fin.data.settlements,
  ).fromWorks;
  const pct = structure > 0 ? Math.min(100, Math.round((received / structure) * 100)) : 0;
  return (
    <Link
      to="/estrutura"
      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:underline"
    >
      <Landmark className="h-3.5 w-3.5" /> Estrutura: {brl(structure)} · {pct}% recebido
    </Link>
  );
}
