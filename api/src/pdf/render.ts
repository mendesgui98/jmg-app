import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PdfLayout } from "../../../src/lib/proposal.ts";
import { chromium, type Browser } from "playwright-core";

// HTML → PDF no Chromium (Playwright) em dois formatos (PdfLayout):
// - "continuo": página única na largura A4 com a altura medida a partir do conteúdo;
// - "paginado": folhas A4 e, com pdf-lib, cabeçalho e rodapé carimbados em todas as páginas menos
//   a capa (logo + "JMG REFORMAS" + documento/cliente no topo; empresa e "n / total" embaixo).

let browser: Promise<Browser> | null = null;

function getBrowser() {
  browser ??= chromium.launch({ args: ["--font-render-hinting=none"] }).catch((e: unknown) => {
    browser = null;
    throw e;
  });
  return browser;
}

export async function closeBrowser() {
  const b = browser;
  browser = null;
  if (b) await (await b).close().catch(() => {});
}

const WIDTH_PX = 794; // 210 mm a 96 dpi
const A4_HEIGHT_PX = 1123; // 297 mm a 96 dpi

export type Stamp = { headerRight: string; footerLeft: string };

// O HTML dos documentos é fechado: fontes e imagens embutidas (data:), nada de script do modelo
// nem acesso à rede. A política abaixo e o bloqueio de rotas garantem isso mesmo se algum dado
// escapar do `esc` — o Chromium roda dentro da rede interna (banco, auth, meta).
const DOC_CSP =
  "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'";

export function lockDocument(html: string) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${DOC_CSP}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + meta) : meta + html;
}

// No máximo 3 documentos gerados ao mesmo tempo (memória do Chromium).
const MAX_RENDERS = 3;
let running = 0;
const waiting: (() => void)[] = [];
// A vaga passa direto de quem termina para o próximo da fila (sem `running--`/`running++` no
// meio), senão um pedido novo podia entrar nesse intervalo e passar de 3.
export async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_RENDERS) await new Promise<void>((r) => waiting.push(r));
  else running++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

export function htmlToPdf(
  html: string,
  title: string,
  layout: PdfLayout,
  stamp: Stamp,
  logoPng: Uint8Array,
): Promise<Buffer> {
  return slot(() => render(lockDocument(html), title, layout, stamp, logoPng));
}

