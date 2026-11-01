import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { pageMeta } from "@/lib/page-meta";
import { businessDate } from "@/lib/dashboard-math";
import { planningOptions } from "@/lib/planning-data";
import { issuesSearch } from "@/lib/planning-search";
import { PageHeader } from "@/components/page-header";
import { IssuesBoard } from "@/components/planning/issues-board";

export const Route = createFileRoute("/_authenticated/pendencias")({
  head: () =>
    pageMeta(
      "Pendências",
      "O que está travando as obras e quem precisa resolver: JMG, cliente, arquiteto, fornecedor ou condomínio.",
    ),
  validateSearch: issuesSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(planningOptions),
  component: Issues,
});

function Issues() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(planningOptions);
  return (
    <div>
      <PageHeader
        eyebrow="Execução"
        title="Pendências"
        subtitle="Tudo que está travando as obras, quem precisa resolver e até quando"
      />
      <IssuesBoard data={data} today={businessDate()} search={search} />
    </div>
  );
}
