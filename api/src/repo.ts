import type { Claims } from "./auth.ts";
import type { Db } from "./db.ts";
import { emptyParams } from "../../src/lib/pricing.ts";
import type { ContractClause } from "../../src/lib/contract-clauses.ts";
import type { ProposalInput, ProposalTerm } from "../../src/lib/proposal.ts";
import type { ReceiptInput } from "../../src/lib/receipt.ts";
import type { BankAccount } from "../../src/lib/bank-accounts.ts";

// Consultas SQL da API. Mantidas aqui para os handlers ficarem testáveis com um repositório falso.

export const ROLES = ["admin", "financeiro", "equipe"] as const;
export type Role = (typeof ROLES)[number];

export type UserSummary = {
  id: string;
  email: string;
  full_name: string | null;
  roles: Role[];
  mfa: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  invited_at: string | null;
  confirmed: boolean;
};

export type Repo = {
  ping(): Promise<boolean>;
  rolesOf(userId: string): Promise<Role[]>;
  hasVerifiedFactor(userId: string): Promise<boolean>;
  listUsers(): Promise<UserSummary[]>;
  setRoles(userId: string, roles: Role[]): Promise<void>;
  countAdmins(): Promise<number>;
  exportTables(): Promise<Record<string, unknown[]>>;
  /** Linhas do orçamento para o PDF, lidas como o usuário (RLS de custos vale aqui). */
  proposalInput(claims: Claims, budgetId: string): Promise<Omit<ProposalInput, "today"> | null>;
  /** Cláusulas ativas do modelo de contrato, na ordem (Configurações → Contrato). */
  contractClauses(claims: Claims): Promise<ContractClause[]>;
  /** Conta ativa da empresa escolhida para o contrato, lida como o usuário (RLS). */
  bankAccount(claims: Claims, accountId: string): Promise<BankAccount | null>;
  /** Recebimento de uma entrada da obra e o que o recibo precisa, lido como o usuário (RLS). */
  receiptInput(
    claims: Claims,
    settlementId: string,
  ): Promise<Omit<ReceiptInput, "today" | "payer" | "transactionId"> | null>;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export function createRepo(db: Db): Repo {
  const { sql } = db;
  return {
    ping: () => db.ping(),
    async rolesOf(userId) {
      const rows =
        await sql`select role::text as role from public.user_roles where user_id = ${userId}`;
      return rows.map((r) => r["role"] as Role);
    },
    async hasVerifiedFactor(userId) {
      const [row] = await sql`
        select exists(
          select 1 from auth.mfa_factors where user_id = ${userId} and status = 'verified'
        ) as has`;
      return row?.["has"] === true;
    },
    async listUsers() {
      const rows = await sql`
        select u.id, u.email, p.full_name, u.created_at, u.last_sign_in_at, u.invited_at,
               (u.email_confirmed_at is not null) as confirmed,
               coalesce(array_agg(r.role::text order by r.role) filter (where r.role is not null), '{}') as roles,
               exists(select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as mfa
        from auth.users u
        left join public.profiles p on p.id = u.id
        left join public.user_roles r on r.user_id = u.id
        group by u.id, p.full_name
        order by u.created_at`;
      return rows as unknown as UserSummary[];
    },
    async setRoles(userId, roles) {
      await sql.begin(async (tx) => {
        await tx`delete from public.user_roles where user_id = ${userId}`;
        for (const role of roles) {
          await tx`insert into public.user_roles (user_id, role) values (${userId}, ${role})`;
        }
      });
    },
    async countAdmins() {
      const [row] =
        await sql`select count(*)::int as n from public.user_roles where role = 'admin'`;
      return Number(row?.["n"] ?? 0);
    },
    async exportTables() {
      const tables = await sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`;
      const out: Record<string, unknown[]> = {};
      for (const t of tables) {
        const name = String(t["table_name"]);
        out[name] = [...(await sql`select * from ${sql("public." + name)}`)];
      }
      return out;
    },
    contractClauses: (claims) =>
      db.asUser(claims, async (tx) => {
        const rows = await tx`
          select title, body from public.contract_clauses where active order by sort, created_at`;
        return rows.map((r) => ({ title: String(r["title"]), body: String(r["body"] ?? "") }));
      }),
    bankAccount: (claims, accountId) =>
      db.asUser(claims, async (tx) => {
        const [a] = await tx`
          select name, kind, bank, agency, account_number, holder, holder_document, pix_key_type, pix_key
          from public.financial_accounts where id = ${accountId} and active`;
        if (!a) return null;
        const t = (k: string) => (a[k] as string | null) ?? null;
        return {
          name: String(a["name"]),
          kind: t("kind"),
          bank: t("bank"),
          agency: t("agency"),
          account_number: t("account_number"),
          holder: t("holder"),
          holder_document: t("holder_document"),
          pix_key_type: t("pix_key_type"),
          pix_key: t("pix_key"),
        };
      }),
    receiptInput: (claims, settlementId) =>
      db.asUser(claims, async (tx) => {
        const [s] = await tx`
          select s.id, s.entry_id, s.amount, s.paid_date, s.payment_method, e.work_id, e.person_id,
                 a.name as account_name, a.kind as account_kind, a.bank, a.agency, a.account_number,
                 a.holder, a.holder_document, a.pix_key_type, a.pix_key
          from public.financial_settlements s
          join public.financial_entries e on e.id = s.entry_id
          left join public.financial_accounts a on a.id = s.account_id
          where s.id = ${settlementId} and e.direction = 'entrada' and not e.canceled`;
        if (!s) return null;
        const workId = (s["work_id"] as string | null) ?? null;
        const [w] = workId
          ? await tx`select name, address, client_id, linked_budget_id
                     from public.work_registry where id = ${workId}`
          : [];
        // Entrada de obra: todas as parcelas da obra; entrada geral: só ela mesma.
        const entries = w
          ? await tx`
              select id, description, amount, due_date, installment_index, cash_only
              from public.financial_entries
              where work_id = ${workId} and direction = 'entrada' and not canceled
                and (not cash_only or id = ${s["entry_id"] as string})`
          : await tx`
              select id, description, amount, due_date, installment_index, cash_only
              from public.financial_entries where id = ${s["entry_id"] as string}`;
        const ids = entries.map((e) => e["id"] as string);
        const settlements = ids.length
          ? await tx`select id, entry_id, amount, paid_date from public.financial_settlements
                     where entry_id in ${tx(ids)}`
          : [];
        const personId = (w?.["client_id"] as string | null) ?? (s["person_id"] as string | null);
        const [client] = personId
          ? await tx`select name, document from public.people where id = ${personId}`
          : [];
        const [b] = w?.["linked_budget_id"]
          ? await tx`select number, issue_date, payment_terms from public.budgets
                     where id = ${w["linked_budget_id"] as string}`
          : [];
        const [me] = await tx`select full_name from public.profiles where id = ${claims.sub}`;
        return {
          settlement: {
            id: String(s["id"]),
            entry_id: String(s["entry_id"]),
            amount: num(s["amount"]),
            paid_date: isoDate(s["paid_date"]) ?? "",
            payment_method: (s["payment_method"] as string | null) ?? null,
          },
          entries: entries.map((e) => ({
            id: String(e["id"]),
            description: String(e["description"]),
            amount: num(e["amount"]),
            due_date: isoDate(e["due_date"]) ?? "",
            installment_index: e["installment_index"] === null ? null : num(e["installment_index"]),
            cash_only: e["cash_only"] === true,
          })),
          settlements: settlements.map((x) => ({
            id: String(x["id"]),
            entry_id: String(x["entry_id"]),
            amount: num(x["amount"]),
            paid_date: isoDate(x["paid_date"]) ?? "",
          })),
          work: w
            ? { name: String(w["name"]), address: (w["address"] as string | null) ?? null }
            : null,
          client: client
            ? {
                name: String(client["name"]),
                document: (client["document"] as string | null) ?? null,
              }
            : null,
          budget: b
            ? {
                number: num(b["number"]),
                issue_date: isoDate(b["issue_date"]) ?? "",
                payment_terms: (b["payment_terms"] as ProposalTerm[] | null) ?? [],
              }
            : null,
          issuer: (me?.["full_name"] as string | null) ?? null,
          account: s["account_name"]
            ? {
                name: String(s["account_name"]),
                kind: (s["account_kind"] as string | null) ?? null,
                bank: (s["bank"] as string | null) ?? null,
                agency: (s["agency"] as string | null) ?? null,
                account_number: (s["account_number"] as string | null) ?? null,
                holder: (s["holder"] as string | null) ?? null,
                holder_document: (s["holder_document"] as string | null) ?? null,
                pix_key_type: (s["pix_key_type"] as string | null) ?? null,
                pix_key: (s["pix_key"] as string | null) ?? null,
              }
            : null,
        };
      }),
    proposalInput: (claims, budgetId) =>
      db.asUser(claims, async (tx) => {
        const [b] = await tx`
          select b.*, p.full_name as creator_name from public.budgets b
          left join public.profiles p on p.id = b.created_by
          where b.id = ${budgetId} and b.deleted_at is null`;
        if (!b) return null;
        const sections = await tx`
          select id, title, description, start_week, duration_weeks from public.budget_sections
          where budget_id = ${budgetId} order by sort, created_at`;
        const items = await tx`
          select section_id, description, unit::text as unit, quantity, labor_cost_unit, materials,
                 labor_markup_override, materials_markup_override, item_discount
          from public.budget_items where budget_id = ${budgetId} order by sort, created_at`;
        const [client] = b["client_id"]
          ? await tx`select name, document, rg, endereco, bairro, cidade, uf, cep
                     from public.people where id = ${b["client_id"] as string}`
          : [];
        const opt = (v: unknown) => (v === null || v === undefined ? null : num(v));
        return {
          creatorName: (b["creator_name"] as string | null) ?? null,
          budget: {
            number: num(b["number"]),
            revision: num(b["revision"]),
            status: String(b["status"]),
            title: String(b["title"] ?? ""),
            description: b["description"] as string | null,
            client_display: b["client_display"] as string | null,
            endereco: b["endereco"] as string | null,
            bairro: b["bairro"] as string | null,
            cidade: b["cidade"] as string | null,
            uf: b["uf"] as string | null,
            cep: b["cep"] as string | null,
            issue_date: isoDate(b["issue_date"]) ?? "",
            validity_date: isoDate(b["validity_date"]),
            start_date: isoDate(b["start_date"]),
            estimated_weeks: opt(b["estimated_weeks"]),
            property_type: b["property_type"] as string | null,
            property_area: opt(b["property_area"]),
            responsible: b["responsible"] as string | null,
            notes: b["notes"] as string | null,
            general_discount: num(b["general_discount"]),
            params: { ...emptyParams, ...((b["params"] as object | null) ?? {}) },
            payment_terms: (b["payment_terms"] as ProposalInput["budget"]["payment_terms"]) ?? [],
          },
          sections: sections.map((s) => ({
            id: String(s["id"]),
            title: String(s["title"]),
            description: s["description"] as string | null,
            start_week: opt(s["start_week"]),
            duration_weeks: opt(s["duration_weeks"]),
          })),
          items: items.map((i) => ({
            section_id: String(i["section_id"]),
            description: String(i["description"]),
            unit: String(i["unit"]),
            quantity: num(i["quantity"]),
            labor_cost_unit: num(i["labor_cost_unit"]),
            materials: (i["materials"] as ProposalInput["items"][number]["materials"]) ?? [],
            labor_markup_override: opt(i["labor_markup_override"]),
            materials_markup_override: opt(i["materials_markup_override"]),
            item_discount: num(i["item_discount"]),
          })),
          client: client
            ? {
                name: String(client["name"]),
                document: client["document"] as string | null,
                rg: client["rg"] as string | null,
                endereco: client["endereco"] as string | null,
                bairro: client["bairro"] as string | null,
                cidade: client["cidade"] as string | null,
                uf: client["uf"] as string | null,
                cep: client["cep"] as string | null,
              }
            : null,
        };
      }),
  };
}

/** Coluna date do Postgres em aaaa-mm-dd: o driver entrega meia-noite UTC, então lê em UTC. */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
