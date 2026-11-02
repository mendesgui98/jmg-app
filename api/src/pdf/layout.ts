import type { PdfLayout, ProposalData } from "../../../src/lib/proposal.ts";
import type { Assets } from "./assets.ts";

// Identidade visual comum ao orçamento e ao contrato (modelo contínuo aprovado pelo Guilherme):
// uma página única na largura A4 que cresce com o conteúdo. Capa azul-marinho com a logo como
// marca d'água, seções separadas por divisórias e faixa da empresa no final (footerHtml).

export const NAVY = "#112440";
export const BLUE = "#004AAD";
export const BLUE_LIGHT = "#2F7FE3";
export const GOLD = "#E8A33D";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (n: number) => brl.format(Number(n) || 0).replace(/\u00a0/g, " ");
export const num = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const pct = (n: number) => `${num(n)}%`;
export const dmy = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "a definir";
export const pad2 = (n: number) => String(n).padStart(2, "0");

export function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cor da etapa: alterna azul forte e azul claro. */
export const stageColor = (n: number) => (n % 2 === 1 ? BLUE : BLUE_LIGHT);

export const icons = {
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5l4 4 8-9"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  invest: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="16" cy="30" rx="9" ry="3.5"/><path d="M7 30v5c0 2 4 3.5 9 3.5s9-1.5 9-3.5v-5"/><path d="M7 35v0"/><ellipse cx="16" cy="25" rx="9" ry="3.5"/><path d="M31 38V27M36 38V22M41 38V17"/><path d="M27 18l6-6 4 3 6-7"/><path d="M39 8h4v4"/></svg>`,
};

export function eyebrow(text: string, gold = false) {
  return `<div class="eyebrow${gold ? " gold" : ""}"><span></span>${esc(text)}</div>`;
}

/** Divisória entre as seções da página contínua. */
export const divider = `<div class="divider"></div>`;

/** Faixa final com os dados da empresa (substitui o rodapé carimbado por página). */
export function footerHtml(assets: Assets, c: ProposalData["company"]) {
  return `<footer class="footer"><div class="in"><img src="${assets.logoWhite}" alt="JMG"><div>
  <b>${esc(c.name)}</b> · CNPJ ${esc(c.cnpj)}<br>${esc(c.street)} – ${esc(c.district)}, ${esc(c.city)}, CEP ${esc(c.cep)}<br>
  ${esc(c.phone)} · ${esc(c.instagram)}</div></div><div class="stripe"><i></i><i></i></div></footer>`;
}

/** Raiz do documento: no modo paginado a classe troca as regras de página (pagedCss). */
export const htmlOpen = (layout: PdfLayout) =>
  `<!doctype html><html lang="pt-BR"${layout === "paginado" ? ` class="paged"` : ""}>`;

/**
 * Página contínua: o PDF arredonda largura e altura para cima. O conteúdo passa 2 px da lateral
 * (cortados) e a faixa final fica presa ao pé da página (render.ts reserva o espaço dela), então
 * a folga de altura vira espaço branco antes da faixa, sem fio na borda.
 */
const CONTINUOUS_PAGE = `@page { margin: 0; }
html { overflow: hidden; }
.footer.pinned { position: fixed; left: 0; right: 0; bottom: 0; margin: 0; }
.footer.pinned::after { content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 12px;
  background: linear-gradient(90deg, ${BLUE} 70%, ${GOLD} 70%); }`;

