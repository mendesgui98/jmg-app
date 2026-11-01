import { businessDate, periodRange, inPeriod } from "@/lib/dashboard-math";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarClock,
  Check,
  Landmark,
  Plus,
  Receipt,
  ReceiptText,
  Scale,
  Undo2,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  accountBalances,
  accountStatus,
  cashMovements,
  cashSummary,
  type AccountStatus,
} from "@/lib/operations";
import { fmtBRL, fmtDate } from "@/lib/format";
import { useBRL } from "@/lib/hidden-values";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Field, selectClass, Attachment } from "./fields";
import { text, number } from "@/lib/form-values";
import { uploadDocument } from "@/lib/work-data";
import { financeOptions } from "@/lib/finance-data";
import { dashboardOptions } from "@/lib/dashboard-data";
import { paymentStages, stageDescription } from "@/lib/payment-stages";
import { Installments } from "./installments";
import { DraftForm } from "./draft-form";
import { useRecordFocus } from "@/hooks/use-record-focus";
import { Link } from "@tanstack/react-router";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { EmptyState } from "@/components/feedback";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { IconBubble, KpiCard, Money, Segmented } from "@/components/kpi";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { CompanyAccounts } from "@/components/finance/company-accounts";
type Entry = Database["public"]["Tables"]["financial_entries"]["Row"];
type Tab = "caixa" | "receber" | "pagar";

const PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão", "Boleto", "Transferência"];
const STATUS_LABEL: Record<AccountStatus, string> = {
  pendente: "Pendente",
  vencida: "Vencida",
  parcial: "Parcial",
  recebida: "Recebida",
  paga: "Paga",
  cancelada: "Cancelada",
};
const STATUS_VARIANT: Record<AccountStatus, BadgeProps["variant"]> = {
  pendente: "neutral",
  vencida: "negative",
  parcial: "alert",
  recebida: "positive",
  paga: "positive",
  cancelada: "neutral",
};

