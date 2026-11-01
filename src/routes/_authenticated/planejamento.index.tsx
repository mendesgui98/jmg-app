import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { pageMeta } from "@/lib/page-meta";
import { businessDate } from "@/lib/dashboard-math";
import { planningOptions } from "@/lib/planning-data";
import { PageHeader } from "@/components/page-header";
import { PlanningBoard } from "@/components/planning/planning-board";
import { planningSearch } from "@/lib/planning-search";

export const Route = createFileRoute("/_authenticated/planejamento/")({
  head: () =>
    pageMeta(
      "Planejamento",
      "Tarefas das obras por semana e por dia, com urgências e dependências.",
    ),
  validateSearch: planningSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(planningOptions),
  component: Planning,
});

function Planning() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(planningOptions);
  return (
    <div>
      <PageHeader
        eyebrow="Execução"
        title="Planejamento"
        subtitle="O que cada obra faz em cada dia: tarefas urgentes e o que precisa terminar para liberar o próximo"
      />
      <PlanningBoard data={data} today={businessDate()} search={search} />
    </div>
  );
}
