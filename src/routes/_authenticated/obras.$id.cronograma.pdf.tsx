import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { workOptions, scheduleVersionsOptions, workClientOptions } from "@/lib/work-data";
import { pageMeta } from "@/lib/page-meta";
import { snapshotStages } from "@/lib/work-schedule";
import { Button } from "@/components/ui/button";
import { ScaledSheets } from "@/components/works/schedule-sheets";
import { useWorkSheetProps } from "@/hooks/use-work-sheet-props";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { documentFileName } from "@/lib/file-names";
export const Route = createFileRoute("/_authenticated/obras/$id/cronograma/pdf")({
  validateSearch: (s: Record<string, unknown>): { version?: number | undefined } => ({
    version:
      typeof s["version"] === "number" && Number.isInteger(s["version"]) ? s["version"] : undefined,
  }),
  head: () =>
    pageMeta(
      "Cronograma da obra | JMG Reformas",
      "Planejamento da obra com etapas, datas e linha do tempo para acompanhamento do cliente.",
    ),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(workOptions(params.id)),
      context.queryClient.ensureQueryData(scheduleVersionsOptions(params.id)),
      context.queryClient.ensureQueryData(workClientOptions(params.id)),
    ]);
  },
  component: SchedulePdf,
});
function SchedulePdf() {
  const { id } = Route.useParams();
  const { version } = Route.useSearch();
  const { data } = useSuspenseQuery(workOptions(id));
  const { data: versions } = useSuspenseQuery(scheduleVersionsOptions(id));
  const saved = versions.find((v) => v.version === version);
  const missing = version !== undefined && !saved;
  const stages = saved ? snapshotStages(saved.stages) : data.stages;
  const sheet = useWorkSheetProps({ workId: id, work: data.work, stages, version: saved?.version });
  useDocumentTitle(
    documentFileName(sheet.codes.at(-1) ?? data.work.name, sheet.client, {
      prefix: "Cronograma",
    }).replace(/\.pdf$/, ""),
  );
  return (
    <div className="bg-muted p-4 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[297mm] flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/obras/$id" params={{ id }} search={{ tab: "cronograma" }}>
            ← Cronograma
          </Link>
        </Button>
        <Button disabled={missing || !stages.length} onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
      </div>
      {missing ? (
        <p role="alert">Versão não encontrada.</p>
      ) : (
        <div className="mx-auto max-w-[297mm]">
          <ScaledSheets {...sheet} />
        </div>
      )}
    </div>
  );
}
