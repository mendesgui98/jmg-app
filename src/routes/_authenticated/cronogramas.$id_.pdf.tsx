import { DeletedRecordNotice } from "@/components/management/record-deletion";
import { businessDate } from "@/lib/dashboard-math";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { scheduleOptions } from "@/lib/schedule-data";
import { pageMeta } from "@/lib/page-meta";
import { snapshotStages } from "@/lib/work-schedule";
import { Button } from "@/components/ui/button";
import { ScaledSheets } from "@/components/works/schedule-sheets";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { documentFileName } from "@/lib/file-names";
export const Route = createFileRoute("/_authenticated/cronogramas/$id_/pdf")({
  validateSearch: (s: Record<string, unknown>): { version?: number | undefined } => ({
    version: typeof s["version"] === "number" ? s["version"] : undefined,
  }),
  head: () =>
    pageMeta(
      "Documento do cronograma",
      "Cronograma profissional JMG: etapas, datas e Gantt, sem informações financeiras internas.",
    ),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(scheduleOptions(params.id)),
  component: Document,
});
function Document() {
  const { id } = Route.useParams();
  const { version } = Route.useSearch();
  const { data } = useSuspenseQuery(scheduleOptions(id));
  const h = data.header;
  useDocumentTitle(
    documentFileName(h.name, h.client_name, { prefix: "Cronograma" }).replace(/\.pdf$/, ""),
  );
  if (h.deleted_at) return <DeletedRecordNotice entity="schedules" id={id} name={h.name} />;
  const saved = data.versions.find((v) => v.version === version);
  const stages = saved ? snapshotStages(saved.stages) : data.stages;
  const missing = version !== undefined && !saved;
  const revision = Math.max(0, (saved?.version ?? data.versions.at(-1)?.version ?? 1) - 1);
  return (
    <div className="bg-muted p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[297mm] flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/cronogramas/$id" params={{ id }}>
            ← Cronograma
          </Link>
        </Button>
        <Button disabled={missing || !stages.length} onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
        <select
          aria-label="Versão do documento"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={version ?? ""}
          onChange={(e) => {
            const url = new URL(window.location.href);
            if (e.target.value) url.searchParams.set("version", e.target.value);
            else url.searchParams.delete("version");
            window.location.assign(url.href);
          }}
        >
          <option value="">Cronograma Atual</option>
          {data.versions.map((v) => (
            <option key={v.id} value={v.version}>
              {v.version === 1 ? "Cronograma Original" : `Reprogramação ${v.version - 1}`}
            </option>
          ))}
        </select>
      </div>
      {missing ? (
        <p role="alert">Versão não encontrada.</p>
      ) : (
        <div className="mx-auto max-w-[297mm]">
          <ScaledSheets
            title={h.name}
            client={h.client_name || null}
            address={h.address}
            codes={[]}
            revision={`Rev. ${String(revision).padStart(2, "0")}`}
            issued={businessDate()}
            stages={[...stages]
              .filter((s) => s.planned_start)
              .sort((a, b) => a.sort - b.sort)
              .map((s) => ({ id: s.id, name: s.name, start: s.planned_start, end: s.planned_end }))}
          />
        </div>
      )}
    </div>
  );
}
