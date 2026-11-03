import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  BarChart3,
  Building2,
  CircleAlert,
  FileDown,
  HardHat,
  Plus,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/feedback";
import { KpiCard, Segmented } from "@/components/kpi";
import { PageHeader } from "@/components/page-header";
import { fmtDate } from "@/lib/format";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import {
  SLA_BUSINESS_DAYS,
  WARRANTY_MONTHS,
  addMonths,
  claimSla,
  daysBetween,
  isOpenClaim,
  warrantyReport,
  warrantyState,
  type WarrantyPhase,
} from "@/lib/warranty";
import {
  claimCosts,
  executorNameOf,
  stageNameOf,
  warrantyInfo,
  type Warranty,
  type WarrantyData,
} from "@/lib/warranty-data";
import {
  ClaimDialog,
  VisitDialog,
  WarrantyDialog,
  type ClaimDraft,
  type VisitDraft,
} from "./warranty-dialogs";
import { ClaimCard, PhaseBadge, WarrantyBar } from "./warranty-parts";

type Filter = "ativas" | "vencendo" | "encerradas" | "todas";
const FILTERS: [Filter, string][] = [
  ["ativas", "Ativas"],
  ["vencendo", "Vencendo"],
  ["encerradas", "Encerradas"],
  ["todas", "Todas"],
];
const matches = (f: Filter, p: WarrantyPhase) =>
  f === "todas" ||
  (f === "ativas" && (p === "ativa" || p === "vencendo" || p === "futura")) ||
  (f === "vencendo" && p === "vencendo") ||
  (f === "encerradas" && p === "encerrada");

