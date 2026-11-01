import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DEFAULT_TERMS, type ProposalData, type ProposalInput } from "../../src/lib/proposal.ts";
import type { ReceiptData } from "../../src/lib/receipt.ts";
import type { BankAccount } from "../../src/lib/bank-accounts.ts";
import { emptyParams } from "../../src/lib/pricing.ts";
import { fakeRepo, start, token } from "./helpers.ts";

const ID = "11111111-2222-3333-4444-555555555555";
const input = (status: string, pct = 30): Omit<ProposalInput, "today"> => ({
  client: null,
  sections: [
    { id: "s1", title: "Pintura", description: null, start_week: null, duration_weeks: null },
  ],
  items: [
    {
      section_id: "s1",
      description: "Pintura acrílica",
      unit: "m2",
      quantity: 10,
      labor_cost_unit: 50,
      materials: [],
      labor_markup_override: null,
      materials_markup_override: null,
      item_discount: 0,
    },
  ],
  budget: {
    number: 7,
    revision: 0,
    status,
    title: "Reforma",
    description: null,
    client_display: "Cliente Teste",
    endereco: "Rua A, 1",
    bairro: null,
    cidade: "São Paulo",
    uf: "SP",
    cep: null,
    issue_date: "2026-10-01",
    validity_date: null,
    start_date: null,
    estimated_weeks: null,
    property_type: null,
    property_area: null,
    responsible: null,
    notes: null,
    general_discount: 0,
    params: emptyParams,
    payment_terms: [{ ...DEFAULT_TERMS[0]!, pct }, ...DEFAULT_TERMS.slice(1)],
  },
});

let current = input("elaboracao");
const rendered: ProposalData[] = [];
const layouts: string[] = [];
const banks: BankAccount[] = [];
const receipts: ReceiptData[] = [];
const repo = fakeRepo({ adm: ["admin"], eq: ["equipe"] });
repo.proposalInput = async (_c, id) => (id === ID ? current : null);
const SETTLEMENT = "aaaaaaaa-1111-2222-3333-444444444444";
repo.receiptInput = async (_c, id) =>
  id === SETTLEMENT
    ? {
        settlement: {
          id,
          entry_id: "e1",
          amount: 1000,
          paid_date: "2026-11-09",
          payment_method: "Pix",
        },
        entries: [
          { id: "e1", description: "Entrada na assinatura", amount: 1000, due_date: "2026-11-09" },
        ],
        settlements: [{ id, entry_id: "e1", amount: 1000, paid_date: "2026-11-09" }],
        work: { name: "Obra", address: null },
        client: { name: "Cliente", document: null },
        budget: { number: 7, issue_date: "2026-10-28", payment_terms: DEFAULT_TERMS },
        issuer: null,
        account: {
          name: "Itaú PJ",
          bank: "Itaú",
          agency: "1234",
          account_number: "5678-9",
          holder: "JMG Reformas LTDA",
          holder_document: "62.780.542/0001-81",
        },
      }
    : null;
const ITAU = "bbbbbbbb-1111-2222-3333-444444444444";
const CAIXA = "cccccccc-1111-2222-3333-444444444444";
repo.bankAccount = async (_c, id) =>
  id === ITAU
    ? {
        name: "Itaú PJ",
        bank: "Itaú",
        agency: "1234",
        account_number: "5678-9",
        pix_key: "f@jmg.local",
        pix_key_type: "email",
      }
    : id === CAIXA
      ? { name: "Caixa", kind: "caixa" }
      : null;
const api = await start({
  repo,
  today: () => "2026-10-28",
  pdf: {
    proposalPreview: (d) => `<html><body>${d.number}</body></html>`,
    proposal: async (d, layout) => (
      rendered.push(d),
      layouts.push(layout),
      Buffer.from("%PDF-orcamento")
    ),
    contract: async (d, _today, _clauses, layout, bank) => (
      rendered.push(d),
      layouts.push(layout),
      banks.push(bank),
      Buffer.from("%PDF-contrato")
    ),
    receipt: async (d) => (receipts.push(d), Buffer.from("%PDF-recibo")),
  },
});
after(() => api.close());

const post = (path: string, sub = "adm") =>
  api.call(path, { method: "POST", auth: token({ sub }) });