export function baseCss(assets: Assets, layout: PdfLayout) {
  return `${assets.css}
${layout === "paginado" ? "@page { size: A4; margin: 24mm 16mm 20mm 16mm; }\n@page cover { margin: 0; }" : CONTINUOUS_PAGE}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body { background: #fff; }
body { width: ${layout === "paginado" ? "100%" : "calc(100% + 2px)"}; font-family: Inter, sans-serif; color: #1B2539; font-size: 10.5pt; line-height: 1.45;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sec { padding: 0 16mm; }
.cover + .sec { padding-top: 21mm; }
.divider { height: 1px; margin: 20mm 16mm; background: linear-gradient(90deg, transparent, #E3E6EA 12%, #E3E6EA 88%, transparent); }
.cover { position: relative; width: 100%; height: 264.6mm; overflow: hidden; background: ${NAVY}; color: #fff; }
.cover .mark { position: absolute; right: -86mm; top: 52mm; width: 215mm; opacity: .07; }
.cover .brand { position: absolute; left: 16mm; top: 15.5mm; display: flex; align-items: center; gap: 4.5mm; }
.cover .brand img { width: 28mm; }
.cover .brand .sep { width: 1px; height: 10mm; background: rgba(255,255,255,.45); }
.cover .brand .name { font-weight: 700; letter-spacing: .32em; font-size: 9pt; line-height: 1.6; }
.cover .code { position: absolute; right: 16mm; top: 19mm; border: 1px solid rgba(255,255,255,.4);
  border-radius: 99px; padding: 1.1mm 3.4mm; font-size: 7.5pt; letter-spacing: .16em; color: rgba(255,255,255,.85); }
.cover .hero { position: absolute; left: 16mm; right: 16mm; top: 103.5mm; }
.cover .kicker { text-transform: uppercase; display: flex; align-items: center; gap: 3mm; color: ${GOLD}; font-weight: 600;
  letter-spacing: .22em; font-size: 8.5pt; }
.cover .kicker span { width: 7mm; height: 1px; background: rgba(255,255,255,.5); display: inline-block; }
.cover h1 { margin: 6mm 0 0; font-size: 49pt; line-height: 1.02; font-weight: 700; letter-spacing: -.02em; }
.cover h1 em { font-style: normal; color: ${GOLD}; }
.cover .subtitle { margin-top: 5mm; font-size: 14pt; color: rgba(255,255,255,.85); font-weight: 400; }
.chips { display: flex; flex-wrap: wrap; gap: 1.8mm; margin-top: 5mm; }
.cover .chip { border: 1px solid rgba(255,255,255,.4); border-radius: 99px; padding: .9mm 3mm;
  font-size: 7.8pt; font-weight: 600; color: #fff; }
.cover .card { position: absolute; left: 16mm; right: 16mm; top: 187mm; display: flex; gap: 4.5mm; }
.cover .card > div { flex: 1; min-width: 0; display: flex; gap: 3.5mm; align-items: flex-start;
  border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.05); border-radius: 2.5mm; padding: 4.5mm 4.5mm; }
.cover .card > div:last-child { flex: 1.3; }
.cover .ico { width: 7.4mm; height: 7.4mm; flex: none; border-radius: 99px; background: rgba(255,255,255,.1);
  color: ${GOLD}; display: flex; align-items: center; justify-content: center; }
.cover .ico svg { width: 3.8mm; height: 3.8mm; }
.cover .lbl { font-size: 6.6pt; letter-spacing: .16em; color: rgba(255,255,255,.6); font-weight: 600; text-transform: uppercase; }
.cover .val { font-size: 11pt; font-weight: 600; margin-top: .8mm; line-height: 1.3; }
.cover .sub { font-size: 7.8pt; color: rgba(255,255,255,.7); margin-top: .8mm; }
.cover .facts { position: absolute; left: 16mm; right: 16mm; top: 222.5mm; border-top: 1px solid rgba(255,255,255,.2);
  padding-top: 6mm; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
.cover .facts .val { font-size: 10.5pt; }
.stripe { height: 2.8mm; display: flex; }
.stripe i:first-child { flex: 7; background: ${BLUE}; } .stripe i:last-child { flex: 3; background: ${GOLD}; }
.cover .stripe { position: absolute; left: 0; right: 0; bottom: 0; }
.cover.compact { height: 207.8mm; } .cover.compact .hero { top: 79.2mm; } .cover.compact .facts { top: 153.8mm; }
.cover.compact .mark { top: 36mm; }
.eyebrow { display: flex; align-items: center; gap: 3mm; color: ${BLUE}; font-weight: 700; letter-spacing: .2em;
  font-size: 7.6pt; text-transform: uppercase; }
.eyebrow span { width: 5mm; height: 1px; background: #8A93A1; display: inline-block; }
.eyebrow.gold span { background: ${GOLD}; height: 2px; }
h2 { margin: 1.5mm 0 0; font-size: 20pt; line-height: 1.2; font-weight: 700; letter-spacing: -.015em; color: #16233F; }
.lead { color: #5B6472; font-size: 9.8pt; line-height: 1.6; margin: 2.5mm 0 0; max-width: 160mm; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; }
.head .lead { max-width: 122mm; }
.sum { flex: none; background: ${NAVY}; color: #fff; border-radius: 2.5mm; padding: 3.6mm 4.5mm; text-align: right; }
.sum span { display: block; color: ${GOLD}; font-size: 6.6pt; letter-spacing: .16em; font-weight: 600; text-transform: uppercase; }
.sum b { display: block; font-size: 17pt; line-height: 1.25; font-weight: 700; letter-spacing: -.01em; }
.sum small { font-size: 7.2pt; color: rgba(255,255,255,.75); }
.muted { color: #6B7280; }
.badge { display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; }
table { width: 100%; border-collapse: collapse; }
th { font-size: 6.8pt; letter-spacing: .14em; color: #5B6472; font-weight: 500; text-transform: uppercase; text-align: left; }
.r { text-align: right; } .c { text-align: center; }
.nb { white-space: nowrap; }
.footer { margin-top: 16mm; background: ${NAVY}; color: rgba(255,255,255,.8); }
.footer .in { padding: 10mm 16mm; display: flex; gap: 4.5mm; align-items: center; font-size: 7.6pt; line-height: 1.75; }
.footer img { width: 15mm; } .footer b { color: #fff; }
/* Paginado: cada seção começa numa folha; o carimbo do render.ts faz cabeçalho e rodapé. */
html.paged { background: #fff; }
.paged .cover, .paged .cover.compact { page: cover; width: 210mm; height: 297mm; }
.paged .cover .hero, .paged .cover.compact .hero { top: 108mm; } .paged .cover .card { top: 212mm; }
.paged .cover .facts, .paged .cover.compact .facts { top: 258mm; } .paged .cover.compact .mark { top: 52mm; }
.paged .sec { padding: 0; break-before: page; }
.paged .divider, .paged .footer { display: none; }
.paged thead { display: table-header-group; }
.paged tr, .paged .stage-head, .paged .feature, .paged .how-steps, .paged .obra, .paged .pay, .paged .notes,
.paged .valid, .paged .signs, .paged .kpis, .paged .party, .paged .bank, .paged .sum { break-inside: avoid; }
.paged h2, .paged h3, .paged h4, .paged .head { break-after: avoid; }
`;
}

