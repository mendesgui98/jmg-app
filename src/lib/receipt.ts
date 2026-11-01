// Recibo de pagamento (modelo JMG "Recibo-JMG-modelo"): um recibo por recebimento (baixa) de uma
// entrada da obra. Módulo puro e sem dependências, usado pela API (PDF) e pelo app: número do
// recibo, valor por extenso, parcela a que se refere e a situação financeira do contrato até a
// data do pagamento (parcelas pagas, este recibo e a receber). "Recebido em" mostra a conta da
// empresa em que o dinheiro entrou (a conta escolhida na baixa).

import { reaisPorExtenso } from "./extenso.ts";
import { COMPANY, proposalNumber, type ProposalTerm } from "./proposal.ts";
import { COMPANY_ACCOUNT, receiptBankRows, type BankAccount } from "./bank-accounts.ts";

export interface ReceiptSettlement {
  id: string;
  entry_id: string;
  amount: number;
  paid_date: string;
}

export interface ReceiptEntry {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  installment_index?: number | null;
  /** Entrada avulsa do caixa (fora das parcelas do contrato). */
  cash_only?: boolean;
}

export interface ReceiptInput {
  /** Recebimento que o recibo comprova. */
  settlement: ReceiptSettlement & { payment_method: string | null };
  /** Entradas (contas a receber) da obra, incluindo a deste recebimento. */
  entries: ReceiptEntry[];
  /** Todos os recebimentos dessas entradas. */
  settlements: ReceiptSettlement[];
  /** Obra da entrada; null para entrada geral da JMG (sem contrato). */
  work: { name: string; address: string | null } | null;
  client: { name: string; document: string | null } | null;
  budget: { number: number; issue_date: string; payment_terms: ProposalTerm[] } | null;
  issuer: string | null;
  /** Conta da empresa em que o dinheiro entrou (baixa antiga sem conta: a conta C6 da JMG). */
  account?: BankAccount | null;
  /** Dados opcionais informados ao gerar (conta de origem e ID da transação). */
  payer?: { name?: string; document?: string; bank?: string; account?: string } | undefined;
  transactionId?: string | undefined;
  today: string;
}

export type ReceiptRowState = "paga" | "este" | "parcial" | "receber";

