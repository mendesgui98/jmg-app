import type { ContractClause } from "../../../src/lib/contract-clauses.ts";
import {
  SCHEDULE_DISCLAIMER,
  type PdfLayout,
  type ProposalData,
} from "../../../src/lib/proposal.ts";
import { loadAssets } from "./assets.ts";
import { contractHtml } from "./contract-html.ts";
import { proposalHtml } from "./proposal-html.ts";
import { receiptHtml } from "./receipt-html.ts";
import type { ReceiptData } from "../../../src/lib/receipt.ts";
import type { BankAccount } from "../../../src/lib/bank-accounts.ts";
import { htmlToPdf } from "./render.ts";

// Serviço de documentos da API: recebe os dados já montados (proposal.ts) e devolve o PDF.

export type PdfService = {
  proposal(data: ProposalData, layout: PdfLayout): Promise<Buffer>;
  /** Página do orçamento no modelo do PDF (prévia na tela, sem gerar o arquivo). */
  proposalPreview(data: ProposalData, layout: PdfLayout): string;
  contract(
    data: ProposalData,
    today: string,
    clauses: ContractClause[],
    layout: PdfLayout,
    bank: BankAccount,
  ): Promise<Buffer>;
  receipt(data: ReceiptData): Promise<Buffer>;
};

const footer = (d: ProposalData) =>
  `${d.company.name} · CNPJ ${d.company.cnpj} · ${d.company.phone} · ${d.company.instagram}`;

/**
 * Página do PDF para ver na tela: o modelo trava a rolagem (`html { overflow: hidden }`, para o
 * PDF contínuo sair numa página só); na prévia a rolagem volta a funcionar.
 */
export function previewHtml(html: string) {
  const unlock =
    "<style>html, body { overflow: auto !important; height: auto !important; }</style>";
  return html.includes("</head>") ? html.replace("</head>", `${unlock}</head>`) : unlock + html;
}

export function createPdfService(): PdfService {
  return {
    proposalPreview: (d, layout) =>
      previewHtml(proposalHtml(d, loadAssets(), SCHEDULE_DISCLAIMER, layout)),
    proposal: (d, layout) => {
      const assets = loadAssets();
      const title = `${d.number} · ${d.client.name}`;
      return htmlToPdf(
        proposalHtml(d, assets, SCHEDULE_DISCLAIMER, layout),
        title,
        layout,
        { headerRight: title, footerLeft: footer(d) },
        assets.logoBlue,
      );
    },
    contract: (d, today, clauses, layout, bank) => {
      const assets = loadAssets();
      const title = `Contrato · ${d.number} · ${d.client.name}`;
      return htmlToPdf(
        contractHtml(d, assets, today, clauses, layout, bank),
        title,
        layout,
        { headerRight: title, footerLeft: footer(d) },
        assets.logoBlue,
      );
    },
    receipt: (d) => {
      const assets = loadAssets();
      const title = `${d.number} · ${d.client.name}`;
      return htmlToPdf(
        receiptHtml(d, assets),
        title,
        "continuo",
        { headerRight: title, footerLeft: `${d.company.name} · CNPJ ${d.company.cnpj}` },
        assets.logoBlue,
      );
    },
  };
}