async function render(
  html: string,
  title: string,
  layout: PdfLayout,
  stamp: Stamp,
  logoPng: Uint8Array,
): Promise<Buffer> {
  const page = await (await getBrowser()).newPage({ viewport: { width: WIDTH_PX, height: 1123 } });
  // Nenhuma requisição sai da página (só data: é carregado, e isso não passa por aqui).
  await page.route("**/*", (route) => route.abort());
  let pdf: PDFDocument | null = null;
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    if (layout === "paginado") {
      pdf = await composeSheets(page);
      await stampPages(pdf, stamp, logoPng);
    } else {
      // A faixa final vai para o pé da página (.footer.pinned em layout.ts); o corpo reserva o
      // espaço dela. Altura medida pelo corpo: com o html em overflow hidden o scroll sai menor.
      const height = await page.evaluate(() => {
        const footer = document.querySelector<HTMLElement>(".footer");
        if (footer) {
          const gap = parseFloat(getComputedStyle(footer).marginTop) || 0;
          document.body.style.paddingBottom = `${footer.getBoundingClientRect().height + gap}px`;
          footer.classList.add("pinned");
        }
        return Math.ceil(document.body.getBoundingClientRect().height);
      });
      // Altura em múltiplos de 8 px (6 pt), que o PDF guarda sem arredondar; se o Chromium ainda
      // empurrar algo para uma segunda página, cresce a folga.
      for (const slack of [0, 8, 16, 40]) {
        const pageHeight = Math.ceil(height / 8) * 8 + slack;
        const raw = await page.pdf({
          // Mesma largura da janela: com "210mm" o Chromium arredonda a página para cima e
          // sobra um fio branco na borda direita da capa e da faixa final.
          width: `${WIDTH_PX}px`,
          height: `${pageHeight}px`,
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        const doc = await PDFDocument.load(raw);
        if (doc.getPageCount() === 1) {
          pdf = doc;
          break;
        }
      }
    }
  } finally {
    await page.close();
  }
  if (!pdf) throw new Error("O PDF contínuo não coube em uma página.");
  pdf.setTitle(title);
  return Buffer.from(await pdf.save());
}

// ---------------- Em folhas: blocos inteiros, folha do tamanho do conteúdo ----------------
//
// A capa ocupa uma folha A4. O resto é dividido em blocos (cada filho de seção; tabelas por
// grupo de linhas — tbody — e, se ainda grandes demais, por linha). Cada folha recebe blocos
// inteiros até a altura útil de um A4; se o próximo bloco não couber, a folha estica até
// SHEET_STRETCH para levá-lo inteiro (ex.: a etapa "Limpeza" não é cortada); se nem assim couber,
// ele abre a folha seguinte. Cada folha termina onde o conteúdo termina: sem sobra em branco.
// Títulos (eyebrow, h2/h3/h4, lead, cabeçalho de etapa) ficam sempre com o bloco seguinte.

const MM_PX = 96 / 25.4;
const SHEET_TOP = 24 * MM_PX;
const SHEET_BOTTOM = 20 * MM_PX;
const SHEET_SIDE = 16 * MM_PX;
/** Altura útil de um A4 com as margens do cabeçalho e do rodapé. */
const SHEET_BODY = A4_HEIGHT_PX - SHEET_TOP - SHEET_BOTTOM;
/** Quanto uma folha pode esticar para não cortar um bloco (1,3 = até 30% mais alta que um A4). */
const SHEET_STRETCH = 1.3;

async function composeSheets(page: import("playwright-core").Page) {
  const plan = await page.evaluate(
    ({ body, stretch, width }) => {
      document.body.style.width = `${width}px`;
      // As folhas são montadas aqui: nada de quebra forçada por seção.
      const st = document.createElement("style");
      st.textContent =
        ".paged .sec { break-before: auto !important; } .paged .sec ~ .sec { margin-top: 14mm; }";
      document.head.appendChild(st);
      const max = body * stretch;
      const glue = (el: Element) =>
        el.matches(
          ".eyebrow, h2, h3, h4, .lead, .head, .stage-head, .clause-head, thead, colgroup",
        );
      const units: HTMLElement[] = [];
      const split = (el: HTMLElement) => {
        const h = el.getBoundingClientRect().height;
        if (h <= max || !el.children.length || el.tagName === "TR") return void units.push(el);
        for (const c of el.children) {
          if (c.tagName === "THEAD" || c.tagName === "COLGROUP") continue; // repete em cada folha
          split(c as HTMLElement);
        }
      };
      const kids = [...document.body.children] as HTMLElement[];
      const cover = kids.find((k) => k.classList.contains("cover"));
      for (const k of kids) {
        if (k === cover || getComputedStyle(k).display === "none") continue;
        for (const c of k.children) {
          const el = c as HTMLElement;
          if (el.tagName === "TABLE")
            for (const part of el.children) {
              if (part.tagName === "THEAD" || part.tagName === "COLGROUP") continue;
              split(part as HTMLElement);
            }
          else split(el);
        }
      }
      units.forEach((u, i) => (u.dataset.unit = String(i)));
      // Altura de cada bloco = distância até o próximo (inclui margens); o último vai até o fim.
      const tops = units.map((u) => u.getBoundingClientRect().top + window.scrollY);
      const end = document.body.getBoundingClientRect().bottom + window.scrollY;
      const sizes = units.map((u, i) => (tops[i + 1] ?? end) - tops[i]!);
      // Blocos colados (título + o que vem depois) andam juntos.
      const groups: number[][] = [];
      let cur: number[] = [];
      // Também andam juntos: parcelas de pagamento seguidas e o gráfico com a nota logo abaixo dele.
      const sticks = (u: HTMLElement, next: HTMLElement | undefined) =>
        !!next &&
        (glue(u) || (u.matches(".pay") && next.matches(".pay")) || next.matches(".disclaimer"));
      units.forEach((u, i) => {
        cur.push(i);
        if (!sticks(u, units[i + 1]) || i === units.length - 1) {
          groups.push(cur);
          cur = [];
        }
      });
      const gh = groups.map((g) => g.reduce((t, i) => t + sizes[i]!, 0));
      // Folhas como listas de grupos (índices de `groups`).
      const sheets: number[][] = [];
      let sheet: number[] = [];
      let used = 0;
      gh.forEach((h, gi) => {
        if (!sheet.length || used + h <= body) {
          sheet.push(gi);
          used += h;
        } else if (used + h <= max) {
          sheet.push(gi); // estica a folha para não cortar o bloco
          sheets.push(sheet);
          sheet = [];
          used = 0;
        } else {
          sheets.push(sheet);
          sheet = [gi];
          used = h;
        }
      });
      if (sheet.length) sheets.push(sheet);
      const sum = (sh: number[]) => sh.reduce((t, gi) => t + gh[gi]!, 0);
      // Última folha curta (ex.: só as assinaturas): junta com a anterior se couber esticando;
      // senão traz para ela o fim da anterior (o bloco de aceite inteiro fica na mesma folha).
      if (sheets.length > 1) {
        const last = sheets.at(-1)!;
        const prev = sheets.at(-2)!;
        if (sum(last) < body * 0.4 && sum(prev) + sum(last) <= max) {
          prev.push(...sheets.pop()!);
        } else {
          while (sum(last) < body * 0.5 && prev.length > 1) {
            const moved = prev.slice(-1); // os grupos já trazem os títulos colados
            const k = prev.length - 1;
            if (sum(last) + moved.reduce((t, gi) => t + gh[gi]!, 0) > body) break;
            prev.splice(k);
            last.unshift(...moved);
          }
        }
      }
      return { cover: !!cover, sheets: sheets.map((sh) => sh.flatMap((gi) => groups[gi]!)) };
    },
    { body: SHEET_BODY, stretch: SHEET_STRETCH, width: WIDTH_PX - 2 * SHEET_SIDE },
  );
  const out = await PDFDocument.create();
  const add = async (height: number) => {
    // Altura em múltiplos de 8 px; se o Chromium ainda abrir uma segunda folha, cresce a folga.
    // O tamanho vai no @page (o Chromium quebra pelo @page, não pelo papel pedido).
    for (const slack of [8, 24, 48, 96]) {
      const h = Math.ceil(height / 8) * 8 + slack;
      await page.evaluate((h) => {
        let st = document.getElementById("sheet-size");
        if (!st) {
          st = document.createElement("style");
          st.id = "sheet-size";
          document.head.appendChild(st);
        }
        st.textContent = `@page { size: 794px ${h}px; } @page cover { size: 794px ${h}px; margin: 0; }`;
      }, h);
      const raw = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      const doc = await PDFDocument.load(raw);
      if (doc.getPageCount() === 1 || slack === 96) {
        const pages = await out.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        return;
      }
    }
  };
  if (plan.cover) {
    await page.evaluate(() => {
      for (const k of document.body.children)
        (k as HTMLElement).style.display = k.classList.contains("cover") ? "" : "none";
    });
    await add(A4_HEIGHT_PX - 8);
  }
  for (const sheet of plan.sheets) {
    const height = await page.evaluate((ids) => {
      const show = new Set(ids.map(String));
      const units = [...document.querySelectorAll<HTMLElement>("[data-unit]")];
      units.forEach((u) => (u.style.display = show.has(u.dataset.unit!) ? "" : "none"));
      // Seções, tabelas e etapas só aparecem se tiverem algum bloco desta folha.
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        if (el.dataset.unit !== undefined) continue;
        const inner = el.querySelectorAll<HTMLElement>("[data-unit]");
        if (inner.length)
          el.style.display = [...inner].some((u) => show.has(u.dataset.unit!)) ? "" : "none";
      }
      for (const k of document.body.children)
        if (k.classList.contains("cover")) (k as HTMLElement).style.display = "none";
      // A primeira seção visível da folha começa no topo (o espaço entre seções é só no meio).
      const secs = [...document.body.querySelectorAll<HTMLElement>(":scope > .sec")];
      secs.forEach((x) => (x.style.marginTop = ""));
      const first = secs.find((x) => x.style.display !== "none");
      if (first) first.style.marginTop = "0";
      return Math.ceil(document.body.getBoundingClientRect().height);
    }, sheet);
    await add(height + SHEET_TOP + SHEET_BOTTOM);
  }
  return out;
}

