import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Landmark, Star, Wallet } from "lucide-react";
import { contractAccountsOptions } from "@/lib/finance-data";
import {
  accountLine,
  contractBankRows,
  defaultContractAccount,
  hasBankData,
  pixLine,
} from "@/lib/bank-accounts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitForm } from "@/components/enter-submit";
import { IconBubble } from "@/components/kpi";
import { cn } from "@/lib/utils";

/**
 * Card aberto ao gerar o contrato: escolhe a conta da empresa que vai no quadro "Dados bancários"
 * (a padrão vem marcada). Contas sem dados bancários (caixa em dinheiro) aparecem desabilitadas.
 */
export function ContractAccountPicker({
  open,
  current,
  subtitle,
  onChoose,
  onCancel,
}: {
  open: boolean;
  current?: string | undefined;
  subtitle?: string;
  onChoose: (accountId: string) => void;
  onCancel: () => void;
}) {
  const { data: accounts, error } = useQuery(contractAccountsOptions);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Qual conta vai no contrato?</DialogTitle>
          <DialogDescription>
            {subtitle ? `${subtitle}. ` : ""}Os pagamentos do cliente serão feitos nesta conta.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {accounts && (
          <PickerForm
            key={current ?? "default"}
            accounts={accounts}
            current={current}
            onChoose={onChoose}
            onCancel={onCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Account = NonNullable<
  Awaited<ReturnType<(typeof contractAccountsOptions)["queryFn"]>>
>[number];

function PickerForm({
  accounts,
  current,
  onChoose,
  onCancel,
}: {
  accounts: Account[];
  current?: string | undefined;
  onChoose: (accountId: string) => void;
  onCancel: () => void;
}) {
  const usable = accounts.filter(hasBankData);
  const [selected, setSelected] = useState(
    () =>
      (current && usable.some((a) => a.id === current) ? current : null) ??
      defaultContractAccount(accounts)?.id ??
      "",
  );
  const chosen = usable.find((a) => a.id === selected);

  if (!usable.length)
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-alert-soft p-3 text-alert">
          Nenhuma conta com dados bancários. Cadastre banco e conta ou chave PIX em Financeiro →
          Contas da empresa.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button asChild>
            <Link to="/financeiro">Ir para o Financeiro</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <SubmitForm onSubmit={() => selected && onChoose(selected)} className="grid gap-4">
      <div role="radiogroup" aria-label="Conta do contrato" className="grid gap-2">
        {accounts.map((a) => {
          const ok = hasBankData(a);
          const details = [accountLine(a), pixLine(a) && `PIX ${pixLine(a)}`]
            .filter(Boolean)
            .join(" · ");
          return (
            <label
              key={a.id}
              className={cn(
                "grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 rounded-xl border p-3",
                ok
                  ? "cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  : "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="contract-account"
                value={a.id}
                disabled={!ok}
                checked={selected === a.id}
                onChange={() => setSelected(a.id)}
                className="accent-primary"
              />
              <IconBubble
                icon={a.kind === "caixa" ? Wallet : Landmark}
                tone={a.kind === "caixa" ? "positive" : "brand"}
                className="h-9 w-9 rounded-lg"
              />
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground tabular-nums">
                  {ok ? details || a.bank : "Sem dados bancários"}
                </span>
              </span>
              {a.is_contract_default ? (
                <Badge variant="alert" className="gap-1">
                  <Star className="h-3 w-3" />
                  Padrão
                </Badge>
              ) : !ok ? (
                <Badge variant="neutral">Indisponível</Badge>
              ) : (
                <span />
              )}
            </label>
          );
        })}
      </div>
      {chosen && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Como vai sair no contrato (quadro “Dados bancários”)
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted p-3">
            {contractBankRows(chosen).map((r) => (
              <div key={r.label} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </dt>
                <dd className="break-words text-sm font-semibold">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!chosen}>
          Gerar contrato
        </Button>
      </div>
    </SubmitForm>
  );
}
