import { dataPorExtenso } from "../../../src/lib/extenso.ts";
import {
  renderClauses,
  type ClauseBlock,
  type ContractClause,
} from "../../../src/lib/contract-clauses.ts";
import type { PdfLayout, ProposalData } from "../../../src/lib/proposal.ts";
import {
  COMPANY_ACCOUNT,
  contractBankRows,
  type BankAccount,
} from "../../../src/lib/bank-accounts.ts";
import type { Assets } from "./assets.ts";
import {
  BLUE,
  GOLD,
  NAVY,
  baseCss,
  coverHtml,
  divider,
  dmy,
  esc,
  eyebrow,
  footerHtml,
  htmlOpen,
  money,
  pad2,
  pct,
  stageColor,
} from "./layout.ts";

// Contrato de prestação de serviços (modelo aprovado pelo Guilherme), no visual do orçamento.
// As cláusulas vêm do modelo editável (contract_clauses, Configurações → Contrato) e recebem os
// dados do orçamento aprovado pelos marcadores de contract-clauses.ts (objeto, endereço, valores,
// parcelas, dados bancários, início e prazo).

const css = `
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 6mm; }
.cover.compact h1 { font-size: 41pt; }
.clause + .divider { margin: 11mm 16mm; }
.party { border: 1px solid #E3E6EA; border-radius: 3mm; padding: 4.5mm 4.5mm; font-size: 8.4pt; line-height: 1.65; color: #5B6472; }
.party .lbl { font-size: 6.6pt; letter-spacing: .16em; color: ${BLUE}; font-weight: 700; text-transform: uppercase; }
.party b { display: block; color: #16233F; font-size: 11pt; margin: .8mm 0 1.2mm; }
.facts-bar { margin-top: 6mm; background: ${NAVY}; color: #fff; border-radius: 3mm; padding: 4.5mm 5.5mm;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; align-items: end; }
.facts-bar span { display: block; font-size: 6.4pt; letter-spacing: .16em; color: rgba(255,255,255,.65); font-weight: 600;
  text-transform: uppercase; }
.facts-bar b { display: block; font-size: 10.5pt; margin-top: 1mm; }
.facts-bar b.big { font-size: 14pt; }
.preamble { margin-top: 7mm; color: #5B6472; font-size: 9.6pt; line-height: 1.7; }
.clause-head { display: flex; align-items: center; gap: 3.2mm; }
.clause-head .num { width: 9mm; height: 9mm; border-radius: 2mm; background: ${BLUE}; font-size: 10.5pt; flex: none; }
.clause-head small { display: block; color: ${BLUE}; font-weight: 700; letter-spacing: .2em; font-size: 6.6pt; }
.clause-head h3 { margin: 0; font-size: 13pt; line-height: 1.2; color: #16233F; letter-spacing: -.01em; }
.clause-body { margin-top: 4mm; font-size: 9.6pt; line-height: 1.75; color: #1B2539; }
.cl { display: grid; grid-template-columns: 14mm 1fr; margin-top: 3mm; }
.cl:first-child { margin-top: 0; }
.cl > i { font-style: normal; color: ${BLUE}; font-weight: 700; }
.cl.sub { padding-left: 14mm; grid-template-columns: 16mm 1fr; }
.cl.roman { padding-left: 14mm; grid-template-columns: 11mm 1fr; margin-top: 1.4mm; }
.cl.item { padding-left: 14mm; grid-template-columns: 5mm 1fr; margin-top: 1.4mm; }
.cl.item > i::before { content: ""; display: inline-block; width: 1.6mm; height: 1.6mm; border-radius: 99px; background: ${GOLD};
  vertical-align: .4mm; }
.cl-block { margin: 3mm 0 0 14mm; }
.pay { border: 1px solid #E3E6EA; border-radius: 2.5mm; padding: 2mm 4mm; display: flex; align-items: center; gap: 6mm;
  margin-top: 2.6mm; line-height: 1.35; }
.pay:first-child { margin-top: 0; }
.pay .p { width: 17mm; font-size: 15pt; font-weight: 600; color: ${BLUE}; }
.pay .t { flex: 1; } .pay .t b { display: block; font-size: 9.6pt; color: #16233F; }
.pay .t span { color: #5B6472; font-size: 7.8pt; }
.pay .v { font-size: 10.5pt; font-weight: 600; color: #3E4757; }
.pay-total { margin-top: 2.6mm; background: ${NAVY}; color: #fff; border-radius: 2.5mm; padding: 2.6mm 4mm; display: flex;
  justify-content: space-between; font-weight: 700; font-size: 9.6pt; }
.bank { background: #F4F5F7; border-radius: 3mm; padding: 4mm 5mm; display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 3mm 4mm; font-size: 9pt; line-height: 1.35; }
.bank span { display: block; font-size: 6.4pt; letter-spacing: .14em; color: #5B6472; text-transform: uppercase; }
.bank b { color: #16233F; }
.tbl { border: 1px solid #E3E6EA; border-radius: 2.5mm; border-collapse: separate; border-spacing: 0; overflow: hidden; }
.tbl th { background: ${NAVY}; color: #fff; padding: 2.4mm 4mm; letter-spacing: .1em; }
.tbl td { padding: 2.2mm 4mm; border-top: 1px solid #ECEEF1; font-size: 9pt; }
.tbl .dot { display: inline-flex; width: 4.6mm; height: 4.6mm; border-radius: 99px; font-size: 6pt; margin-right: 2.5mm; vertical-align: middle; }
.annex { margin-top: 9mm; background: #F4F5F7; border-radius: 3mm; padding: 4.5mm 5mm; font-size: 8.8pt; line-height: 1.6; }
.annex b { display: block; font-size: 11pt; color: #16233F; margin-bottom: 1.5mm; }
.annex div { display: grid; grid-template-columns: 20mm 1fr; }
.annex div i { font-style: normal; color: ${BLUE}; font-weight: 700; }
.closing { font-size: 9.6pt; line-height: 1.8; }
.closing p { margin: 0 0 2.6mm; }
.signs { display: grid; grid-template-columns: 1fr 1fr; gap: 15mm; margin-top: 22mm; }
.signs div { border-top: 1px solid ${NAVY}; padding-top: 2.4mm; font-size: 7.6pt; color: #5B6472; line-height: 1.45; }
.signs b { display: block; color: #16233F; font-size: 9.6pt; }
/* Paginado: só as partes começam folha nova; cláusulas seguem uma após a outra. */
.paged .sec.clause, .paged .sec.closing { break-before: auto; margin-top: 10mm; }
.paged .clause-head { break-after: avoid; }
.paged .sign-block, .paged .cl, .paged .pay, .paged .pay-total, .paged .annex, .paged .facts-bar { break-inside: avoid; }
`;

