import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Landmark, Pencil, Plus, Power, Star, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  ACCOUNT_KINDS,
  PIX_KEY_TYPES,
  accountLine,
  hasBankData,
  kindLabel,
  pixLine,
  type AccountKind,
} from "@/lib/bank-accounts";
import { formatCpfCnpj } from "@/lib/documents";
import { capitalizeWordsProps } from "@/lib/text-case";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SubmitForm } from "@/components/enter-submit";
import { IconBubble, Money } from "@/components/kpi";
import { selectClass } from "@/components/works/fields";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";

export type CompanyAccount = Database["public"]["Tables"]["financial_accounts"]["Row"];

/**
 * Card "Contas da empresa" do Financeiro: contas da JMG com dados bancários e saldo, cadastro,
 * edição, conta padrão do contrato e desativação (só com saldo zerado; o histórico fica).
 */
export function CompanyAccounts({
  accounts,
  balances,
  unassigned,
  onTransfer,
  onShowUnassigned,
  onChanged,
}: {
  accounts: CompanyAccount[];
  balances: Map<string, number>;
  /** Movimentações sem conta (lançadas antes da conta ser obrigatória). */
  unassigned: { count: number; amount: number };
  onTransfer: () => void;
  onShowUnassigned: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<CompanyAccount | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const active = accounts.filter((a) => a.active);
  const inactive = accounts.filter((a) => !a.active);
  const total = active.reduce((t, a) => t + (balances.get(a.id) ?? 0), 0);

  async function toggleActive(a: CompanyAccount) {
    const balance = balances.get(a.id) ?? 0;
    if (a.active && Math.abs(balance) >= 0.005) {
      toast.error("Transfira o saldo para outra conta antes de desativar.");
      return;
    }
    const r = await supabase
      .from("financial_accounts")
      .update({ active: !a.active })
      .eq("id", a.id);
    if (r.error) toast.error(r.error.message);
    else {
      toast.success(a.active ? "Conta desativada." : "Conta reativada.");
      onChanged();
    }
  }

  return (
    <section className={cn(panelClass, "space-y-4 p-4 sm:p-5")} aria-labelledby="contas-empresa">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="contas-empresa" className="text-base font-semibold">
            Contas da empresa
          </h2>
          <p className="text-xs text-muted-foreground">Onde o dinheiro da JMG está hoje</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onTransfer}>
            <ArrowLeftRight className="h-4 w-4" />
            Transferência
          </Button>
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Nova conta
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {active.map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            balance={balances.get(a.id) ?? 0}
            onEdit={() => setEditing(a)}
            onToggle={() => void toggleActive(a)}
          />
        ))}
        {!active.length && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="grid min-h-36 place-items-center rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Cadastre a primeira conta
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-3 text-sm text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {active.length} {active.length === 1 ? "conta ativa" : "contas ativas"}
          {unassigned.count > 0 && (
            <button
              type="button"
              onClick={onShowUnassigned}
              className="font-medium text-alert hover:underline"
            >
              {unassigned.count}{" "}
              {unassigned.count === 1 ? "movimentação sem conta" : "movimentações sem conta"} ·
              ajustar
            </button>
          )}
          {inactive.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="text-primary hover:underline"
            >
              {showInactive ? "Ocultar inativas" : `Ver inativas (${inactive.length})`}
            </button>
          )}
        </span>
        <span>
          Total em contas{" "}
          <Money value={total} tone="auto" className="font-semibold text-foreground" />
        </span>
      </div>

      {showInactive && inactive.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {inactive.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              balance={balances.get(a.id) ?? 0}
              onEdit={() => setEditing(a)}
              onToggle={() => void toggleActive(a)}
            />
          ))}
        </div>
      )}

      <AccountDialog
        account={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </section>
  );
}

function AccountCard({
  account: a,
  balance,
  onEdit,
  onToggle,
}: {
  account: CompanyAccount;
  balance: number;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const pix = pixLine(a);
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3.5",
        a.is_contract_default && "border-gold ring-1 ring-gold",
        !a.active && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <IconBubble
          icon={a.kind === "caixa" ? Wallet : Landmark}
          tone={a.kind === "caixa" ? "positive" : "brand"}
          className="h-9 w-9 rounded-lg"
        />
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-tight">{a.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {a.kind === "caixa" ? "Sem dados bancários" : a.bank || "Banco não informado"}
          </p>
        </div>
      </div>
      {a.kind !== "caixa" && (
        <div className="space-y-0.5 text-xs text-muted-foreground tabular-nums">
          {accountLine(a) && <p>{accountLine(a)}</p>}
          {pix && <p className="truncate">PIX {pix}</p>}
          {!hasBankData(a) && (
            <p className="text-alert">Complete banco e conta ou PIX para usar no contrato</p>
          )}
        </div>
      )}
      <p className="text-lg font-bold tabular-nums">
        <Money value={balance} tone="auto" />
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {a.is_contract_default ? (
          <Badge variant="alert" className="gap-1">
            <Star className="h-3 w-3" />
            Padrão no contrato
          </Badge>
        ) : (
          <Badge variant="neutral">{a.active ? kindLabel(a.kind) : "Inativa"}</Badge>
        )}
        <span className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onToggle}
            aria-label={a.active ? `Desativar ${a.name}` : `Reativar ${a.name}`}
          >
            <Power className="h-3.5 w-3.5" />
            {a.active ? "Desativar" : "Reativar"}
          </Button>
        </span>
      </div>
    </article>
  );
}