export function Finance({ workId }: { workId?: string }) {
  const brl = useBRL();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { work?: string; entry?: string; novo?: string };
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const { data, error } = useQuery(financeOptions);
  const [dialog, setDialog] = useState("");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [entryDirection, setEntryDirection] = useState("entrada");
  const filterWork = search.work || "";
  const setFilterWork = (work: string) =>
    navigate({ to: "/financeiro", search: (prev) => ({ ...prev, work }) });
  const selectedRecord = useRecordFocus(data);
  const focused = data?.entries.find((e) => e.id === selectedRecord);
  const [tab, setTab] = useState<Tab>(() =>
    !focused || focused.cash_only ? "caixa" : focused.direction === "entrada" ? "receber" : "pagar",
  );
  const [period, setPeriod] = useState("todos");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("abertas");
  const [type, setType] = useState("");
  // Conta da movimentação no caixa: "" todas, "sem" sem conta, ou o id da conta.
  const [accountFilter, setAccountFilter] = useState("");
  const today = businessDate();
  const range =
    period === "personalizado" ? { from: customFrom, to: customTo } : periodRange(period);

  const scopeWork = workId || filterWork;
  const allEntries = (data?.entries ?? []).filter((e) => !scopeWork || e.work_id === scopeWork);
  const settlements = data?.settlements ?? [];
  const opening = data?.openings.find((o) => o.work_id === scopeWork);
  const accountsOpening = (data?.accounts ?? []).reduce((t, a) => t + a.opening_balance, 0);
  // Saldo inicial: posição inicial da obra ou saldo inicial das contas da empresa.
  const initial = scopeWork ? (opening?.received ?? 0) - (opening?.paid ?? 0) : accountsOpening;
  const base = cashSummary(allEntries, settlements, today, initial);
  const openingPayable = scopeWork ? (opening?.pending_payable ?? 0) : 0;
  const summary = {
    ...base,
    payable: base.payable + openingPayable,
    forecast: base.forecast - openingPayable,
  };

  const movements = cashMovements(allEntries, settlements).filter(
    (m) =>
      inPeriod(m.date, range.from, range.to) &&
      (!category || m.category === category) &&
      (!type || m.direction === type) &&
      (!accountFilter ||
        (accountFilter === "sem" ? !m.account_id : m.account_id === accountFilter)),
  );
  const activeAccounts = (data?.accounts ?? []).filter((a) => a.active);
  const accountName = (id: string | null) =>
    data?.accounts.find((a) => a.id === id)?.name ?? "Conta";
  const unassignedSettlements = settlements.filter((s) => !s.account_id);
  const unassigned = {
    count: unassignedSettlements.length,
    amount: unassignedSettlements.reduce((t, s) => t + s.amount, 0),
  };
  const balances = new Map(
    data
      ? accountBalances(data.accounts, data.entries, data.settlements, data.transfers).map((a) => [
          a.id,
          a.balance,
        ])
      : [],
  );
  const accounts = (direction: "entrada" | "saida") =>
    allEntries
      .filter((e) => e.direction === direction && !e.cash_only)
      .map((e) => ({ e, st: accountStatus(e, settlements, today) }))
      .filter(
        ({ e, st }) =>
          inPeriod(e.due_date, range.from, range.to) &&
          (!category || e.category === category) &&
          (status === "abertas"
            ? st.pending > 0
            : status === "quitadas"
              ? st.status === "recebida" || st.status === "paga"
              : status === "todas"
                ? st.status !== "cancelada"
                : st.status === status),
      )
      .sort((a, b) => a.e.due_date.localeCompare(b.e.due_date));

  // Etapas da forma de pagamento (orçamento) para as contas a receber da obra.
  const { data: dash } = useQuery({ ...dashboardOptions, enabled: !!workId });
  // Etapas da obra: a saída lançada numa etapa vira o gasto real dela.
  const { data: workStages = [] } = useQuery({
    queryKey: ["work-stages-finance", workId],
    enabled: !!workId,
    queryFn: async () => {
      const r = await supabase
        .from("work_stages")
        .select("id,name")
        .eq("work_id", workId ?? "")
        .eq("removed", false)
        .order("sort");
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const stageSelect =
    workStages.length > 0 ? (
      <label className="block text-sm">
        Etapa da obra (opcional)
        <select name="work_stage" defaultValue="" className={selectClass}>
          <option value="">Sem etapa</option>
          {workStages.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">
          Entra no gasto real da etapa (aba Etapas).
        </span>
      </label>
    ) : null;
  async function setEntryStage(entryId: string, stageId: string) {
    const r = await supabase
      .from("financial_entries")
      .update({ stage_id: stageId || null })
      .eq("id", entryId);
    if (r.error) toast.error(r.error.message);
    else {
      refresh();
      toast.success(stageId ? "Etapa vinculada." : "Etapa removida.");
    }
  }
  const stageTag = (entryId: string, current: string | null, direction: string) =>
    workId && direction === "saida" && workStages.length > 0 ? (
      <select
        aria-label="Etapa da obra"
        className="h-7 rounded border bg-background px-1 text-xs"
        value={current ?? ""}
        onChange={(ev) => setEntryStage(entryId, ev.target.value)}
      >
        <option value="">Sem etapa</option>
        {workStages.map((st) => (
          <option key={st.id} value={st.id}>
            Etapa: {st.name}
          </option>
        ))}
      </select>
    ) : null;
  const workSummary = dash?.works.find((w) => w.work.id === workId);
  const stages = workSummary
    ? paymentStages(
        workSummary.budget.terms,
        workSummary.base.saleNet,
        allEntries
          .filter((e) => e.direction === "entrada" && !e.canceled)
          .map((e) => e.description),
      )
    : [];
  function applyStage(form: HTMLFormElement | null, label: string) {
    const stage = stages.find((s) => s.label === label);
    if (!form || !stage || !workSummary) return;
    const set = (name: string, value: string) => {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value;
    };
    set("description", stageDescription(stage.label, workSummary.work.name));
    if (stage.amount !== null) set("amount", String(stage.amount));
    set("category", "Contrato");
    if (workSummary.work.client_id) set("person", workSummary.work.client_id);
    form.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["work-result"] });
    qc.invalidateQueries({ queryKey: ["financial-dashboard"] });
  };
  function open(name: string, direction = "entrada") {
    setEntryDirection(direction);
    setRequestId(crypto.randomUUID());
    setDialog(name);
  }
  // "Lançar entrada/saída" do Painel chega com ?novo=entrada|saida e abre o lançamento no caixa.
  const novo = search.novo;
  useEffect(() => {
    if (novo !== "entrada" && novo !== "saida") return;
    open("cash", novo);
    void navigate({
      to: ".",
      search: ((old: Record<string, unknown>) => {
        const rest = { ...old };
        delete rest["novo"];
        return rest;
      }) as never,
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo]);
  async function save(d: FormData) {
    setBusy(true);
    try {
      let r: { error: { message: string } | null };
      let receiptFor: string | null = null;
      if (dialog === "cash") {
        r = await supabase.rpc("register_cash_movement", {
          _request_id: requestId,
          _direction: entryDirection,
          _movement_date: text(d, "date"),
          _description: text(d, "description"),
          _amount: number(d, "amount"),
          _category: text(d, "category"),
          _payment_method: text(d, "method"),
          _account_id: text(d, "account"),
          _work_id: (workId || text(d, "work") || null) as string,
          _person_id: (text(d, "person") || null) as string,
          _notes: text(d, "notes"),
        });
      } else if (dialog === "entry") {
        r = await supabase.rpc("create_financial_installments", {
          _request_id: requestId,
          _work_id: workId || text(d, "work") || "00000000-0000-0000-0000-000000000000",
          _source: "manual",
          _category: text(d, "category"),
          _description: text(d, "description"),
          _person_id: text(d, "person") || "00000000-0000-0000-0000-000000000000",
          _direction: entryDirection,
          _total: number(d, "amount"),
          _rows: JSON.parse(text(d, "installments") || "[]"),
          _incurred: d.get("incurred") === "on",
          _payment_method: text(d, "method"),
          _notes: text(d, "notes"),
          _cost_center: text(d, "center"),
          _file_path: "",
        });
      } else if (dialog === "settle" && entry) {
        const f = d.get("proof");
        const path = f instanceof File && f.size ? await uploadDocument(f, "finance") : null;
        const ins = await supabase
          .from("financial_settlements")
          .insert({
            entry_id: entry.id,
            account_id: text(d, "account"),
            amount: number(d, "amount"),
            paid_date: text(d, "date"),
            file_path: path,
            payment_method: text(d, "method"),
            notes: text(d, "notes"),
          })
          .select("id")
          .single();
        r = ins;
        if (!ins.error && entry.direction === "entrada") receiptFor = ins.data.id;
      } else if (dialog === "transfer") {
        r = await supabase.from("account_transfers").insert({
          from_account_id: text(d, "from"),
          to_account_id: text(d, "to"),
          amount: number(d, "amount"),
          transfer_date: text(d, "date"),
          description: text(d, "description"),
        });
      } else if (dialog === "allocate" && entry) {
        r = await supabase.from("expense_allocations").insert({
          entry_id: entry.id,
          work_id: text(d, "work"),
          amount: number(d, "amount"),
          rule: text(d, "rule"),
        });
      } else throw Error("Selecione um lançamento.");
      if (r.error) throw Error(r.error.message);
      const stageId = text(d, "work_stage");
      if (stageId && (dialog === "cash" || dialog === "entry")) {
        // À vista: a conta tem o id da requisição; parcelado: o grupo tem.
        const link = await supabase
          .from("financial_entries")
          .update({ stage_id: stageId })
          .eq(dialog === "cash" ? "id" : "group_id", requestId);
        if (link.error) throw Error(link.error.message);
      }
      // Entrada à vista: a baixa criada junto tem a conta com o id da requisição.
      if (dialog === "cash" && entryDirection === "entrada") {
        const st = await supabase
          .from("financial_settlements")
          .select("id")
          .eq("entry_id", requestId)
          .maybeSingle();
        receiptFor = st.data?.id ?? null;
      }
      const { data: u } = await supabase.auth.getUser();
      if (u.user)
        localStorage.removeItem(`jmg-draft:${u.user.id}:finance-${workId || "general"}-${dialog}`);
      setRequestId(crypto.randomUUID());
      setDialog("");
      setEntry(null);
      refresh();
      toast.success(
        dialog === "settle"
          ? entry?.direction === "entrada"
            ? "Recebimento registrado no caixa."
            : "Pagamento registrado no caixa."
          : "Registro financeiro salvo.",
        receiptFor
          ? {
              duration: 12000,
              action: {
                label: "Gerar recibo",
                onClick: () => void navigate({ to: "/recibos/$id", params: { id: receiptFor! } }),
              },
            }
          : undefined,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function rpc(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    const r = await p;
    if (r.error) toast.error(r.error.message);
    else {
      toast.success(ok);
      refresh();
    }
  }
  const undo = (settlementId: string, manual: boolean) =>
    confirm(
      manual
        ? "Desfazer esta movimentação? Ela sai do caixa."
        : "Desfazer esta baixa? A movimentação sai do caixa e a conta volta a ficar em aberto.",
    ) &&
    rpc(
      supabase.rpc("undo_settlement", { _settlement_id: settlementId }),
      manual ? "Movimentação desfeita." : "Baixa desfeita.",
    );
  const cancel = (e: Entry) =>
    confirm(
      e.installment_count > 1
        ? `Cancelar a conta "${e.description}"? As ${e.installment_count} parcelas deste lançamento serão canceladas.`
        : `Cancelar a conta "${e.description}"?`,
    ) && rpc(supabase.rpc("cancel_financial_entry", { _entry_id: e.id }), "Conta cancelada.");
  async function incur(e: Entry) {
    const r = await supabase.from("financial_entries").update({ incurred: true }).eq("id", e.id);
    if (r.error) toast.error(r.error.message);
    else refresh();
  }

  // Conta é obrigatória em toda movimentação: em qual conta entrou ou de qual saiu.
  const accountPicker = (name: string, label: string) => (
    <fieldset className="space-y-1.5 text-sm">
      <legend className="mb-1.5">
        {label} <span className="text-negative">*</span>
      </legend>
      {activeAccounts.length ? (
        <div className="grid grid-cols-2 gap-2">
          {activeAccounts.map((a, i) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input type="radio" name={name} value={a.id} required={i === 0} className="sr-only" />
              <IconBubble
                icon={a.kind === "caixa" ? Wallet : Landmark}
                tone={a.kind === "caixa" ? "positive" : "brand"}
                className="h-7 w-7 shrink-0 rounded-md"
              />
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {brl(balances.get(a.id) ?? 0)}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-alert-soft p-2 text-xs text-alert">
          Cadastre uma conta em Financeiro → Contas da empresa antes de lançar.
        </p>
      )}
    </fieldset>
  );
  const transferSelect = (name: string, label: string) => (
    <label className="block text-sm">
      {label} <span className="text-negative">*</span>
      <select name={name} required className={selectClass}>
        <option value="">Selecionar conta</option>
        {activeAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {fmtBRL(balances.get(a.id) ?? 0)}
          </option>
        ))}
      </select>
    </label>
  );
  async function setSettlementAccount(settlementId: string, accountId: string) {
    if (!accountId) return;
    await rpc(
      supabase.rpc("set_settlement_account", {
        _settlement_id: settlementId,
        _account_id: accountId,
      }),
      "Conta da movimentação atualizada.",
    );
  }
  // Conta da movimentação já lançada: editável para acertar o saldo das contas.
  const accountTag = (settlementId: string, current: string | null) => (
    <select
      aria-label="Conta da movimentação"
      className={cn(
        "h-7 max-w-44 rounded border bg-background px-1 text-xs",
        !current && "border-alert bg-alert-soft font-medium text-alert",
      )}
      value={current ?? ""}
      onChange={(ev) => void setSettlementAccount(settlementId, ev.target.value)}
    >
      {!current && <option value="">Sem conta · escolher</option>}
      {current && !activeAccounts.some((a) => a.id === current) && (
        <option value={current}>Conta: {accountName(current)} (inativa)</option>
      )}
      {activeAccounts.map((a) => (
        <option key={a.id} value={a.id}>
          Conta: {a.name}
        </option>
      ))}
    </select>
  );
  const methodSelect = (defaultValue = "") => (
    <label className="block text-sm">
      Forma de pagamento
      <select name="method" defaultValue={defaultValue} className={selectClass}>
        <option value="">Não informar</option>
        {PAYMENT_METHODS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
    </label>
  );
  const categorySelect = (
    <label className="block text-sm">
      Categoria
      <select
        name="category"
        defaultValue={entryDirection === "entrada" ? "Contrato" : undefined}
        className={selectClass}
      >
        {data?.categories.map((c) => (
          <option key={c.name}>{c.name}</option>
        ))}
        <option>Contrato</option>
        <option>Comissão da arquiteta</option>
        <option>Tributos</option>
      </select>
    </label>
  );
  const personSelect = (label: string) => (
    <label className="block text-sm">
      {label}
      <select name="person" className={selectClass}>
        <option value="">Selecionar</option>
        {data?.people
          .filter((p) => !p.deleted_at)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    </label>
  );
  const workSelect = (required: boolean, label = "Obra") => (
    <label className="block text-sm">
      {label}
      <select name="work" required={required} className={selectClass}>
        <option value="">{required ? "Selecionar obra" : "Despesas gerais da JMG"}</option>
        {data?.works
          .filter((w) => !w.deleted_at)
          .map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
      </select>
    </label>
  );
  const categories = Array.from(
    new Set([
      ...(data?.categories.map((c) => c.name) ?? []),
      "Contrato",
      ...allEntries.map((e) => e.category),
    ]),
  );

  if (error) return <p className="text-destructive">{error.message}</p>;
  const receivableRows = tab === "receber" ? accounts("entrada") : [];
  const payableRows = tab === "pagar" ? accounts("saida") : [];
  const rows = tab === "receber" ? receivableRows : payableRows;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={workId ? "text-lg font-semibold" : "sr-only"}>
          Financeiro{workId ? " da obra" : ""}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        <KpiCard
          hero
          className="col-span-2 sm:col-span-3 xl:col-span-2"
          label="Saldo atual"
          icon={Wallet}
          value={<Money value={summary.current} />}
          hint="Só o que já entrou ou saiu"
        />
        <KpiCard
          filled
          tone="positive"
          label="A receber"
          icon={CalendarClock}
          value={<Money value={summary.receivable} />}
          hint={<OverdueHint value={summary.receivableOverdue} />}
        />
        <KpiCard
          filled
          tone="negative"
          label="A pagar"
          icon={Receipt}
          value={<Money value={summary.payable} />}
          hint={<OverdueHint value={summary.payableOverdue} />}
        />
        <KpiCard
          className="col-span-2 sm:col-span-1"
          label="Saldo previsto"
          icon={Scale}
          value={<Money value={summary.forecast} tone="auto" />}
          hint="Atual + a receber − a pagar"
        />
      </div>
      {!workId && data && (
        <CompanyAccounts
          accounts={data.accounts}
          balances={balances}
          unassigned={unassigned}
          onTransfer={() => open("transfer")}
          onShowUnassigned={() => {
            setTab("caixa");
            setPeriod("todos");
            setType("");
            setCategory("");
            setAccountFilter("sem");
          }}
          onChanged={refresh}
        />
      )}
      {opening && (
        <p className="text-xs text-muted-foreground">
          Posição inicial em {fmtDate(opening.reference_date)}: recebido {brl(opening.received)},
          despesas {brl(opening.paid)}, pendências a pagar {brl(opening.pending_payable)} (já
          incluídas nos cards).
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented>
          {(
            [
              ["caixa", "Caixa"],
              ["receber", "Contas a receber"],
              ["pagar", "Contas a pagar"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={segmentClass(tab === key)}
            >
              {label}
            </button>
          ))}
        </Segmented>
        <div className="flex flex-wrap gap-2">
          {tab === "caixa" && (
            <>
              <Button onClick={() => open("cash", "entrada")}>
                <ArrowUp className="h-4 w-4" />
                Nova entrada
              </Button>
              <Button variant="outline" onClick={() => open("cash", "saida")}>
                <ArrowDown className="h-4 w-4 text-negative" />
                Nova saída
              </Button>
            </>
          )}
          {tab === "receber" && (
            <Button onClick={() => open("entry", "entrada")}>
              <Plus className="h-4 w-4" />
              Nova conta a receber
            </Button>
          )}
          {tab === "pagar" && (
            <Button onClick={() => open("entry", "saida")}>
              <Plus className="h-4 w-4" />
              Nova conta a pagar
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          panelClass,
          "grid grid-cols-2 gap-3 p-4 shadow-none md:flex md:flex-wrap md:items-end [&>label]:text-xs [&>label]:font-medium [&>label]:text-muted-foreground md:[&>label]:w-48",
        )}
      >
        {!workId && (
          <label className="text-xs">
            Obra
            <select
              className={selectClass}
              value={filterWork}
              onChange={(e) => setFilterWork(e.target.value)}
            >
              <option value="">Todas</option>
              {data?.works
                .filter((w) => !w.deleted_at)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="text-xs">
          Período{tab === "caixa" ? " (data)" : " (vencimento)"}
          <select
            className={selectClass}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="hoje">Hoje</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mês</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </label>
        {period === "personalizado" && (
          <>
            <label className="text-xs">
              De
              <input
                type="date"
                className={selectClass}
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Até
              <input
                type="date"
                className={selectClass}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="text-xs">
          Categoria
          <select
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {tab === "caixa" && (
          <label className="text-xs">
            Conta
            <select
              className={selectClass}
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="">Todas as contas</option>
              {data?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.active ? "" : " (inativa)"}
                </option>
              ))}
              <option value="sem">Sem conta</option>
            </select>
          </label>
        )}
        {tab === "caixa" ? (
          <label className="text-xs">
            Tipo
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Entradas e saídas</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
            </select>
          </label>
        ) : (
          <label className="text-xs">
            Status
            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="abertas">Em aberto</option>
              <option value="pendente">Pendentes</option>
              <option value="vencida">Vencidas</option>
              <option value="parcial">Parciais</option>
              <option value="quitadas">{tab === "receber" ? "Recebidas" : "Pagas"}</option>
              <option value="cancelada">Canceladas</option>
              <option value="todas">Todas (sem canceladas)</option>
            </select>
          </label>
        )}
      </div>

      {tab === "caixa" ? (
        <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
          {movements.map((m) => (
            <article key={m.id} className="flex gap-3 px-4 py-4 sm:px-5">
              <IconBubble
                icon={m.direction === "entrada" ? ArrowUp : ArrowDown}
                tone={m.direction === "entrada" ? "positive" : "negative"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 font-medium leading-snug">{m.description}</h3>
                  <Money
                    value={m.amount}
                    signed={m.direction === "entrada" ? "+" : "−"}
                    tone={m.direction === "entrada" ? "positive" : "negative"}
                    className="shrink-0 font-semibold"
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmtDate(m.date)} · {m.direction === "entrada" ? "Entrada" : "Saída"} ·{" "}
                  {m.category} · {m.payment_method || "Forma não informada"}
                  {!workId &&
                    ` · ${data?.works.find((w) => w.id === m.work_id)?.name || "Geral JMG"}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.origin === "manual" ? (
                    "Lançamento manual"
                  ) : (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setTab(m.direction === "entrada" ? "receber" : "pagar");
                        setStatus("todas");
                        setTimeout(
                          () =>
                            document
                              .getElementById(`record-${m.entry_id}`)
                              ?.scrollIntoView({ block: "center" }),
                          50,
                        );
                      }}
                    >
                      Baixa de conta · ver conta
                    </button>
                  )}
                  {m.notes ? ` · ${m.notes}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {accountTag(m.id, m.account_id)}
                  {stageTag(
                    m.entry_id,
                    data?.entries.find((x) => x.id === m.entry_id)?.stage_id ?? null,
                    m.direction,
                  )}
                </div>
                <div className="-ml-3 mt-1 flex flex-wrap items-center gap-1">
                  <Attachment path={m.file_path} />
                  {m.direction === "entrada" && <ReceiptButton id={m.id} />}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => undo(m.id, m.origin === "manual")}
                  >
                    <Undo2 className="h-4 w-4" />
                    Desfazer
                  </Button>
                </div>
              </div>
            </article>
          ))}
          {!movements.length && (
            <EmptyState
              compact
              icon={Wallet}
              title="Nenhuma movimentação neste período"
              className="py-10"
            />
          )}
        </div>
      ) : (
        <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
          {rows.map(({ e, st }) => {
            const own = settlements.filter((s) => s.entry_id === e.id);
            return (
              <article
                key={e.id}
                id={`record-${e.id}`}
                className={cn(
                  "scroll-mt-6 px-4 py-4 sm:px-5",
                  selectedRecord === e.id &&
                    "bg-accent/40 shadow-[inset_4px_0_0_var(--color-primary)]",
                  st.status === "vencida"
                    ? "shadow-[inset_4px_0_0_var(--color-negative)]"
                    : st.dueSoon && "shadow-[inset_4px_0_0_var(--color-alert)]",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <IconBubble
                    icon={e.direction === "entrada" ? ArrowUp : ArrowDown}
                    tone={e.direction === "entrada" ? "positive" : "negative"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold leading-snug">{e.description}</h3>
                      <Badge
                        variant={STATUS_VARIANT[st.status]}
                        className={st.status === "cancelada" ? "line-through" : ""}
                      >
                        {STATUS_LABEL[st.status]}
                      </Badge>
                      {st.dueSoon && <Badge variant="alert">Vence em até 3 dias</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Vence {fmtDate(e.due_date)} · {e.category}
                      {e.installment_count > 1 &&
                        ` · parcela ${e.installment_index}/${e.installment_count}`}
                      {!workId &&
                        ` · ${data?.works.find((w) => w.id === e.work_id)?.name || "Geral JMG"}`}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      {stageTag(e.id, e.stage_id, e.direction)}
                      {e.person_id && (
                        <Link
                          to="/cadastros/$id"
                          params={{ id: e.person_id }}
                          className="text-primary"
                        >
                          {data?.people.find((p) => p.id === e.person_id)?.name || "Cadastro"}
                        </Link>
                      )}
                      {e.work_id && !workId && (
                        <Link to="/obras/$id" params={{ id: e.work_id }} className="text-primary">
                          Ver obra
                        </Link>
                      )}
                      {(e.purchase_order_id || e.payable_order_id) && e.work_id && (
                        <Link
                          to="/obras/$id"
                          params={{ id: e.work_id }}
                          search={{
                            tab: "compras",
                            record: e.purchase_order_id || e.payable_order_id || "",
                          }}
                          className="text-primary"
                        >
                          Pedido de origem
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">
                      <Money
                        value={e.amount}
                        tone={e.direction === "entrada" ? "positive" : "negative"}
                      />
                    </p>
                    {st.paid > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {e.direction === "entrada" ? "Recebido" : "Pago"} {brl(st.paid)}
                      </p>
                    )}
                    {st.pending > 0 && st.paid > 0 && (
                      <p className="text-xs text-muted-foreground">Em aberto {brl(st.pending)}</p>
                    )}
                  </div>
                  <div className="flex w-full flex-wrap gap-2 pl-12 sm:w-auto sm:pl-0">
                    {st.pending > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setEntry(e);
                          open("settle", e.direction);
                        }}
                      >
                        <Check className="h-4 w-4" />
                        {e.direction === "entrada" ? "Recebi" : "Paguei"}
                      </Button>
                    )}
                    {!e.incurred &&
                      e.direction === "saida" &&
                      !e.canceled &&
                      !e.purchase_order_id &&
                      !e.payable_order_id && (
                        <Button size="sm" variant="outline" onClick={() => incur(e)}>
                          Custo incorrido
                        </Button>
                      )}
                    {!e.work_id && e.direction === "saida" && !e.canceled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEntry(e);
                          open("allocate", "saida");
                        }}
                      >
                        Ratear
                      </Button>
                    )}
                    {!e.canceled &&
                      own.length === 0 &&
                      !e.purchase_order_id &&
                      !e.payable_order_id && (
                        <Button size="sm" variant="danger" onClick={() => cancel(e)}>
                          <Ban className="h-4 w-4" />
                          Cancelar
                        </Button>
                      )}
                  </div>
                </div>
                {own.map((s) => (
                  <div
                    key={s.id}
                    className="mt-2 ml-12 flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    {e.direction === "entrada" ? "Recebido" : "Pago"} em {fmtDate(s.paid_date)} ·{" "}
                    {brl(s.amount)} · {s.payment_method || "Forma não informada"}
                    {accountTag(s.id, s.account_id)}
                    <Attachment path={s.file_path} />
                    {e.direction === "entrada" && <ReceiptButton id={s.id} small />}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => undo(s.id, false)}
                    >
                      Desfazer baixa
                    </button>
                  </div>
                ))}
                {data?.allocations
                  .filter((a) => a.entry_id === e.id)
                  .map((a) => (
                    <p key={a.id} className="mt-1 ml-12 text-xs text-muted-foreground">
                      Rateio: {data.works.find((w) => w.id === a.work_id)?.name} · {brl(a.amount)} ·{" "}
                      {a.rule}
                    </p>
                  ))}
              </article>
            );
          })}
          {!rows.length && (
            <EmptyState
              compact
              icon={Wallet}
              title={tab === "receber" ? "Nenhuma conta a receber" : "Nenhuma conta a pagar"}
              className="py-10"
            />
          )}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog("")}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {
                {
                  cash:
                    entryDirection === "entrada" ? "Nova entrada no caixa" : "Nova saída do caixa",
                  entry:
                    entryDirection === "entrada" ? "Nova conta a receber" : "Nova conta a pagar",
                  settle: entry?.direction === "entrada" ? "Recebi" : "Paguei",
                  transfer: "Transferência entre contas",
                  allocate: "Ratear despesa geral",
                }[dialog]
              }
            </DialogTitle>
          </DialogHeader>
          <DraftForm
            key={`${dialog}-${entryDirection}-${entry?.id ?? ""}`}
            scope={`finance-${workId || "general"}-${dialog}${dialog === "cash" || dialog === "entry" ? `-${entryDirection}` : ""}`}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save(new FormData(e.currentTarget));
            }}
          >
            {dialog === "cash" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Lançamento à vista: entra direto no caixa, sem passar por contas a{" "}
                  {entryDirection === "entrada" ? "receber" : "pagar"}.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field name="date" label="Data" type="date" value={today} required />
                  <Field name="amount" label="Valor (R$)" type="number" required />
                </div>
                <Field name="description" label="Descrição" required />
                {!workId &&
                  workSelect(
                    entryDirection === "entrada",
                    entryDirection === "entrada" ? "Obra" : "Obra (opcional)",
                  )}
                <div className="grid grid-cols-2 gap-3">
                  {categorySelect}
                  {methodSelect("Pix")}
                </div>
                {accountPicker(
                  "account",
                  entryDirection === "entrada"
                    ? "Em qual conta o dinheiro entrou?"
                    : "De qual conta o dinheiro saiu?",
                )}
                {personSelect(
                  entryDirection === "entrada"
                    ? "Cliente (opcional)"
                    : "Fornecedor / prestador (opcional)",
                )}
                {entryDirection === "saida" && stageSelect}
                <Field name="notes" label="Observação" />
              </>
            )}
            {dialog === "entry" && (
              <>
                <Field name="description" label="Descrição" required />
                {!workId &&
                  workSelect(
                    entryDirection === "entrada",
                    entryDirection === "entrada" ? "Obra" : "Obra (opcional)",
                  )}
                {categorySelect}
                {entryDirection === "entrada" && stages.length > 0 && (
                  <label className="block text-sm">
                    Etapa do pagamento
                    <select
                      name="stage"
                      className={selectClass}
                      defaultValue=""
                      onChange={(e) => applyStage(e.currentTarget.form, e.target.value)}
                    >
                      <option value="">Conta avulsa (sem etapa)</option>
                      {stages.map((st) => (
                        <option key={st.label} value={st.label}>
                          {st.label}
                          {st.amount !== null ? ` — ${fmtBRL(st.amount)}` : ""}
                          {st.launched ? " (já lançada)" : ""}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Preenche descrição, categoria, cliente
                      {stages.some((st) => st.amount !== null) ? " e valor" : ""} pela forma de
                      pagamento.
                    </span>
                  </label>
                )}
                {personSelect(entryDirection === "entrada" ? "Cliente" : "Fornecedor / prestador")}
                <Field name="amount" label="Valor (R$)" type="number" required />
                <Installments />
                {methodSelect()}
                {entryDirection === "saida" && stageSelect}
                <Field name="center" label="Centro de custo" />
                <Field name="notes" label="Observação" />
                {entryDirection === "saida" && (
                  <label className="flex gap-2 text-sm">
                    <input name="incurred" type="checkbox" />
                    Despesa já incorrida (serviço prestado)
                  </label>
                )}
              </>
            )}
            {dialog === "settle" && entry && (
              <>
                <p className="text-sm">
                  {entry.description} · em aberto{" "}
                  {fmtBRL(accountStatus(entry, settlements, today).pending)}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field name="date" label="Data do pagamento" type="date" value={today} required />
                  <Field
                    name="amount"
                    label="Valor efetivo (R$)"
                    type="number"
                    value={accountStatus(entry, settlements, today).pending}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Valor menor deixa a conta parcial, com o restante em aberto.
                </p>
                {methodSelect(entry.payment_method || "Pix")}
                {accountPicker(
                  "account",
                  entry.direction === "entrada"
                    ? "Em qual conta o dinheiro entrou?"
                    : "De qual conta o dinheiro saiu?",
                )}
                <Field name="notes" label="Observação" />
                <Field name="proof" label="Comprovante" type="file" />
              </>
            )}
            {dialog === "transfer" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Não conta como receita nem despesa, só move o saldo entre as contas.
                </p>
                {transferSelect("from", "Sai de")}
                {transferSelect("to", "Entra em")}
                <Field name="amount" label="Valor (R$)" type="number" required />
                <Field name="date" label="Data" type="date" value={today} required />
                <Field name="description" label="Descrição" />
              </>
            )}
            {dialog === "allocate" && (
              <>
                <p className="text-sm">
                  {entry?.description} · {fmtBRL(entry?.amount)}
                </p>
                {workSelect(true)}
                <Field name="amount" label="Parcela atribuída à obra (R$)" type="number" required />
                <Field name="rule" label="Regra explícita do rateio" required />
              </>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Salvando…"
                : dialog === "settle"
                  ? entry?.direction === "entrada"
                    ? "Confirmar recebimento"
                    : "Confirmar pagamento"
                  : "Salvar"}
            </Button>
          </DraftForm>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OverdueHint({ value }: { value: number }) {
  const brl = useBRL();
  return value > 0 ? (
    <span className="inline-flex items-center gap-1 font-medium text-alert">
      <AlertTriangle className="h-3.5 w-3.5" />
      {brl(value)} vencido
    </span>
  ) : (
    "Nada vencido"
  );
}

/** Recibo de pagamento (modelo JMG) de um recebimento de entrada. */
export function ReceiptButton({ id, small }: { id: string; small?: boolean }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn("border-primary/40 text-primary", small && "h-7 px-2 text-xs")}
      asChild
    >
      <Link to="/recibos/$id" params={{ id }}>
        <ReceiptText className="h-4 w-4" />
        Gerar recibo
      </Link>
    </Button>
  );
}