/** "Reforma completa" → "reforma completa", sem mexer em siglas ("JMG"). */
const lcfirst = (s: string) => (/^.[a-zà-ú]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function clauseHtml(
  c: { number: number; title: string; blocks: ClauseBlock[] },
  blocks: Record<string, string>,
) {
  const body = c.blocks
    .map((b) => {
      if (b.kind === "block") return `<div class="cl-block">${blocks[b.block]}</div>`;
      if (b.kind === "item") return `<div class="cl item"><i></i><div>${b.html}</div></div>`;
      if (b.kind === "roman")
        return `<div class="cl roman"><i>${b.num} –</i><div>${b.html}</div></div>`;
      return `<div class="cl${b.kind === "sub" ? " sub" : ""}"><i>${b.num ?? ""}</i><div>${b.html}</div></div>`;
    })
    .join("");
  return `<section class="sec clause"><div class="clause-head"><span class="badge num">${c.number}</span>
  <div><small>CLÁUSULA ${pad2(c.number)}</small><h3>${esc(c.title)}</h3></div></div>
  <div class="clause-body">${body}</div></section>`;
}

export function contractHtml(
  d: ProposalData,
  assets: Assets,
  today: string,
  clauses: ContractClause[],
  layout: PdfLayout = "continuo",
  account: BankAccount = COMPANY_ACCOUNT,
) {
  const client = d.client;
  const c = d.company;
  const weeksLabel = d.weeks ? plural(d.weeks, "semana", "semanas") : "a definir";
  const start = d.startDate ? dmy(d.startDate) : "a definir";
  const clientDoc = client.document ? `${client.documentLabel} ${client.document}` : "";
  const cover = coverHtml(assets, {
    code: d.number.replace(/^ORC-/, "CT-"),
    kicker: "Instrumento particular",
    title: `Contrato de<br>prestação de <em>serviços</em>`,
    subtitle: d.title,
    chips: [
      `Orçamento ${d.number}`,
      d.property,
      d.startDate ? `Início previsto ${dmy(d.startDate)}` : null,
    ].filter((x): x is string => !!x),
    facts: [
      { label: "Contratante", value: client.name },
      { label: "Valor do contrato", value: money(d.totals.total) },
      { label: "Prazo estimado", value: weeksLabel },
      { label: "Data", value: dmy(today) },
    ],
  });
  const parties = `<section class="sec">
  ${eyebrow("Partes", true)}
  <h2>Identificação das partes</h2>
  <div class="parties">
    <div class="party"><div class="lbl">Contratante</div><b>${esc(client.name)}</b>
      ${[client.rg ? `RG ${esc(client.rg)}` : "", esc(clientDoc)].filter(Boolean).join(" · ")}${client.rg || clientDoc ? "<br>" : ""}
      ${client.address.map(esc).join(", ")}</div>
    <div class="party"><div class="lbl">Contratada</div><b>${esc(c.name)}</b>
      CNPJ ${esc(c.cnpj)}<br>${esc(c.street)} – ${esc(c.district)},<br>${esc(c.city)}, CEP ${esc(c.cep)}<br>
      Representada por ${esc(d.responsible)}</div>
  </div>
  <div class="facts-bar"><div><span>Orçamento (Anexo 1)</span><b>${esc(d.number)}</b></div>
    <div><span>Valor total</span><b class="big">${money(d.totals.total)}</b></div>
    <div><span>Início previsto</span><b>${start}</b></div>
    <div><span>Prazo estimado</span><b>${weeksLabel}</b></div></div>
  <p class="preamble">As partes acima identificadas têm entre si justo e contratado o presente Contrato de Prestação de Serviços de Obra Civil, que se regerá pelas cláusulas e condições a seguir.</p>
</section>`;
  const stagesTable = `<table class="tbl"><thead><tr><th>Etapa</th><th class="r">Início</th><th class="r">Duração</th></tr></thead><tbody>
${d.stages.map((s) => `<tr><td><span class="badge dot" style="background:${stageColor(s.number)}">${pad2(s.number)}</span>${esc(s.title)}</td><td class="r">semana ${s.startWeek}</td><td class="r">${s.weeks} sem.</td></tr>`).join("")}
</tbody></table>`;
  const payments = `${d.payments.map((r) => `<div class="pay"><div class="p">${pct(r.pct)}</div><div class="t"><b>${esc(r.label)}</b>${r.when ? `<span>${esc(r.when)}</span>` : ""}</div><div class="v nb">${money(r.value)}</div></div>`).join("")}
<div class="pay-total"><span>Total</span><span class="nb">${money(d.totals.total)}</span></div>`;
  // Quadro com a conta escolhida ao gerar o contrato.
  const bank = `<div class="bank">${contractBankRows(account)
    .map((r) => `<div><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`)
    .join("")}</div>`;
  const description = d.description.trim().replace(/[.;\s]+$/, "");
  const rendered = renderClauses(clauses, {
    OBJETO: esc(
      `${lcfirst(d.title.trim() || "reforma")}${description ? ` — ${lcfirst(description)} —` : ""}`,
    ),
    ENDERECO_OBRA: `<b>${esc(d.site.full)}</b>`,
    AREA: d.area ? `, com área aproximada de ${esc(d.area)}` : "",
    ORCAMENTO: `<b>Orçamento nº <span class="nb">${esc(d.number)}</span></b>`,
    DATA_ORCAMENTO: dmy(d.budgetDate),
    VALOR: `<b>${money(d.totals.total)}</b> (${esc(d.totals.totalWords)})`,
    MAO_DE_OBRA: money(d.totals.labor),
    MATERIAIS: money(d.totals.materials),
    INICIO: `<b>${d.startDate ? dmy(d.startDate) : "a definir entre as partes"}</b>`,
    PRAZO: `<b>${d.weeks ? weeksLabel : "a definir no cronograma definitivo"}</b>`,
  });
  const blocks = { TABELA_ETAPAS: stagesTable, TABELA_PARCELAS: payments, DADOS_BANCARIOS: bank };
  const clausesHtml = rendered.map((cl) => clauseHtml(cl, blocks));
  const annex = `<div class="annex"><b>Anexos</b>
  <div><i>Anexo 1</i><span>Orçamento nº ${esc(d.number)}, emitido em ${dmy(d.budgetDate)}</span></div>
  <div><i>Anexo 2</i><span>Termo de Início de Obra</span></div>
  <div><i>Anexo 3</i><span>Termo de Conclusão de Obra</span></div></div>`;
  const lastClause = clausesHtml.pop();
  const closing = `<section class="sec closing">
  <p>E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.</p>
  <div class="sign-block"><p><b>${esc(d.site.city || "São Paulo")}, ${dataPorExtenso(today)}.</b></p>
  <div class="signs">
    <div><b>${esc(client.name)}</b>CONTRATANTE${clientDoc ? ` · ${esc(clientDoc)}` : ""}</div>
    <div><b>${esc(c.name.toUpperCase())}</b>CONTRATADA · CNPJ ${esc(c.cnpj)}<br>${esc(d.responsible)} · Sócio-administrador</div>
  </div></div>
</section>`;
  const sections = [
    parties,
    ...clausesHtml,
    lastClause ? lastClause.replace(/<\/section>$/, `${annex}</section>`) : annex,
    closing,
  ];
  return `${htmlOpen(layout)}<head><meta charset="utf-8"><title>Contrato ${esc(d.number)}</title>
<style>${baseCss(assets, layout)}${css}</style></head><body>${cover}${sections.join(divider)}${footerHtml(assets, c)}</body></html>`;
}
