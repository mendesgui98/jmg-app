import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { bearer, verifyJwt, type Claims } from "./auth.ts";
import type { AuthAdmin } from "./gotrue.ts";
import { HttpError, Router, json, readJson, send, type Reply, type Request } from "./http.ts";
import { ROLES, type Repo, type Role } from "./repo.ts";
import type { PdfService } from "./pdf/index.ts";
import {
  buildProposal,
  contractIssues,
  pdfLayout,
  proposalIssues,
} from "../../src/lib/proposal.ts";
import { buildReceipt } from "../../src/lib/receipt.ts";
import { documentFileName } from "../../src/lib/file-names.ts";
import { COMPANY_ACCOUNT, hasBankData } from "../../src/lib/bank-accounts.ts";

export type Deps = {
  jwtSecret: string;
  siteUrl: string;
  corsOrigins: string[];
  repo: Repo;
  authAdmin: AuthAdmin;
  pdf?: PdfService;
  /** Data de hoje (aaaa-mm-dd) no fuso de São Paulo; substituível nos testes. */
  today?: () => string;
  log?: (entry: Record<string, unknown>) => void;
};

type Session = { claims: Claims; roles: Role[] };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  full_name: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
});
const optText = z.string().trim().max(120).optional();
const receiptSchema = z
  .object({
    payer: z
      .object({ name: optText, document: optText, bank: optText, account: optText })
      .partial()
      .optional(),
    transactionId: optText,
  })
  .default({});
const contractSchema = z.object({ account_id: z.guid("Conta inválida").optional() }).default({});
const rolesSchema = z.object({ roles: z.array(z.enum(ROLES)).max(3) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new HttpError(400, "invalid_body", r.error.issues.map((i) => i.message).join("; "));
  }
  return r.data;
}

