import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BadgeCheck, FileDown, History } from "lucide-react";
import { budgetVersionsOptions, hasUnsavedChanges } from "@/lib/budget-versions";
import { openDocument } from "@/lib/work-data";
import { documentFileName } from "@/lib/file-names";
import { fmtDate } from "@/lib/format";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconBubble, Money } from "@/components/kpi";

/** Versões salvas do orçamento (um PDF por versão); a aprovada fica marcada. */
export function BudgetVersions({
  budgetId,
  fingerprint,
  locked,
  code,
  client,
}: {
  budgetId: string;
  fingerprint: string;
  locked: boolean;
  /** Número do orçamento e cliente, para o nome do PDF baixado ("ORC-2026-0042 v2 - Ana.pdf"). */
  code: string;
  client: string | null | undefined;
}) {
  const { data: versions = [] } = useQuery(budgetVersionsOptions(budgetId));
  const { data: names = {} } = useQuery({
    queryKey: ["profile-names", versions.map((v) => v.created_by).join(",")],
    enabled: versions.length > 0,
    queryFn: async () => {
      const ids = [...new Set(versions.map((v) => v.created_by).filter((x): x is string => !!x))];
      if (!ids.length) return {};
      const r = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      return Object.fromEntries(
        (r.data ?? []).map((p) => [p.id, p.full_name || p.email || "Usuário"]),
      ) as Record<string, string>;
    },
  });
  const approved = versions.find((v) => v.approved);
  const pending = !locked && hasUnsavedChanges(versions, fingerprint);

  return (
    <section className={cn(panelClass, "mb-6 overflow-hidden")}>
      <header className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <IconBubble icon={History} tone="brand" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Versões salvas</h2>
          <p className="text-xs text-muted-foreground">
            {approved
              ? `${versions.length} ${versions.length === 1 ? "versão" : "versões"} até a aprovação · aprovada a versão ${approved.version}`
              : versions.length
                ? `${versions.length} ${versions.length === 1 ? "versão salva" : "versões salvas"}`
                : "Nenhuma versão salva ainda. Use “Salvar versão” para guardar o PDF."}
          </p>
        </div>
        {pending && versions.length > 0 && (
          <Badge variant="alert">Alterações ainda não salvas como versão</Badge>
        )}
      </header>
      {versions.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {[...versions].reverse().map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold num">
                {v.version}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  Versão {v.version}
                  {v.approved && (
                    <Badge variant="positive">
                      <BadgeCheck className="h-3 w-3" /> Aprovada
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(v.created_at.slice(0, 10))} ·{" "}
                  {new Date(v.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {names[v.created_by ?? ""] ?? "Usuário"}
                </p>
              </div>
              <Money value={v.total} className="text-sm font-semibold" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  openDocument(
                    v.file_path,
                    documentFileName(code, client, { suffix: `v${v.version}` }),
                  ).catch((e) => toast.error(e.message))
                }
              >
                <FileDown className="h-4 w-4" />
                PDF
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
