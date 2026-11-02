import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, NoAccess } from "@/components/page-header";
import { StructurePanel } from "@/components/finance/structure";
import { HideValuesScope, HideValuesToggle } from "@/components/hidden-values";
import { useMe } from "@/hooks/use-me";
import { pageMeta } from "@/lib/page-meta";

// Financeiro › Estrutura: custos fixos da empresa e o caixa da estrutura (admin e financeiro).
export const Route = createFileRoute("/_authenticated/estrutura")({
  head: () =>
    pageMeta(
      "Estrutura",
      "Custos fixos da JMG e o caixa da estrutura: cobertura, previsão e simulador.",
    ),
  component: Page,
});

function Page() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!me.canSeeCosts) return <NoAccess />;
  return (
    <HideValuesScope>
      <PageHeader
        title="Estrutura"
        subtitle="Custos fixos da empresa e o caixa que paga a estrutura"
        actions={<HideValuesToggle />}
      />
      <StructurePanel />
    </HideValuesScope>
  );
}