/** Helvetica padrão do PDF só tem WinAnsi: troca o que estiver fora por "?". */
const winAnsi = (s: string) =>
  s.replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022]/g, "?");

const MM = 72 / 25.4;
const NAVY = rgb(0x11 / 255, 0x24 / 255, 0x40 / 255);
const GREY = rgb(0x8a / 255, 0x93 / 255, 0xa1 / 255);
const LINE = rgb(0xe3 / 255, 0xe6 / 255, 0xea / 255);

async function stampPages(pdf: PDFDocument, stamp: Stamp, logoPng: Uint8Array) {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(logoPng);
  const pages = pdf.getPages();
  const total = pages.length;
  pages.forEach((p, i) => {
    if (i === 0) return;
    const { width, height } = p.getSize();
    const left = 16 * MM;
    const right = width - 16 * MM;
    const logoH = 9 * MM;
    const logoW = (logo.width / logo.height) * logoH;
    p.drawImage(logo, { x: left, y: height - 15.5 * MM, width: logoW, height: logoH });
    p.drawText("JMG REFORMAS", {
      x: left + logoW + 2.5 * MM,
      y: height - 12 * MM,
      size: 7.5,
      font: bold,
      color: NAVY,
    });
    const hr = winAnsi(stamp.headerRight);
    p.drawText(hr, {
      x: right - regular.widthOfTextAtSize(hr, 7.5),
      y: height - 12 * MM,
      size: 7.5,
      font: regular,
      color: GREY,
    });
    p.drawLine({
      start: { x: left, y: height - 17.5 * MM },
      end: { x: right, y: height - 17.5 * MM },
      thickness: 0.6,
      color: LINE,
    });
    p.drawText(winAnsi(stamp.footerLeft), {
      x: left,
      y: 9 * MM,
      size: 7,
      font: regular,
      color: GREY,
    });
    const pg = `${i + 1} / ${total}`;
    p.drawText(pg, {
      x: right - bold.widthOfTextAtSize(pg, 7.5),
      y: 9 * MM,
      size: 7.5,
      font: bold,
      color: NAVY,
    });
  });
}
