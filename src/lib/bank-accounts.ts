// Contas da empresa (financial_accounts): rótulos e quadros de dados bancários usados no
// Financeiro, no contrato (quadro {{DADOS_BANCARIOS}}) e no recibo. Módulo puro e sem
// dependências, compartilhado com a API.

import { COMPANY } from "./proposal.ts";

export type AccountKind = "corrente" | "poupanca" | "caixa";
export type PixKeyType = "cnpj" | "cpf" | "email" | "telefone" | "aleatoria";

export interface BankAccount {
  name: string;
  kind?: string | null;
  bank?: string | null;
  agency?: string | null;
  account_number?: string | null;
  holder?: string | null;
  holder_document?: string | null;
  pix_key_type?: string | null;
  pix_key?: string | null;
}

export interface BankRow {
  label: string;
  value: string;
}

export const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: "corrente", label: "Conta corrente" },
  { value: "poupanca", label: "Poupança" },
  { value: "caixa", label: "Caixa (dinheiro)" },
];

export const PIX_KEY_TYPES: { value: PixKeyType; label: string }[] = [
  { value: "cnpj", label: "CNPJ" },
  { value: "cpf", label: "CPF" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "aleatoria", label: "Aleatória" },
];

const clean = (v: string | null | undefined) => (v ?? "").trim();

export const kindLabel = (kind: string | null | undefined) =>
  ACCOUNT_KINDS.find((k) => k.value === kind)?.label ?? "Conta corrente";

export const pixTypeLabel = (type: string | null | undefined) =>
  PIX_KEY_TYPES.find((k) => k.value === type)?.label ?? "";

/** Conta com dados para receber transferência/PIX (pode ir no contrato). */
export function hasBankData(a: BankAccount) {
  if (a.kind === "caixa") return false;
  return !!clean(a.pix_key) || (!!clean(a.bank) && !!clean(a.account_number));
}

/** "Ag. 0001 · CC 39813290-9" (vazio quando não há agência nem conta). */
export function accountLine(a: BankAccount) {
  if (a.kind === "caixa") return "Sem dados bancários";
  const prefix = a.kind === "poupanca" ? "Poup." : "CC";
  return [
    clean(a.agency) && `Ag. ${clean(a.agency)}`,
    clean(a.account_number) && `${prefix} ${clean(a.account_number)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "62.780.542/0001-81 (CNPJ)" ou só a chave quando o tipo não foi informado. */
export function pixLine(a: BankAccount) {
  const key = clean(a.pix_key);
  if (!key) return "";
  const type = pixTypeLabel(a.pix_key_type);
  return type ? `${key} (${type})` : key;
}

/** Favorecido e documento: titular da conta ou, sem titular, a própria JMG. */
function holderOf(a: BankAccount) {
  return {
    name: clean(a.holder) || COMPANY.name,
    document: clean(a.holder_document) || (clean(a.holder) ? "" : COMPANY.cnpj),
  };
}

const docLabel = (doc: string) => (doc.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ");

/** Quadro "Dados bancários" do contrato. */
export function contractBankRows(a: BankAccount): BankRow[] {
  const h = holderOf(a);
  const conta = a.kind === "poupanca" ? "Poupança" : "Conta corrente";
  return [
    { label: "Favorecido", value: h.name },
    { label: h.document ? docLabel(h.document) : "CNPJ", value: h.document },
    { label: "Chave PIX", value: pixLine(a) },
    { label: "Banco", value: clean(a.bank) },
    { label: "Agência", value: clean(a.agency) },
    { label: conta, value: clean(a.account_number) },
  ].filter((r) => r.value);
}

/** Bloco "Recebido em" do recibo: a conta em que o dinheiro entrou. */
export function receiptBankRows(a: BankAccount): BankRow[] {
  const h = holderOf(a);
  if (a.kind === "caixa")
    return [
      { label: "Favorecido", value: h.name },
      { label: h.document ? docLabel(h.document) : "CNPJ", value: h.document },
      { label: "Conta", value: `${clean(a.name)} (dinheiro)` },
    ].filter((r) => r.value);
  const agencyAccount = [clean(a.agency), clean(a.account_number)].filter(Boolean).join(" · ");
  return [
    { label: "Favorecido", value: h.name },
    { label: h.document ? docLabel(h.document) : "CNPJ", value: h.document },
    { label: "Banco", value: clean(a.bank) || clean(a.name) },
    { label: "Agência / conta", value: agencyAccount },
    { label: "Chave PIX", value: agencyAccount ? "" : pixLine(a) },
  ].filter((r) => r.value);
}

/** Conta da JMG que estava fixa no código (contratos/recibos antigos sem conta escolhida). */
export const COMPANY_ACCOUNT: BankAccount = {
  name: COMPANY.bank,
  kind: "corrente",
  bank: COMPANY.bank,
  agency: COMPANY.agency,
  account_number: COMPANY.account,
  holder: COMPANY.name,
  holder_document: COMPANY.cnpj,
  pix_key_type: COMPANY.pix === COMPANY.cnpj ? "cnpj" : null,
  pix_key: COMPANY.pix,
};

/** Conta que vem marcada ao gerar o contrato: a padrão ou, sem padrão, a primeira com dados. */
export function defaultContractAccount<
  T extends BankAccount & { id: string; active?: boolean; is_contract_default?: boolean },
>(accounts: T[]) {
  const usable = accounts.filter((a) => a.active !== false && hasBankData(a));
  return usable.find((a) => a.is_contract_default) ?? usable[0] ?? null;
}
