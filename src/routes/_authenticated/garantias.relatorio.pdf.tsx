import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/works/fields";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useMe } from "@/hooks/use-me";
import { businessDate } from "@/lib/dashboard-math";
import { fmtDate, fmtBRL } from "@/lib/format";
import { pageMeta } from "@/lib/page-meta";
import { cn } from "@/lib/utils";
import {
  SLA_BUSINESS_DAYS,
  addMonths,
  claimCode,
  isOpenClaim,
  warrantyReport,
  warrantyState,
} from "@/lib/warranty";
import {
  claimCosts,
  executorNameOf,
  stageNameOf,
  warrantyInfo,
  warrantyOptions,
} from "@/lib/warranty-data";

// Relatório de garantias (menu Garantias › Relatório): chamados avisados no período, por etapa,
// por quem executou e por obra, avaliação, tempos de atendimento e lições para as próximas obras.
// Custos só para administrador/financeiro. Imprime ou salva em PDF pelo navegador.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Search = { de?: string; ate?: string; obra?: string };

export const Route = createFileRoute("/_authenticated/garantias/relatorio/pdf")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["de"] === "string" && ISO.test(s["de"]) ? { de: s["de"] } : {}),
    ...(typeof s["ate"] === "string" && ISO.test(s["ate"]) ? { ate: s["ate"] } : {}),
    ...(typeof s["obra"] === "string" && s["obra"] ? { obra: s["obra"] } : {}),
  }),
  head: () =>
    pageMeta(
      "Relatório de garantias | JMG Reformas",
      "Chamados de garantia por etapa, por quem executou e por obra, com tempos e lições.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(warrantyOptions),
  component: WarrantyReportPage,
});

function WarrantyReportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(warrantyOptions);
  const { data: me } = useMe();
  const costsOn = !!me?.canSeeCosts;
  const today = businessDate();
  const from = search.de ?? addMonths(today, -12);
  const to = search.ate ?? today;
  useDocumentTitle(`Relatório de garantias ${fmtDate(from)} a ${fmtDate(to)}`);
  const set = (patch: { [K in keyof Search]?: Search[K] | undefined }) => {
    const next: Record<string, string> = { ...search };
    for (const [k, v] of Object.entries(patch))
      if (v) next[k] = v;
      else delete next[k];
    void navigate({ to: "/garantias/relatorio/pdf", search: next as Search, replace: true });
  };
  const costs = claimCosts(data);
  const nameOf = (id: string) => {
    const w = data.warranties.find((x) => x.id === id);
    return w ? warrantyInfo(w, data).name : "Obra";
  };
  const claims = data.claims.filter((c) => !search.obra || c.warranty_id === search.obra);
  const r = warrantyReport({
    claims,
    visits: data.visits,
    costs,
    from,
    to,
    stageName: stageNameOf(data),
    executorName: executorNameOf(data),
    warrantyName: nameOf,
  });
  const active = data.warranties.filter((w) => {
    const p = warrantyState(w, today).phase;
    return p === "ativa" || p === "vencendo";
  }).length;
  const maxStage = Math.max(1, ...r.byStage.map((s) => s.claims));
  const n1 = (x: number | null, unit: string) =>
    x === null ? "—" : `${x.toFixed(1).replace(".", ",").replace(",0", "")} ${unit}`;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const inPeriod = claims
    .filter((c) => c.reported_at >= from && c.reported_at <= to)
    .sort((a, b) => b.reported_at.localeCompare(a.reported_at));
  const worstExecutor = r.byExecutor
    .filter((e) => e.works > 0)
    .sort((a, b) => b.perWork - a.perWork)[0];

  return (
    <div className="min-h-screen bg-muted p-3 sm:p-4">
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-end gap-3">
        <Button asChild variant="outline">
          <Link to="/garantias">← Garantias</Link>
        </Button>
        <label className="space-y-1 text-xs">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => set({ de: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => set({ ate: e.target.value })} />
        </label>
        <label className="min-w-48 space-y-1 text-xs">
          <Label>Obra</Label>
          <select
            className={selectClass}
            value={search.obra ?? ""}
            onChange={(e) => set({ obra: e.target.value || undefined })}
          >
            <option value="">Todas as obras</option>
            {data.warranties
              .map((w) => ({ id: w.id, name: warrantyInfo(w, data).name }))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </label>
        <Button className="ml-auto" type="button" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir / salvar PDF
        </Button>
      </div>

      <article className="schedule-print mx-auto max-w-4xl overflow-hidden bg-card text-sm text-card-foreground">
        <header className="flex flex-wrap items-end justify-between gap-4 bg-hero px-6 py-6 text-hero-foreground sm:px-10">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-gold">JMG REFORMAS</p>
            <h1 className="mt-1 text-2xl font-bold">Relatório de garantias</h1>
            <p className="mt-1 text-xs text-hero-foreground/75">
              Chamados avisados de {fmtDate(from)} a {fmtDate(to)} ·{" "}
              {search.obra ? nameOf(search.obra) : "todas as obras"} · {active}{" "}
              {active === 1 ? "garantia ativa" : "garantias ativas"} hoje
            </p>
          </div>
          <p className="text-right text-xs text-hero-foreground/75">Emitido em {fmtDate(today)}</p>
        </header>

        <div className="space-y-7 px-6 py-6 sm:px-10">
          <div
            className={cn(
              "grid grid-cols-2 gap-2.5",
              costsOn ? "sm:grid-cols-5" : "sm:grid-cols-4",
            )}
          >
            <Stat value={r.total} label="chamados" />
            <Stat
              value={r.visits}
              label={`visitas · ${r.visitsPerClaim.toFixed(1).replace(".", ",")} por chamado`}
            />
            <Stat
              value={r.onTimeRate === null ? "—" : pct(r.onTimeRate)}
              label={`1ª visita em até ${SLA_BUSINESS_DAYS} dias úteis`}
            />
            <Stat value={n1(r.avgResolution, "dias úteis")} label="tempo médio para resolver" />
            {costsOn && <Stat value={fmtBRL(r.cost)} label="custo da garantia" gold />}
          </div>

          <section className="break-inside-avoid">
            <h2 className="mb-2 font-bold text-hero">Chamados por etapa</h2>
            {r.byStage.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="p-2">Etapa</th>
                    <th className="p-2 text-right">Chamados</th>
                    <th className="p-2 text-right">Visitas</th>
                    <th className="p-2 text-right">Obras</th>
                    {costsOn && <th className="p-2 text-right">Custo</th>}
                    <th className="w-44 p-2">Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byStage.map((s, i) => (
                    <tr key={s.id} className="border-b">
                      <td className="p-2 font-semibold">{s.name}</td>
                      <td className="p-2 text-right num">{s.claims}</td>
                      <td className="p-2 text-right num">{s.visits}</td>
                      <td className="p-2 text-right num">{s.works}</td>
                      {costsOn && <td className="p-2 text-right num">{fmtBRL(s.cost)}</td>}
                      <td className="p-2">
                        <span className="flex items-center gap-2">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className={cn("block h-full", i === 0 ? "bg-gold" : "bg-primary")}
                              style={{ width: `${(s.claims / maxStage) * 100}%` }}
                            />
                          </span>
                          <span className="w-9 text-right text-muted-foreground num">
                            {pct(s.share)}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum chamado no período.</p>
            )}
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <section className="break-inside-avoid">
              <h2 className="mb-2 font-bold text-hero">Por quem executou</h2>
              <table className="w-full text-xs">
                <tbody>
                  {r.byExecutor.map((e) => (
                    <tr key={e.key} className="border-b">
                      <td className="p-2">{e.name}</td>
                      <td
                        className={cn(
                          "p-2 text-right num",
                          e === worstExecutor && e.perWork > 1 && "font-semibold text-negative",
                        )}
                      >
                        {e.claims} {e.claims === 1 ? "chamado" : "chamados"} ·{" "}
                        {e.perWork.toFixed(1).replace(".", ",")} por obra
                      </td>
                    </tr>
                  ))}
                  {!r.byExecutor.length && (
                    <tr>
                      <td className="p-2 text-muted-foreground">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
            <section className="break-inside-avoid">
              <h2 className="mb-2 font-bold text-hero">Por obra</h2>
              <table className="w-full text-xs">
                <tbody>
                  {r.byWarranty.map((w) => (
                    <tr key={w.id} className="border-b">
                      <td className="p-2">{w.name}</td>
                      <td className="p-2 text-right num">
                        {w.claims} {w.claims === 1 ? "chamado" : "chamados"} · {w.visits}{" "}
                        {w.visits === 1 ? "visita" : "visitas"}
                        {costsOn && ` · ${fmtBRL(w.cost)}`}
                      </td>
                    </tr>
                  ))}
                  {!r.byWarranty.length && (
                    <tr>
                      <td className="p-2 text-muted-foreground">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>

          <section className="break-inside-avoid">
            <h2 className="mb-2 font-bold text-hero">Avaliação dos chamados</h2>
            {r.total ? (
              <>
                <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-muted">
                  <span className="bg-primary" style={{ width: pct(r.covered / r.total) }} />
                  <span className="bg-primary/35" style={{ width: pct(r.pending / r.total) }} />
                  <span className="bg-gold" style={{ width: pct(r.notCovered / r.total) }} />
                </div>
                <p className="text-xs leading-relaxed">
                  <b>
                    {r.covered} {r.covered === 1 ? "procedente" : "procedentes"}
                  </b>{" "}
                  (cobertos pela garantia)
                  {r.pending > 0 && ` · ${r.pending} a avaliar`} ·{" "}
                  <b>
                    {r.notCovered} {r.notCovered === 1 ? "não coberto" : "não cobertos"}
                  </b>
                  {r.reasons.length > 0 &&
                    `: ${r.reasons.map((x) => `${x.label} ${x.count}`).join(" · ")}`}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum chamado no período.</p>
            )}
          </section>

          {(r.lessons.length > 0 || r.byStage[0]) && (
            <section className="break-inside-avoid rounded-xl bg-gold-soft p-4 text-alert">
              <h2 className="mb-2 font-bold">Pontos de atenção para as próximas obras</h2>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                {r.byStage[0] && r.byStage[0].claims > 1 && (
                  <li>
                    {r.byStage[0].name} concentra {pct(r.byStage[0].share)} dos chamados do período
                    {r.byStage[0].works > 1 ? ` (${r.byStage[0].works} obras)` : ""}.
                  </li>
                )}
                {worstExecutor && worstExecutor.perWork > 1 && worstExecutor.key !== "equipe:" && (
                  <li>
                    {worstExecutor.name} tem {worstExecutor.perWork.toFixed(1).replace(".", ",")}{" "}
                    chamados por obra: rever a conferência desse serviço.
                  </li>
                )}
                {r.lessons.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    {l.stage !== "Sem etapa" && <b>{l.stage}: </b>}
                    {l.lesson}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px]">
                As lições vêm do que foi registrado nas visitas e nos chamados.
              </p>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-bold text-hero">Chamados do período</h2>
            {inPeriod.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="p-2">Chamado</th>
                    <th className="p-2">Obra</th>
                    <th className="p-2">Etapa</th>
                    <th className="p-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {inPeriod.map((c) => (
                    <tr key={c.id} className="border-b align-top">
                      <td className="p-2">
                        <b className="num">{claimCode(c.number)}</b> · {fmtDate(c.reported_at)}
                        <span className="block text-muted-foreground">{c.description}</span>
                      </td>
                      <td className="p-2">{nameOf(c.warranty_id)}</td>
                      <td className="p-2">{stageNameOf(data)(c.stage_id)}</td>
                      <td className="whitespace-nowrap p-2">
                        {c.resolved_at
                          ? `Resolvido ${fmtDate(c.resolved_at)}`
                          : isOpenClaim(c, data.visits)
                            ? "Em aberto"
                            : "Não coberto"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum chamado no período.</p>
            )}
          </section>
        </div>
        <footer className="flex justify-between bg-hero px-6 py-3 text-[11px] text-hero-foreground/75 sm:px-10">
          <span>JMG Reformas · relatório interno{costsOn ? " (contém custos)" : ""}</span>
          <span>Garantias</span>
        </footer>
      </article>
    </div>
  );
}

function Stat({ value, label, gold }: { value: string | number; label: string; gold?: boolean }) {
  return (
    <div className={cn("rounded-xl p-3", gold ? "bg-gold-soft text-alert" : "bg-muted")}>
      <div className="text-xl font-bold num">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