type Form = {
  name: string;
  kind: AccountKind;
  bank: string;
  agency: string;
  account_number: string;
  holder: string;
  holder_document: string;
  pix_key_type: string;
  pix_key: string;
  opening_balance: string;
  is_contract_default: boolean;
};

const emptyForm: Form = {
  name: "",
  kind: "corrente",
  bank: "",
  agency: "",
  account_number: "",
  holder: "JMG Reformas LTDA",
  holder_document: "62.780.542/0001-81",
  pix_key_type: "",
  pix_key: "",
  opening_balance: "",
  is_contract_default: false,
};

function toForm(a: CompanyAccount): Form {
  return {
    name: a.name,
    kind: (a.kind as AccountKind) || "corrente",
    bank: a.bank ?? "",
    agency: a.agency ?? "",
    account_number: a.account_number ?? "",
    holder: a.holder ?? "",
    holder_document: a.holder_document ?? "",
    pix_key_type: a.pix_key_type ?? "",
    pix_key: a.pix_key ?? "",
    opening_balance: String(a.opening_balance ?? ""),
    is_contract_default: a.is_contract_default,
  };
}

function AccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: CompanyAccount | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!account} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account === "new" ? "Nova conta" : "Editar conta"}</DialogTitle>
        </DialogHeader>
        {account && (
          <AccountForm
            key={account === "new" ? "new" : account.id}
            account={account === "new" ? null : account}
            onSaved={onSaved}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({
  account,
  onSaved,
  onCancel,
}: {
  account: CompanyAccount | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<Form>(account ? toForm(account) : emptyForm);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const cash = f.kind === "caixa";
  const opt = (v: string) => v.trim() || null;

  async function save() {
    setBusy(true);
    try {
      const row = {
        name: f.name.trim(),
        kind: f.kind,
        bank: cash ? null : opt(f.bank),
        agency: cash ? null : opt(f.agency),
        account_number: cash ? null : opt(f.account_number),
        holder: opt(f.holder),
        holder_document: f.holder_document.trim() ? formatCpfCnpj(f.holder_document) : null,
        pix_key_type: cash || !f.pix_key.trim() ? null : opt(f.pix_key_type),
        pix_key: cash ? null : opt(f.pix_key),
        opening_balance: Number(f.opening_balance.replace(",", ".")) || 0,
        is_contract_default: !cash && f.is_contract_default,
      };
      const r = account
        ? await supabase.from("financial_accounts").update(row).eq("id", account.id)
        : await supabase.from("financial_accounts").insert(row);
      if (r.error) throw Error(r.error.message);
      toast.success(account ? "Conta atualizada." : "Conta cadastrada.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const text = (
    k: "name" | "bank" | "agency" | "account_number" | "holder" | "pix_key",
    label: string,
    extra: Record<string, unknown> = {},
  ) => (
    <label className="block space-y-1 text-sm">
      <Label>{label}</Label>
      <Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...extra} />
    </label>
  );

  return (
    <SubmitForm onSubmit={() => void save()} pending={busy} className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Os dados bancários aparecem no contrato quando esta conta for escolhida e no recibo dos
        pagamentos que entrarem nela.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {text("name", "Nome da conta", { required: true, placeholder: "Ex.: Itaú PJ" })}
        <label className="block space-y-1 text-sm">
          <Label>Tipo</Label>
          <select
            className={selectClass}
            value={f.kind}
            onChange={(e) => set("kind", e.target.value as AccountKind)}
          >
            {ACCOUNT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!cash && (
        <>
          <p className="border-t pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dados bancários
          </p>
          <div className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr_1fr]">
            {text("bank", "Banco", { placeholder: "Ex.: Banco C6" })}
            {text("agency", "Agência", { inputMode: "numeric" })}
            {text("account_number", "Conta")}
          </div>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("holder", "Titular (favorecido)", capitalizeWordsProps)}
        <label className="block space-y-1 text-sm">
          <Label>CPF/CNPJ do titular</Label>
          <Input
            value={f.holder_document}
            inputMode="numeric"
            onChange={(e) => set("holder_document", formatCpfCnpj(e.target.value))}
          />
        </label>
      </div>
      {!cash && (
        <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
          <label className="block space-y-1 text-sm">
            <Label>Tipo da chave PIX</Label>
            <select
              className={selectClass}
              value={f.pix_key_type}
              onChange={(e) => set("pix_key_type", e.target.value)}
            >
              <option value="">Sem PIX</option>
              {PIX_KEY_TYPES.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          {text("pix_key", "Chave PIX", { disabled: !f.pix_key_type })}
        </div>
      )}
      <label className="block max-w-56 space-y-1 text-sm">
        <Label>Saldo inicial (R$)</Label>
        <Input
          type="number"
          step="any"
          value={f.opening_balance}
          onChange={(e) => set("opening_balance", e.target.value)}
        />
      </label>
      {!cash && (
        <label className="flex items-start gap-2 rounded-lg bg-gold-soft p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={f.is_contract_default}
            onChange={(e) => set("is_contract_default", e.target.checked)}
          />
          <span>
            <b>Usar como padrão no contrato</b>
            <span className="block text-xs text-muted-foreground">
              Vem marcada quando você for gerar um contrato. Só uma conta é a padrão.
            </span>
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar conta"}
        </Button>
      </div>
    </SubmitForm>
  );
}