/** Menu Execução › Garantias: todas as garantias, chamados em aberto e onde mais dá problema. */
export function WarrantyBoard({
  data,
  today,
  canSeeCosts,
}: {
  data: WarrantyData;
  today: string;
  canSeeCosts: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("ativas");
  const [q, setQ] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  const [newWarranty, setNewWarranty] = useState<{ workId?: string } | null>(null);
  const [editing, setEditing] = useState<Warranty | null>(null);
  const [claim, setClaim] = useState<ClaimDraft | null>(null);
  const [visit, setVisit] = useState<VisitDraft | null>(null);
  const costs = useMemo(() => claimCosts(data), [data]);

  const rows = data.warranties.map((w) => {
    const info = warrantyInfo(w, data);
    const claims = data.claims.filter((c) => c.warranty_id === w.id);
    return {
      w,
      info,
      state: warrantyState(w, today),
      claims: claims.length,
      open: claims.filter((c) => isOpenClaim(c, data.visits)).length,
    };
  });
  const live = rows.filter((r) => r.state.phase !== "encerrada");
  const soon = rows.filter((r) => r.state.phase === "vencendo");
  const openClaims = data.claims.filter((c) => isOpenClaim(c, data.visits));
  const late = openClaims.filter((c) => claimSla(c, data.visits, today).state === "fora_do_prazo");
  const thisWeek = data.visits.filter(
    (v) => !v.done && v.visit_date >= today && daysBetween(today, v.visit_date) <= 7,
  );
  const term = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => matches(filter, r.state.phase))
    .filter(
      (r) =>
        !term ||
        [r.info.name, r.info.client, r.info.address].some((x) => x?.toLowerCase().includes(term)),
    )
    .sort((a, b) => a.state.left - b.state.left);
  const shownClaims = (onlyLate ? late : openClaims)
    .map((c) => ({ c, sla: claimSla(c, data.visits, today) }))
    .sort(
      (a, b) =>
        Number(b.sla.state === "fora_do_prazo") - Number(a.sla.state === "fora_do_prazo") ||
        a.c.reported_at.localeCompare(b.c.reported_at),
    );
  const nameOf = (warrantyId: string) => {
    const w = data.warranties.find((x) => x.id === warrantyId);
    return w ? warrantyInfo(w, data).name : "Obra";
  };
  const year = warrantyReport({
    claims: data.claims,
    visits: data.visits,
    costs,
    from: addMonths(today, -12),
    to: today,
    stageName: stageNameOf(data),
    executorName: executorNameOf(data),
    warrantyName: nameOf,
  });
  const maxStage = Math.max(1, ...year.byStage.map((s) => s.claims));
  // Obras concluídas que ainda não têm garantia registrada.
  const missing = data.works.filter(
    (w) => w.status === "concluida" && !data.warranties.some((x) => x.work_id === w.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Execução"
        title="Garantias"
        subtitle={`Prazo de ${WARRANTY_MONTHS} meses a partir da entrega · atendimento em até ${SLA_BUSINESS_DAYS} dias úteis (cláusula do contrato)`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/garantias/relatorio/pdf">
                <BarChart3 className="h-4 w-4" />
                Relatório
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => setNewWarranty({})}>
              <Building2 className="h-4 w-4" />
              Cadastrar obra já entregue
            </Button>
            <Button
              type="button"
              onClick={() => setClaim({})}
              disabled={!live.length}
              title={live.length ? undefined : "Cadastre uma garantia primeiro"}
            >
              <Plus className="h-4 w-4" />
              Novo chamado
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Garantias ativas"
          value={live.length}
          icon={ShieldCheck}
          tone="brand"
          hint={(() => {
            const n = live.filter((r) => r.info.legacy).length;
            return `${n} ${n === 1 ? "cadastrada" : "cadastradas"} manualmente`;
          })()}
          onClick={() => setFilter("ativas")}
        />
        <KpiCard
          label="Vencem em 30 dias"
          value={soon.length}
          icon={AlarmClock}
          tone="alert"
          filled={soon.length > 0}
          hint="Agendar a vistoria final"
          onClick={() => setFilter("vencendo")}
        />
        <KpiCard
          label="Chamados em aberto"
          value={openClaims.length}
          icon={Wrench}
          tone="neutral"
          hint={`${thisWeek.length} ${thisWeek.length === 1 ? "visita agendada" : "visitas agendadas"} nos próximos 7 dias`}
          onClick={() => setOnlyLate(false)}
        />
        <KpiCard
          label={`Fora do prazo de ${SLA_BUSINESS_DAYS} dias úteis`}
          value={late.length}
          icon={CircleAlert}
          tone="negative"
          filled={late.length > 0}
          hint="1ª visita ainda não feita"
          onClick={() => setOnlyLate(true)}
        />
      </div>

      {missing.length > 0 && (
        <section className={cn(panelClass, "flex flex-wrap items-center gap-3 p-4")}>
          <HardHat className="h-5 w-5 text-alert" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm">
            <b>
              {missing.length === 1
                ? "1 obra concluída sem garantia registrada:"
                : `${missing.length} obras concluídas sem garantia registrada:`}
            </b>{" "}
            {missing.slice(0, 4).map((w, i) => (
              <span key={w.id}>
                {i > 0 && ", "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setNewWarranty({ workId: w.id })}
                >
                  {w.name}
                </button>
              </span>
            ))}
            {missing.length > 4 && ` e mais ${missing.length - 4}`}
          </p>
        </section>
      )}

      <section className={cn(panelClass, "overflow-hidden")} aria-labelledby="g-lista">
        <header className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 id="g-lista" className="text-base font-semibold">
              Garantias das obras
            </h2>
            <p className="text-xs text-muted-foreground">
              Dias que faltam contados a partir de hoje ({fmtDate(today)})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              placeholder="Buscar obra ou cliente"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-full sm:w-48"
              aria-label="Buscar obra ou cliente"
            />
            <Segmented>
              {FILTERS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={filter === k}
                  className={segmentClass(filter === k)}
                  onClick={() => setFilter(k)}
                >
                  {label}
                </button>
              ))}
            </Segmented>
          </div>
        </header>
        {shown.length ? (
          <div className="overflow-x-auto border-t border-border/60">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Obra · cliente</th>
                  <th className="px-3 py-2.5 font-semibold">Origem</th>
                  <th className="px-3 py-2.5 font-semibold">Início</th>
                  <th className="px-3 py-2.5 font-semibold">Fim</th>
                  <th className="w-64 px-3 py-2.5 font-semibold">Prazo</th>
                  <th className="px-3 py-2.5 font-semibold">Chamados</th>
                  <th className="px-3 py-2.5 font-semibold">Situação</th>
                  <th className="px-4 py-2.5 sm:px-5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {shown.map((r) => (
                  <tr key={r.w.id} className="align-middle">
                    <td className="px-4 py-3 sm:px-5">
                      {r.w.work_id ? (
                        <Link
                          to="/obras/$id"
                          params={{ id: r.w.work_id }}
                          search={{ tab: "garantia" }}
                          className="font-semibold hover:underline"
                        >
                          {r.info.name}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="text-left font-semibold hover:underline"
                          onClick={() => setEditing(r.w)}
                        >
                          {r.info.name}
                        </button>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {r.info.client ?? r.info.address ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {r.info.legacy ? (
                        <Badge variant="alert" className="whitespace-nowrap">
                          Cadastrada manualmente
                        </Badge>
                      ) : (
                        <Badge variant="info" className="whitespace-nowrap">
                          Entregue pela plataforma
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 num">{fmtDate(r.w.start_date)}</td>
                    <td className="px-3 py-3 num">{fmtDate(r.w.end_date)}</td>
                    <td className="px-3 py-3">
                      <div className="mb-1.5 flex justify-between gap-2 text-xs">
                        <b
                          className={cn(
                            "whitespace-nowrap num",
                            r.state.phase === "vencendo" && "text-alert",
                            r.state.phase === "encerrada" && "text-muted-foreground",
                          )}
                        >
                          {r.state.label}
                        </b>
                        <span className="text-muted-foreground num">
                          {r.state.elapsed}% do prazo
                        </span>
                      </div>
                      <WarrantyBar warranty={r.w} today={today} />
                    </td>
                    <td className="px-3 py-3 num">
                      {r.claims}
                      {r.open > 0 && (
                        <span className="text-muted-foreground"> ({r.open} em aberto)</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <PhaseBadge warranty={r.w} today={today} />
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <div className="flex justify-end gap-1">
                        {r.state.phase !== "encerrada" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setClaim({ warranty_id: r.w.id })}
                          >
                            <Plus className="h-4 w-4" />
                            Chamado
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(r.w)}
                        >
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            compact
            title={rows.length ? "Nenhuma garantia neste filtro" : "Nenhuma garantia ainda"}
            description={
              rows.length
                ? "Troque o filtro acima para ver as outras."
                : "Registre a entrega de uma obra (aba Garantia da obra) ou cadastre uma obra já entregue."
            }
          />
        )}
      </section>

      <div className="flex flex-wrap gap-6">
        <section
          className={cn(panelClass, "min-w-0 flex-[999_1_560px] overflow-hidden")}
          aria-labelledby="g-chamados"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2 sm:p-5 sm:pb-2">
            <div>
              <h2 id="g-chamados" className="text-base font-semibold">
                {onlyLate ? "Chamados fora do prazo" : "Chamados em aberto"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Prazo de {SLA_BUSINESS_DAYS} dias úteis do aviso do cliente até a 1ª visita
              </p>
            </div>
            {onlyLate && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setOnlyLate(false)}>
                Ver todos em aberto
              </Button>
            )}
          </header>
          {shownClaims.length ? (
            <div className="divide-y divide-border/60 border-t border-border/60">
              {shownClaims.map(({ c }) => (
                <ClaimCard
                  key={c.id}
                  claim={c}
                  data={data}
                  today={today}
                  canSeeCosts={canSeeCosts}
                  costs={costs}
                  showWork={nameOf(c.warranty_id)}
                  onEdit={() => setClaim(c)}
                  onVisit={(v) => setVisit(v)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Wrench}
              compact
              title="Nenhum chamado em aberto"
              description="Quando o cliente avisar um problema, abra um chamado em Novo chamado."
            />
          )}
        </section>

        <section
          className={cn(
            panelClass,
            "flex min-w-0 flex-[1_1_340px] flex-col gap-3 self-start p-4 sm:p-5",
          )}
          aria-labelledby="g-etapas"
        >
          <div>
            <h2 id="g-etapas" className="text-base font-semibold">
              Onde mais dá problema
            </h2>
            <p className="text-xs text-muted-foreground">Chamados por etapa · últimos 12 meses</p>
          </div>
          {year.byStage.length ? (
            year.byStage.slice(0, 8).map((s, i) => (
              <div key={s.id} className="space-y-1">
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground num">
                    {s.claims} · {Math.round(s.share * 100)}%
                    {s.works > 1 ? ` · ${s.works} obras` : ""}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", i === 0 ? "bg-gold" : "bg-primary")}
                    style={{ width: `${(s.claims / maxStage) * 100}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Sem chamados nos últimos 12 meses.</p>
          )}
          <Button variant="link" asChild className="h-auto justify-start px-0">
            <Link to="/garantias/relatorio/pdf">
              <FileDown className="h-4 w-4" />
              Ver relatório completo
            </Link>
          </Button>
        </section>
      </div>

      <WarrantyDialog
        open={!!newWarranty}
        onClose={() => setNewWarranty(null)}
        data={data}
        workId={newWarranty?.workId}
        canSeeCosts={canSeeCosts}
      />
      <WarrantyDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        data={data}
        warranty={editing ?? undefined}
        canSeeCosts={canSeeCosts}
      />
      <ClaimDialog draft={claim} data={data} onClose={() => setClaim(null)} />
      <VisitDialog
        draft={visit}
        data={data}
        canSeeCosts={canSeeCosts}
        onClose={() => setVisit(null)}
      />
    </div>
  );
}
