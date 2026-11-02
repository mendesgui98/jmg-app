import { AlertTriangle, HardHat } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { dashboardOptions } from "@/lib/dashboard-data";
import type { DashboardSearch } from "@/lib/dashboard-search";
import { periodRange, periodCash, monthlyCash, entryState, inPeriod } from "@/lib/dashboard-math";
import { fmtNum, fmtDate } from "@/lib/format";
import { useBRL, useValuesHidden } from "@/lib/hidden-values";
import { accountBalances } from "@/lib/operations";
import { Metrics } from "./summary";
import { selectClass } from "./fields";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
import { Money } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { workStatusLabel } from "@/lib/work-status";
const chartColors = {
  received: "var(--positive)",
  spent: "var(--negative)",
  cash: "var(--chart-1)",
  expected: "var(--chart-3)",
  balance: "var(--chart-1)",
  value: "var(--chart-1)",
};
function Graph({
  title,
  rows,
  x,
  keys,
  line = false,
}: {
  title: string;
  rows: Record<string, string | number>[];
  x: string;
  keys: { key: keyof typeof chartColors; name: string }[];
  line?: boolean;
}) {
  const brl = useBRL();
  const hidden = useValuesHidden();
  return (
    <section className={cn(panelClass, "min-w-0 p-4 sm:p-5")}>
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      {rows.length ? (
        <div className="h-64 w-full min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            {line ? (
              <LineChart data={rows}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey={x} fontSize={10} />
                <YAxis
                  fontSize={10}
                  tickFormatter={(v) => (hidden ? "" : `${Math.round(Number(v) / 1000)} mil`)}
                />
                <Tooltip
                  formatter={(v) => brl(Number(v))}
                  contentStyle={{ background: "var(--card)", borderColor: "var(--border)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {keys.map((k) => (
                  <Line
                    key={k.key}
                    dataKey={k.key}
                    name={k.name}
                    stroke={chartColors[k.key]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={rows}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey={x} fontSize={10} />
                <YAxis
                  fontSize={10}
                  tickFormatter={(v) => (hidden ? "" : `${Math.round(Number(v) / 1000)} mil`)}
                />
                <Tooltip
                  formatter={(v) => brl(Number(v))}
                  contentStyle={{ background: "var(--card)", borderColor: "var(--border)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {keys.map((k) => (
                  <Bar
                    key={k.key}
                    dataKey={k.key}
                    name={k.name}
                    fill={chartColors[k.key]}
                    radius={[6, 6, 0, 0]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Sem movimentos no período.
        </p>
      )}
    </section>
  );
}
export function FinancialDashboard() {
  const brl = useBRL();
  const { data, error } = useQuery(dashboardOptions);
  const search = useSearch({ strict: false }) as DashboardSearch;
  const navigate = useNavigate();
  const set = (key: keyof DashboardSearch, value: string | boolean) =>
    navigate({
      to: "/financeiro",
      search: (old: Record<string, unknown>) => ({ ...old, [key]: value }),
    });
  const range =
    search.period === "personalizado"
      ? { from: search.from || "", to: search.to || "" }
      : periodRange(search.period || "todos");
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  if (!data) return <PageSkeleton />;
  const works = data.works.filter(
    (s) =>
      (search.pilot || !s.work.is_pilot) &&
      (!search.work || s.work.id === search.work) &&
      (!search.client || s.work.client_id === search.client) &&
      (!search.status || s.work.status === search.status),
  );
  const ids = new Set(works.map((w) => w.work.id));
  const pilotIds = new Set(data.works.filter((s) => s.work.is_pilot).map((s) => s.work.id));
  const filtered = !!(search.work || search.client || search.status);
  const entries = data.finance.entries.filter(
    (e) =>
      !e.canceled &&
      (!e.work_id ? !filtered : ids.has(e.work_id)) &&
      (!search.category || e.category === search.category) &&
      (!e.work_id || search.pilot || !pilotIds.has(e.work_id)),
  );
  const movements = periodCash(entries, data.finance.settlements, range.from, range.to);
  const initial = works.filter(
    (w) => w.opening && inPeriod(w.opening.reference_date, range.from, range.to),
  );
  const cash = {
    ...movements,
    received:
      movements.received +
      (!search.category ? initial.reduce((t, w) => t + (w.opening?.received ?? 0), 0) : 0),
    spent:
      movements.spent +
      (!search.category ? initial.reduce((t, w) => t + (w.opening?.paid ?? 0), 0) : 0),
    cash:
      movements.cash +
      (!search.category
        ? initial.reduce((t, w) => t + (w.opening?.received ?? 0) - (w.opening?.paid ?? 0), 0)
        : 0),
    payable:
      movements.payable +
      (!search.category ? initial.reduce((t, w) => t + (w.opening?.pending_payable ?? 0), 0) : 0),
  };
  const pendingProjection = works.some(
    (w) => w.work.origin === "direto" && !w.result.estimateConfirmed,
  );
  const sum = (fn: (s: (typeof works)[number]) => number) => works.reduce((t, s) => t + fn(s), 0);
  const generals = entries.filter((e) => !e.work_id && e.direction === "saida");
  const generalResidual = (incurred: boolean) =>
    generals
      .filter((e) => e.incurred === incurred)
      .reduce(
        (s, e) =>
          s +
          e.amount -
          data.finance.allocations
            .filter((a) => a.entry_id === e.id && ids.has(a.work_id))
            .reduce((t, a) => t + a.amount, 0),
        0,
      );
  const balance = accountBalances(
    data.finance.accounts,
    data.finance.entries.filter((e) => search.pilot || !e.work_id || !pilotIds.has(e.work_id)),
    data.finance.settlements,
    data.finance.transfers,
  ).reduce((t, a) => t + a.balance, 0);
  const monthly = monthlyCash(entries, data.finance.settlements).filter((r) =>
    inPeriod(
      r.month + "-15",
      range.from.slice(0, 7) ? range.from.slice(0, 7) + "-01" : "",
      range.to ? range.to.slice(0, 7) + "-31" : "",
    ),
  );
  const categories = new Map<string, number>();
  for (const e of entries.filter((e) => e.direction === "saida")) {
    const paid = data.finance.settlements
      .filter((s) => s.entry_id === e.id && inPeriod(s.paid_date, range.from, range.to))
      .reduce((t, s) => t + s.amount, 0);
    categories.set(e.category, (categories.get(e.category) || 0) + paid);
  }
  const ranked = works
    .filter((w) => w.work.origin !== "direto" || w.result.estimateConfirmed)
    .sort((a, b) => b.result.result - a.result.result);
  const byCost = [...works].sort((a, b) => b.result.cost - a.result.cost);
  const workChart = works.map((w) => ({
    name: w.work.name.length > 18 ? w.work.name.slice(0, 18) + "…" : w.work.name,
    received: w.totals.received,
    spent: w.totals.spent,
    value: w.work.origin === "direto" && !w.result.estimateConfirmed ? 0 : w.result.result,
  }));
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Dashboard financeiro JMG</h2>
          <p className="text-xs text-muted-foreground">
            {works.filter((w) => w.work.status !== "concluida").length} obras ativas ·{" "}
            {works.length} no filtro
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/financeiro" search={{ work: search.work || "" }}>
            Lançamentos
          </Link>
        </Button>
      </div>
      <div
        className={cn(
          panelClass,
          "grid grid-cols-2 gap-3 p-4 xl:grid-cols-4 [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted-foreground",
        )}
      >
        <label className="text-xs">
          Período
          <select
            aria-label="Período"
            className={selectClass}
            value={search.period || "todos"}
            onChange={(e) => set("period", e.target.value)}
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
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Obra
          <select
            aria-label="Filtro obra"
            className={selectClass}
            value={search.work || ""}
            onChange={(e) => set("work", e.target.value)}
          >
            <option value="">Todas</option>
            {data.works
              .filter((w) => search.pilot || !w.work.is_pilot)
              .map((w) => (
                <option key={w.work.id} value={w.work.id}>
                  {w.work.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs">
          Cliente
          <select
            aria-label="Filtro cliente"
            className={selectClass}
            value={search.client || ""}
            onChange={(e) => set("client", e.target.value)}
          >
            <option value="">Todos</option>
            {[
              ...new Map(
                data.works.filter((w) => w.work.client_id).map((w) => [w.work.client_id, w]),
              ).values(),
            ].map((w) => (
              <option key={w.work.client_id} value={w.work.client_id ?? ""}>
                {w.client}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Categoria
          <select
            aria-label="Filtro categoria"
            className={selectClass}
            value={search.category || ""}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">Todas</option>
            {[...new Set(data.finance.entries.map((e) => e.category))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Status
          <select
            aria-label="Filtro status"
            className={selectClass}
            value={search.status || ""}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="contratacao">Em contratação</option>
            <option value="execucao">Em execução</option>
            <option value="pausada">Pausada</option>
            <option value="concluida">Concluída</option>
          </select>
        </label>
        {search.period === "personalizado" && (
          <>
            <label className="text-xs">
              De
              <input
                aria-label="Data inicial"
                type="date"
                className={selectClass}
                value={search.from || ""}
                onChange={(e) => set("from", e.target.value)}
              />
            </label>
            <label className="text-xs">
              Até
              <input
                aria-label="Data final"
                type="date"
                className={selectClass}
                value={search.to || ""}
                onChange={(e) => set("to", e.target.value)}
              />
            </label>
          </>
        )}
        <label className="col-span-2 flex items-center gap-2 text-xs xl:col-span-1">
          <input
            type="checkbox"
            checked={search.pilot || false}
            onChange={(e) => set("pilot", e.target.checked)}
          />
          Incluir PILOTO — TESTE
        </label>
      </div>
      <h3 className="pt-2 text-base font-semibold">Contratos e resultados · posição acumulada</h3>
      <Metrics
        rows={[
          [
            "Valor das obras ativas",
            sum((s) => (s.work.status !== "concluida" ? s.result.sale : 0)),
          ],
          ["Total contratado", sum((s) => s.base.saleNet)],
          ["Aditivos", sum((s) => s.result.extraValue)],
          ["Total atualizado", sum((s) => s.result.sale)],
          ["Saldo contratual a receber", sum((s) => s.balance.receivable)],
          ["Custos incorridos", sum((s) => s.incurred) + generalResidual(true)],
          [
            "Resultado acumulado · contrato − custos incorridos",
            sum((s) => s.result.accumulatedResult) - generalResidual(true),
          ],
          [
            "Resultado previsto",
            pendingProjection
              ? null
              : sum((s) => s.result.result) - generalResidual(true) - generalResidual(false),
          ],
        ]}
      />
      <h3 className="pt-2 text-base font-semibold">
        Movimentos e vencimentos ·{" "}
        {search.period === "todos" ? "todo o período" : "período selecionado"}
        {search.category ? " · " + search.category : ""}
      </h3>
      <Metrics
        rows={[
          ["Recebido", cash.received],
          ["Despesas pagas", cash.spent],
          ["Contas a receber", cash.receivable],
          ["Contas a pagar", cash.payable],
          ["Fluxo líquido do período", cash.cash],
          ["Caixa acumulado das obras", sum((s) => s.totals.cash)],
          ["Saldo das contas JMG · todas as contas", balance],
          ["Custos gerais não rateados", generalResidual(true) + generalResidual(false)],
        ]}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Graph
          title="Entradas × saídas / caixa mensal"
          rows={monthly}
          x="month"
          keys={[
            { key: "received", name: "Entradas" },
            { key: "spent", name: "Saídas" },
          ]}
        />
        <Graph
          title="Evolução do caixa"
          rows={monthly}
          x="month"
          keys={[{ key: "balance", name: "Saldo acumulado" }]}
          line
        />
        <Graph
          title="Recebimentos e despesas pagas por obra · acumulado"
          rows={workChart}
          x="name"
          keys={[
            { key: "received", name: "Recebido" },
            { key: "spent", name: "Pago" },
          ]}
        />
        <Graph
          title="Resultado previsto por obra"
          rows={workChart}
          x="name"
          keys={[{ key: "value", name: "Resultado" }]}
        />
        <Graph
          title="Distribuição de despesas pagas por categoria"
          rows={[...categories].map(([name, value]) => ({ name, value }))}
          x="name"
          keys={[{ key: "value", name: "Despesas" }]}
        />
        <Graph
          title="Previsto × realizado · fluxo mensal"
          rows={monthly}
          x="month"
          keys={[
            { key: "expected", name: "Previsto" },
            { key: "cash", name: "Realizado" },
          ]}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          ["Maiores resultados previstos", ranked.slice(0, 5), "result"],
          ["Maiores custos previstos", byCost.slice(0, 5), "cost"],
          ["Pagamentos atrasados", works.filter((w) => w.overdue > 0), "overdue"],
        ].map(([title, list, kind]) => (
          <section key={String(title)} className={cn(panelClass, "p-4 sm:p-5")}>
            <h3 className="mb-2 text-base font-semibold">{String(title)}</h3>
            {(list as typeof works).map((w) => (
              <Link
                key={w.work.id}
                to="/obras/$id"
                params={{ id: w.work.id }}
                className="-mx-2 flex justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
              >
                <span className="min-w-0 break-words">{w.work.name}</span>
                <Money
                  className="shrink-0 font-semibold"
                  value={
                    kind === "overdue"
                      ? w.overdue
                      : kind === "cost"
                        ? w.result.cost
                        : w.result.result
                  }
                  tone={kind === "result" ? "auto" : kind === "overdue" ? "alert" : "negative"}
                />
              </Link>
            ))}
          </section>
        ))}
      </div>
      <section className="pt-2">
        <h3 className="mb-4 text-base font-semibold">Todas as obras</h3>
        <div className="grid gap-4 xl:grid-cols-2">
          {works.map((s) => (
            <article key={s.work.id} className={cn(panelClass, "p-4 sm:p-5")}>
              <Link
                to="/obras/$id"
                params={{ id: s.work.id }}
                className="font-semibold text-primary"
              >
                {s.work.name}
                {s.work.is_pilot ? " · PILOTO — TESTE" : ""}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.client} · {s.work.address} · {workStatusLabel(s.work.status)}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(s.work.actual_start || s.work.planned_start)} →{" "}
                {fmtDate(s.work.planned_end)}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Contrato", s.base.saleNet],
                  ["Aditivos", s.result.extraValue],
                  ["Atualizado", s.result.sale],
                  ["Recebido", s.totals.received],
                  ["A receber", s.balance.receivable],
                  ["Pago", s.totals.spent],
                  ["Caixa", s.totals.cash],
                  ["Resultado previsto", s.result.result],
                ].map(([l, v]) => (
                  <div key={String(l)}>
                    <dt className="text-xs text-muted-foreground">{l}</dt>
                    <dd className="text-sm font-semibold">
                      {l === "Resultado previsto" &&
                      s.work.origin === "direto" &&
                      !s.result.estimateConfirmed ? (
                        "Não conferido"
                      ) : (
                        <Money
                          value={Number(v)}
                          tone={
                            l === "Recebido"
                              ? "positive"
                              : l === "Pago"
                                ? "negative"
                                : l === "Aditivos"
                                  ? "extra"
                                  : "auto"
                          }
                        />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs">
                <span>Físico {fmtNum(s.progress)}%</span>
                <span>Recebido {fmtNum(s.balance.financialProgress)}%</span>
              </div>
              {s.overdue > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-alert">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Vencidos {brl(s.overdue)}
                </p>
              )}
            </article>
          ))}
        </div>
        {!works.length && (
          <EmptyState
            compact
            icon={HardHat}
            title="Nenhuma obra neste filtro"
            description="Ajuste o período ou os filtros acima."
          />
        )}
      </section>
    </section>
  );
}