export function createApp(deps: Deps) {
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));

  async function session(req: Request): Promise<Session> {
    const claims = verifyJwt(bearer(req.headers.authorization), deps.jwtSecret);
    return { claims, roles: await deps.repo.rolesOf(claims.sub) };
  }

  /** Admin com 2FA: quem já cadastrou o segundo fator precisa estar em aal2. */
  async function admin(req: Request): Promise<Session> {
    const s = await session(req);
    if (!s.roles.includes("admin")) {
      throw new HttpError(403, "forbidden", "Acesso restrito a administradores");
    }
    if (s.claims.aal !== "aal2" && (await deps.repo.hasVerifiedFactor(s.claims.sub))) {
      throw new HttpError(403, "mfa_required", "Confirme o segundo fator de autenticação");
    }
    return s;
  }

  const today =
    deps.today ?? (() => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));

  /** Monta os dados do documento; só admin/financeiro (o preço de venda depende dos custos). */
  async function proposalData(req: Request) {
    const s = await session(req);
    if (!s.roles.includes("admin") && !s.roles.includes("financeiro")) {
      throw new HttpError(403, "forbidden", "Acesso restrito a administradores e financeiro");
    }
    if (!deps.pdf) throw new HttpError(503, "pdf_unavailable", "Geração de PDF indisponível");
    const id = req.params["id"] ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new HttpError(404, "not_found", "Orçamento não encontrado");
    const input = await deps.repo.proposalInput(s.claims, id);
    if (!input) throw new HttpError(404, "not_found", "Orçamento não encontrado");
    return { s, pdf: deps.pdf, data: buildProposal({ ...input, today: today() }) };
  }

  const pdfReply = (body: Buffer, name: string): Reply => ({
    status: 200,
    body,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });

  const router = new Router()
    .add("GET", "/health", async () => {
      const db = await deps.repo.ping().catch(() => false);
      return json(db ? 200 : 503, { status: db ? "ok" : "degraded", db });
    })
    .add("GET", "/v1/me", async (req) => {
      const s = await session(req);
      return json(200, {
        id: s.claims.sub,
        email: s.claims.email ?? null,
        roles: s.roles,
        aal: s.claims.aal ?? "aal1",
      });
    })
    .add("GET", "/v1/admin/users", async (req) => {
      await admin(req);
      return json(200, { users: await deps.repo.listUsers() });
    })
    .add("POST", "/v1/admin/invites", async (req) => {
      const s = await admin(req);
      const body = parse(inviteSchema, await req.body());
      const user = await deps.authAdmin.invite(
        body.email,
        body.full_name ? { full_name: body.full_name } : {},
        `${deps.siteUrl}/reset-password`,
      );
      await deps.repo.setRoles(user.id, [body.role]);
      log({ event: "invite", by: s.claims.sub, user: user.id, role: body.role });
      return json(201, { user });
    })
    .add("PUT", "/v1/admin/users/:id/roles", async (req) => {
      const s = await admin(req);
      const { roles } = parse(rolesSchema, await req.body());
      const target = req.params["id"] ?? "";
      if (target === s.claims.sub && !roles.includes("admin")) {
        throw new HttpError(
          409,
          "self_demotion",
          "Você não pode remover seu próprio acesso de administrador",
        );
      }
      const current = await deps.repo.rolesOf(target);
      if (
        current.includes("admin") &&
        !roles.includes("admin") &&
        (await deps.repo.countAdmins()) <= 1
      ) {
        throw new HttpError(409, "last_admin", "O sistema precisa de pelo menos um administrador");
      }
      await deps.repo.setRoles(target, [...new Set(roles)]);
      log({ event: "roles", by: s.claims.sub, user: target, roles });
      return json(200, { id: target, roles });
    })
    .add("POST", "/v1/orcamentos/:id/pdf", async (req) => {
      const { s, pdf, data } = await proposalData(req);
      const issues = proposalIssues(data);
      if (issues.length) throw new HttpError(422, "incomplete", issues.join(" "));
      const file = await pdf.proposal(data, pdfLayout(req.query.get("layout")));
      log({ event: "proposal_pdf", by: s.claims.sub, budget: req.params["id"] });
      return pdfReply(file, documentFileName(data.number, data.client.name));
    })
    // Prévia do orçamento na tela (mesmo modelo do PDF); mostra também o que falta para o PDF.
    .add("POST", "/v1/orcamentos/:id/previa", async (req) => {
      const { pdf, data } = await proposalData(req);
      return json(200, {
        html: pdf.proposalPreview(data, pdfLayout(req.query.get("layout"))),
        issues: proposalIssues(data),
      });
    })
    .add("POST", "/v1/orcamentos/:id/contrato", async (req) => {
      const { s, pdf, data } = await proposalData(req);
      const issues = contractIssues(data);
      if (issues.length) throw new HttpError(422, "incomplete", issues.join(" "));
      const clauses = await deps.repo.contractClauses(s.claims);
      if (!clauses.length)
        throw new HttpError(
          422,
          "incomplete",
          "Cadastre as cláusulas do contrato em Configurações → Contrato.",
        );
      // Conta escolhida ao gerar (quadro "Dados bancários"); sem escolha, a conta C6 da JMG.
      const account_id = parse(
        contractSchema,
        (await req.body().catch(() => ({}))) ?? {},
      )?.account_id;
      const bank = account_id ? await deps.repo.bankAccount(s.claims, account_id) : COMPANY_ACCOUNT;
      if (!bank || !hasBankData(bank))
        throw new HttpError(
          422,
          "incomplete",
          "Escolha uma conta ativa com banco e conta ou chave PIX para o contrato.",
        );
      const file = await pdf.contract(
        data,
        today(),
        clauses,
        pdfLayout(req.query.get("layout")),
        bank,
      );
      log({ event: "contract_pdf", by: s.claims.sub, budget: req.params["id"] });
      return pdfReply(
        file,
        documentFileName(data.number.replace(/^ORC-/, "CT-"), data.client.name),
      );
    })
    .add("POST", "/v1/recebimentos/:id/recibo", async (req) => {
      const s = await session(req);
      if (!s.roles.includes("admin") && !s.roles.includes("financeiro")) {
        throw new HttpError(403, "forbidden", "Acesso restrito a administradores e financeiro");
      }
      if (!deps.pdf) throw new HttpError(503, "pdf_unavailable", "Geração de PDF indisponível");
      const id = req.params["id"] ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(id))
        throw new HttpError(404, "not_found", "Recebimento não encontrado");
      const input = await deps.repo.receiptInput(s.claims, id);
      if (!input)
        throw new HttpError(404, "not_found", "Recebimento de entrada da obra não encontrado");
      const extra = parse(receiptSchema, (await req.body().catch(() => ({}))) ?? {});
      const data = buildReceipt({ ...input, ...extra, today: today() });
      const file = await deps.pdf.receipt(data);
      log({ event: "receipt_pdf", by: s.claims.sub, settlement: id });
      return pdfReply(file, documentFileName(data.number, data.client.name));
    })
    .add("GET", "/v1/admin/export", async (req) => {
      const s = await admin(req);
      const tables = await deps.repo.exportTables();
      log({ event: "export", by: s.claims.sub });
      const stamp = new Date().toISOString().slice(0, 10);
      return {
        status: 200,
        body: { exported_at: new Date().toISOString(), tables },
        headers: { "content-disposition": `attachment; filename="jmg-backup-${stamp}.json"` },
      };
    });

  function corsHeaders(origin: string | undefined): Record<string, string> {
    const base: Record<string, string> = { vary: "origin", "x-content-type-options": "nosniff" };
    if (!origin || !deps.corsOrigins.includes(origin.replace(/\/+$/, ""))) return base;
    return {
      ...base,
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-max-age": "600",
      "access-control-expose-headers": "content-disposition",
    };
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const started = Date.now();
    const url = new URL(req.url ?? "/", "http://api");
    const headers = corsHeaders(req.headers.origin);
    const method = req.method ?? "GET";
    let status = 500;
    try {
      if (method === "OPTIONS") {
        status = 204;
        return send(res, { status }, headers);
      }
      const found = router.match(method, url.pathname);
      if (!found) throw new HttpError(404, "not_found", "Rota não encontrada");
      const reply = await found.handler({
        method,
        path: url.pathname,
        params: found.params,
        query: url.searchParams,
        headers: req.headers,
        body: () => readJson(req),
      });
      status = reply.status;
      send(res, reply, headers);
    } catch (error) {
      const known = error instanceof HttpError;
      status = known ? error.status : 500;
      if (!known) log({ level: "error", path: url.pathname, error: String(error) });
      send(
        res,
        json(status, {
          error: known ? error.code : "internal_error",
          message: known ? error.message : "Erro interno",
        }),
        headers,
      );
    } finally {
      if (url.pathname !== "/health") {
        log({ method, path: url.pathname, status, ms: Date.now() - started });
      }
    }
  };
}