test("gera o PDF do orçamento com os dados do banco", async () => {
  const r = await post(`/v1/orcamentos/${ID}/pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/pdf");
  assert.match(r.headers.get("content-disposition") ?? "", /ORC-2026-0007\.pdf/);
  assert.equal(await r.text(), "%PDF-orcamento");
  const d = rendered.at(-1)!;
  assert.equal(d.issueDate, "2026-10-28");
  assert.equal(d.validUntil, "2026-11-12");
  assert.equal(d.totals.total, 500);
});

test("PDF sai contínuo por padrão e paginado quando pedido", async () => {
  assert.equal((await post(`/v1/orcamentos/${ID}/pdf`)).status, 200);
  assert.equal(layouts.at(-1), "continuo");
  assert.equal((await post(`/v1/orcamentos/${ID}/pdf?layout=paginado`)).status, 200);
  assert.equal(layouts.at(-1), "paginado");
  assert.equal((await post(`/v1/orcamentos/${ID}/pdf?layout=qualquer`)).status, 200);
  assert.equal(layouts.at(-1), "continuo");
});

test("equipe não gera PDF com valores", async () => {
  assert.equal((await post(`/v1/orcamentos/${ID}/pdf`, "eq")).status, 403);
});

test("parcelas que não fecham 100% bloqueiam o PDF", async () => {
  current = input("elaboracao", 20);
  const r = await post(`/v1/orcamentos/${ID}/pdf`);
  assert.equal(r.status, 422);
  assert.match((await r.json()).message, /90%/);
  current = input("elaboracao");
});

test("contrato só sai de orçamento aprovado", async () => {
  const r = await post(`/v1/orcamentos/${ID}/contrato`);
  assert.equal(r.status, 422);
  assert.match((await r.json()).message, /aprovado/);
  current = input("aprovado");
  const ok = await post(`/v1/orcamentos/${ID}/contrato`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-disposition") ?? "", /Contrato-ORC-2026-0007/);
  assert.equal(layouts.at(-1), "continuo");
  assert.equal((await post(`/v1/orcamentos/${ID}/contrato?layout=paginado`)).status, 200);
  assert.equal(layouts.at(-1), "paginado");
});

test("contrato sai com a conta escolhida e recusa conta sem dados bancários", async () => {
  current = input("aprovado");
  const call = (account_id: string) =>
    api.call(`/v1/orcamentos/${ID}/contrato`, {
      method: "POST",
      auth: token({ sub: "adm" }),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_id }),
    });
  assert.equal((await call(ITAU)).status, 200);
  assert.equal(banks.at(-1)?.bank, "Itaú");
  const caixa = await call(CAIXA);
  assert.equal(caixa.status, 422);
  assert.match((await caixa.json()).message, /chave PIX/);
  assert.equal((await call("99999999-2222-3333-4444-555555555555")).status, 422);
  assert.equal((await post(`/v1/orcamentos/${ID}/contrato`)).status, 200);
  assert.equal(banks.at(-1)?.bank, "Banco C6");
});

test("orçamento inexistente devolve 404", async () => {
  assert.equal((await post("/v1/orcamentos/99999999-2222-3333-4444-555555555555/pdf")).status, 404);
});

test("data do banco não muda de dia no fuso de São Paulo", async () => {
  const { isoDate } = await import("../src/repo.ts");
  assert.equal(isoDate(new Date("2026-11-16")), "2026-11-16");
  assert.equal(isoDate("2026-11-16"), "2026-11-16");
  assert.equal(isoDate(null), null);
});

test("recibo do recebimento de uma entrada, com os dados opcionais do pagador", async () => {
  const r = await api.call(`/v1/recebimentos/${SETTLEMENT}/recibo`, {
    method: "POST",
    auth: token({ sub: "adm" }),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payer: { bank: "Banco Itaú" }, transactionId: "E123" }),
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition") ?? "", /Recibo-REC-2026-0007-01\.pdf/);
  const d = receipts.at(-1)!;
  assert.equal(d.transactionId, "E123");
  assert.deepEqual(
    d.paidBy.map((x) => x.value),
    ["Cliente", "Banco Itaú"],
  );
  assert.equal(d.amountWords, "mil reais");
  assert.deepEqual(
    d.receivedIn.map((x) => x.value),
    ["JMG Reformas LTDA", "62.780.542/0001-81", "Itaú", "1234 · 5678-9"],
  );
});

test("recibo: equipe não gera e recebimento desconhecido devolve 404", async () => {
  assert.equal((await post(`/v1/recebimentos/${SETTLEMENT}/recibo`, "eq")).status, 403);
  assert.equal(
    (await post("/v1/recebimentos/99999999-2222-3333-4444-555555555555/recibo")).status,
    404,
  );
});

test("contrato tem só as assinaturas do contratante e da contratada, sem testemunhas", async () => {
  const { contractHtml } = await import("../src/pdf/contract-html.ts");
  const { buildProposal } = await import("../../src/lib/proposal.ts");
  const data = buildProposal({ ...input("aprovado"), today: "2026-11-01" });
  const html = contractHtml(
    data,
    { css: "", logoBlue: new Uint8Array(), logoWhite: "", logoBlueUri: "" },
    "2026-11-01",
    [{ title: "Objetivo", body: "{{N}}.1. Reforma." }],
  );
  assert.doesNotMatch(html, /testemunha/i);
  assert.match(html, /CONTRATANTE/);
  assert.match(html, /CONTRATADA/);
  assert.equal(html.match(/<div class="signs">/g)?.length, 1);
});

test("prévia do orçamento: página do PDF na tela, mesmo com pendências", async () => {
  current = input("elaboracao", 20);
  const r = await post(`/v1/orcamentos/${ID}/previa`);
  assert.equal(r.status, 200);
  const body = (await r.json()) as { html: string; issues: string[] };
  assert.match(body.html, /ORC-2026-0007/);
  assert.match(body.issues.join(" "), /90%/);
  assert.equal((await post(`/v1/orcamentos/${ID}/previa`, "eq")).status, 403);
  current = input("elaboracao");
});