export interface ReceiptData {
  number: string;
  contractCode: string | null;
  budgetCode: string | null;
  paidDate: string;
  method: string;
  amount: number;
  amountWords: string;
  ref: { label: string; when: string | null; pct: number };
  client: { name: string; document: string | null };
  work: { name: string; address: string | null } | null;
  /** Mostra a situação financeira do contrato (entrada de obra com parcelas). */
  hasContract: boolean;
  paidBy: { label: string; value: string }[];
  receivedIn: { label: string; value: string }[];
  transactionId: string | null;
  summary: { contract: number; paid: number; balance: number; paidPct: number };
  rows: {
    pct: number;
    label: string;
    when: string | null;
    amount: number;
    paidDate: string | null;
    state: ReceiptRowState;
  }[];
  issuer: string;
  issued: string;
  company: typeof COMPANY;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Nome da parcela sem o nome da obra que o Financeiro acrescenta ("1ª medição · Obra X"). */
export const installmentLabel = (description: string) =>
  description.split(" · ")[0]?.trim() || description.trim();

/** Ordem das parcelas: vencimento e, no mesmo dia, a ordem da parcela. */
export function orderEntries<E extends ReceiptEntry>(entries: E[]) {
  return [...entries].sort(
    (a, b) =>
      a.due_date.localeCompare(b.due_date) ||
      (a.installment_index ?? 0) - (b.installment_index ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

/** Número do recibo: REC-<ano do pagamento>-<nº do orçamento>-<parcela>[-<baixa>]. */
export function receiptNumber(
  input: Pick<ReceiptInput, "settlement" | "entries" | "settlements" | "budget">,
) {
  const ordered = orderEntries(input.entries);
  const index = ordered.findIndex((e) => e.id === input.settlement.entry_id) + 1;
  const same = input.settlements
    .filter((s) => s.entry_id === input.settlement.entry_id)
    .sort((a, b) => a.paid_date.localeCompare(b.paid_date) || a.id.localeCompare(b.id));
  const part = same.findIndex((s) => s.id === input.settlement.id) + 1;
  const base = `REC-${input.settlement.paid_date.slice(0, 4)}-${String(input.budget?.number ?? 0).padStart(4, "0")}-${String(Math.max(1, index)).padStart(2, "0")}`;
  return same.length > 1 ? `${base}-${part}` : base;
}

export function buildReceipt(input: ReceiptInput): ReceiptData {
  const s = input.settlement;
  const ordered = orderEntries(input.entries);
  // Valor do contrato: só as parcelas (contas a receber); entrada avulsa do caixa fica de fora.
  const contract = round2(
    ordered.filter((e) => !e.cash_only).reduce((n, e) => n + Number(e.amount), 0),
  );
  // Situação até este recebimento: baixas do mesmo dia ou anteriores (e esta).
  const upTo = input.settlements.filter(
    (x) =>
      x.id === s.id || x.paid_date < s.paid_date || (x.paid_date === s.paid_date && x.id <= s.id),
  );
  const paid = round2(upTo.reduce((n, x) => n + Number(x.amount), 0));
  const terms = input.budget?.payment_terms ?? [];
  const term = (label: string) => terms.find((t) => norm(t.label) === norm(label));
  const rows = ordered.map((e) => {
    const mine = upTo.filter((x) => x.entry_id === e.id);
    const got = mine.reduce((n, x) => n + Number(x.amount), 0);
    const last =
      mine
        .map((x) => x.paid_date)
        .sort()
        .at(-1) ?? null;
    const state: ReceiptRowState =
      e.id === s.entry_id
        ? "este"
        : got >= Number(e.amount) - 0.005
          ? "paga"
          : got > 0
            ? "parcial"
            : "receber";
    const label = installmentLabel(e.description);
    const t = term(label);
    return {
      pct: t ? t.pct : contract ? round1((Number(e.amount) / contract) * 100) : 0,
      label,
      when: t?.when ?? null,
      amount: round2(Number(e.amount)),
      paidDate: state === "este" ? s.paid_date : state === "receber" ? null : last,
      state,
    };
  });
  const mine = rows.find((r) => r.state === "este");
  const client = input.client ?? { name: "Cliente", document: null };
  const payer = input.payer ?? {};
  const paidBy = [
    { label: "Titular", value: payer.name?.trim() || client.name },
    { label: "CPF/CNPJ", value: payer.document?.trim() || client.document || "" },
    { label: "Banco", value: payer.bank?.trim() || "" },
    { label: "Agência / conta", value: payer.account?.trim() || "" },
  ].filter((r) => r.value);
  const c = COMPANY;
  return {
    number: receiptNumber(input),
    contractCode: input.budget
      ? proposalNumber(input.budget.number, input.budget.issue_date).replace(/^ORC-/, "CT-")
      : null,
    budgetCode: input.budget ? proposalNumber(input.budget.number, input.budget.issue_date) : null,
    paidDate: s.paid_date,
    method:
      (s.payment_method || "Não informada").toUpperCase() === "PIX"
        ? "PIX"
        : s.payment_method || "Não informada",
    amount: round2(Number(s.amount)),
    amountWords: reaisPorExtenso(Number(s.amount)),
    ref: {
      label: mine?.label ?? "Pagamento",
      when: mine?.when ?? null,
      pct: mine?.pct ?? 0,
    },
    client,
    work: input.work,
    hasContract: !!input.work && ordered.some((e) => !e.cash_only),
    paidBy,
    receivedIn: receiptBankRows(input.account ?? COMPANY_ACCOUNT),
    transactionId: input.transactionId?.trim() || null,
    summary: {
      contract,
      paid,
      balance: round2(Math.max(0, contract - paid)),
      paidPct: contract ? Math.min(100, round1((paid / contract) * 100)) : 0,
    },
    rows,
    issuer: input.issuer?.trim() || c.responsible,
    issued: input.today,
    company: c,
  };
}
