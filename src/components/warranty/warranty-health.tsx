import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconBubble } from "@/components/kpi";
import { businessDate } from "@/lib/dashboard-math";
import { useBRL } from "@/lib/hidden-values";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { addMonths, claimSla, isOpenClaim, warrantyState } from "@/lib/warranty";
import { claimCosts, warrantyInfo, warrantyOptions } from "@/lib/warranty-data";

/** Card do Painel: garantias ativas, chamados, fora do prazo, próximas a vencer e custo no ano. */
export function WarrantyHealthCard() {
  const brl = useBRL();
  const today = businessDate();
  const { data } = useQuery(warrantyOptions);
  if (!data || !data.warranties.length) return null;
  const rows = data.warranties
    .map((w) => ({ w, s: warrantyState(w, today), name: warrantyInfo(w, data).name }))
    .filter((r) => r.s.phase === "ativa" || r.s.phase === "vencendo")
    .sort((a, b) => a.s.left - b.s.left);
  const open = data.claims.filter((c) => isOpenClaim(c, data.visits));
  const late = open.filter((c) => claimSla(c, data.visits, today).state === "fora_do_prazo");
  const costs = claimCosts(data);
  const yearAgo = addMonths(today, -12);
  const cost = data.claims
    .filter((c) => c.reported_at >= yearAgo)
    .reduce((a, c) => a + (costs.get(c.id) ?? 0), 0);
  return (
    <section
      className={cn(panelClass, "flex flex-col gap-4 p-4 sm:p-5")}
      aria-labelledby="painel-garantias"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="painel-garantias" className="flex items-center gap-2 text-lg font-bold">
          <IconBubble icon={ShieldCheck} tone="brand" />
          Garantias
        </h2>
        <Link
          to="/garantias"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          Abrir <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Tile value={rows.length} label="ativas" />
        <Tile value={open.length} label="chamados abertos" />
        <Tile value={late.length} label="fora do prazo" bad={late.length > 0} />
      </div>
      {rows.length > 0 && (
        <div className="space-y-2 text-sm">
          <span className="text-[13px] font-semibold">Próximas a vencer</span>
          {rows.slice(0, 3).map((r) => (
            <div key={r.w.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{r.name}</span>
              {r.s.phase === "vencendo" ? (
                <Badge variant="alert">{r.s.left} dias</Badge>
              ) : (
                <span className="text-muted-foreground num">{r.s.left} dias</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between gap-2 border-t border-border/60 pt-3 text-sm">
        <span className="text-muted-foreground">Custo de garantia nos últimos 12 meses</span>
        <b className="num">{brl(cost)}</b>
      </div>
    </section>
  );
}

function Tile({ value, label, bad }: { value: number; label: string; bad?: boolean }) {
  return (
    <div className={cn("rounded-xl p-3", bad ? "bg-negative-soft text-negative" : "bg-muted")}>
      <div className="text-2xl font-bold num">{value}</div>
      <div className={cn("text-xs", bad ? "text-negative" : "text-muted-foreground")}>{label}</div>
    </div>
  );
}
