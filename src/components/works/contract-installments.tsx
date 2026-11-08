import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SubmitForm } from "@/components/enter-submit";
import {
  contractInstallmentDraft,
  createContractInstallments,
  type InstallmentDraftRow,
} from "@/lib/work-budget";
import { BASIS_LABEL } from "@/lib/contract-installments";
import { fmtBRL, fmtDate } from "@/lib/format";
import { maskBRL, parseBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

type Row = InstallmentDraftRow & { skip: boolean; money: string };

const contractInstallmentsKey = (workId: string) => ["contract-installments", workId];

/**
 * "Gerar parcelas do orçamento" (R0-2): parcelas das condições de pagamento do orçamento, com
 * vencimento pelas etapas da obra, para conferir e gravar como contas a receber. Parcelas que
 * batem com uma entrada já lançada à mão vêm marcadas como "já lançada" e não são geradas.
 * Devolve `fallback` quando a obra não tem orçamento com condições (obra direta / antiga).
 */
export function ContractInstallmentsButton({
  workId,
  fallback = null,
}: {
  workId: string;
  fallback?: ReactNode;
}) {
  const { data, error } = useQuery({
    queryKey: contractInstallmentsKey(workId),
    queryFn: () => contractInstallmentDraft(workId),
  });
  const [open, setOpen] = useState(false);
  if (error || !data) return null;
  if (data.generated) return null;
  if (!data.plan.length) return <>{fallback}</>;
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Receipt className="h-4 w-4" />
        Gerar parcelas do orçamento
      </Button>
      {open && <InstallmentsDialog workId={workId} data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

function InstallmentsDialog({
  workId,
  data,
  onClose,
}: {
  workId: string;
  data: Awaited<ReturnType<typeof contractInstallmentDraft>>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    data.plan.map((p) => ({ ...p, skip: !!p.matchedEntryId, money: fmtBRL(p.amount) })),
  );
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toCreate = rows.filter((r) => !r.skip);
  const cents = (n: number) => Math.round(n * 100);
  const planned = rows.reduce((t, r) => t + cents(r.amount), 0) / 100;
  const diff = Math.round((planned - data.total) * 100) / 100;
  const invalid = toCreate.some((r) => !(r.amount > 0) || !r.due_date || !r.description.trim());

  async function save() {
    if (!toCreate.length) {
      toast.error("Todas as parcelas estão marcadas como já lançadas.");
      return;
    }
    if (invalid) {
      toast.error("Confira descrição, valor e vencimento de cada parcela.");
      return;
    }
    setBusy(true);
    try {
      await createContractInstallments(workId, toCreate, requestId);
      await qc.invalidateQueries();
      toast.success(
        `${toCreate.length} parcela${toCreate.length > 1 ? "s" : ""} do contrato em contas a receber.`,
      );
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Parcelas do contrato</DialogTitle>
        </DialogHeader>
        <SubmitForm onSubmit={() => void save()} pending={busy}>
          <p className="text-sm text-muted-foreground">
            Valores e condições do orçamento aprovado ({fmtBRL(data.total)}). O vencimento segue o
            cronograma da obra; confira e ajuste se precisar.
          </p>
          <ol className="grid gap-2">
            {rows.map((r, i) => (
              <li
                key={i}
                className={cn(
                  "grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-[1fr_9rem_10rem] sm:items-end",
                  r.skip && "bg-muted/50 opacity-70",
                )}
              >
                <label className="grid gap-1 text-xs text-muted-foreground">
                  {i + 1}ª parcela · {r.pct}%{r.when ? ` · ${r.when}` : ""}
                  <Input
                    aria-label={`Descrição da parcela ${i + 1}`}
                    value={r.description}
                    disabled={r.skip}
                    onChange={(e) => set(i, { description: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Valor
                  <Input
                    aria-label={`Valor da parcela ${i + 1}`}
                    inputMode="numeric"
                    className="text-right num"
                    value={r.money}
                    disabled={r.skip}
                    onChange={(e) => {
                      const money = maskBRL(e.target.value);
                      set(i, { money, amount: parseBRL(money) });
                    }}
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarClock aria-hidden className="h-3 w-3" />
                    Vence · {BASIS_LABEL[r.basis]}
                  </span>
                  <Input
                    aria-label={`Vencimento da parcela ${i + 1}`}
                    type="date"
                    value={r.due_date}
                    disabled={r.skip}
                    onChange={(e) => set(i, { due_date: e.target.value })}
                  />
                </label>
                {data.existing.length > 0 && (
                  <label className="flex items-center gap-2 text-xs sm:col-span-3">
                    <input
                      type="checkbox"
                      checked={r.skip}
                      onChange={(e) => set(i, { skip: e.target.checked })}
                    />
                    Já lançada no Financeiro (não gerar de novo)
                  </label>
                )}
              </li>
            ))}
          </ol>
          {data.existing.length > 0 && (
            <div className="rounded-xl bg-alert-soft px-3 py-2 text-sm">
              <p className="font-medium text-alert">Entradas já lançadas nesta obra</p>
              <ul className="mt-1 grid gap-0.5 text-xs">
                {data.existing.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {e.description} · {fmtDate(e.due_date)}
                    </span>
                    <span className="num">{fmtBRL(Number(e.amount))}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Marque acima as parcelas que essas entradas já representam.
              </p>
            </div>
          )}
          {diff !== 0 && (
            <p className="text-sm text-alert">
              As parcelas somam {fmtBRL(planned)}, {fmtBRL(Math.abs(diff))}{" "}
              {diff > 0 ? "a mais" : "a menos"} que o contrato.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !toCreate.length}>
              {busy
                ? "Gerando…"
                : `Gerar ${toCreate.length} parcela${toCreate.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </SubmitForm>
      </DialogContent>
    </Dialog>
  );
}
