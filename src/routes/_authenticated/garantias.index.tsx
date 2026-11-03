import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { pageMeta } from "@/lib/page-meta";
import { businessDate } from "@/lib/dashboard-math";
import { warrantyOptions } from "@/lib/warranty-data";
import { useMe } from "@/hooks/use-me";
import { WarrantyBoard } from "@/components/warranty/warranty-board";

export const Route = createFileRoute("/_authenticated/garantias/")({
  head: () =>
    pageMeta(
      "Garantias",
      "Garantias das obras entregues: dias que faltam, chamados do cliente, visitas e relatório por etapa.",
    ),
  loader: ({ context }) => context.queryClient.ensureQueryData(warrantyOptions),
  component: Warranties,
});

function Warranties() {
  const { data } = useSuspenseQuery(warrantyOptions);
  const { data: me } = useMe();
  return <WarrantyBoard data={data} today={businessDate()} canSeeCosts={!!me?.canSeeCosts} />;
}