export function coverHtml(
  assets: Assets,
  o: {
    code: string;
    kicker: string;
    title: string;
    subtitle: string;
    chips: string[];
    /** Sem os cartões de cliente/endereço a capa fica mais baixa (contrato). */
    card?: { client: { name: string; sub?: string }; site: { line1: string; line2: string } };
    facts: { label: string; value: string }[];
  },
) {
  const card = o.card;
  return `<section class="cover${card ? "" : " compact"}">
  <img class="mark" src="${assets.logoWhite}" alt="">
  <div class="brand"><img src="${assets.logoWhite}" alt="JMG"><div class="sep"></div><div class="name">JMG<br>REFORMAS</div></div>
  <div class="code">${esc(o.code)}</div>
  <div class="hero">
    <div class="kicker"><span></span>${esc(o.kicker)}</div>
    <h1>${o.title}</h1>
    <div class="subtitle">${esc(o.subtitle)}</div>
    <div class="chips">${o.chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
  </div>
  ${
    card
      ? `<div class="card">
    <div><span class="ico">${icons.user}</span><div><div class="lbl">Cliente</div><div class="val">${esc(card.client.name)}</div>${card.client.sub ? `<div class="sub">${esc(card.client.sub)}</div>` : ""}</div></div>
    <div><span class="ico">${icons.pin}</span><div><div class="lbl">Endereço da obra</div><div class="val">${esc(card.site.line1)}</div><div class="sub">${esc(card.site.line2)}</div></div></div>
  </div>`
      : ""
  }
  <div class="facts">${o.facts.map((f) => `<div><div class="lbl">${esc(f.label)}</div><div class="val">${esc(f.value)}</div></div>`).join("")}</div>
  <div class="stripe"><i></i><i></i></div>
</section>`;
}
