import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type Deps } from "../src/app.ts";
import type { AuthAdmin } from "../src/gotrue.ts";
import type { Repo, Role, UserSummary } from "../src/repo.ts";

export const SECRET = "segredo-de-teste-com-tamanho-suficiente";

export function token(claims: Record<string, unknown>, secret = SECRET) {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = enc({ alg: "HS256", typ: "JWT" });
  const body = enc({
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    aal: "aal1",
    ...claims,
  });
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function fakeRepo(seed: Record<string, Role[]> = {}, mfa: string[] = []) {
  const roles = new Map(Object.entries(seed));
  const repo: Repo & { roles: Map<string, Role[]> } = {
    roles,
    ping: async () => true,
    rolesOf: async (id) => roles.get(id) ?? [],
    hasVerifiedFactor: async (id) => mfa.includes(id),
    listUsers: async () =>
      [...roles.entries()].map(([id, r]): UserSummary => ({
        id,
        email: `${id}@jmg.test`,
        full_name: null,
        roles: r,
        mfa: mfa.includes(id),
        created_at: "2026-10-25T00:00:00Z",
        last_sign_in_at: null,
        invited_at: null,
        confirmed: true,
      })),
    setRoles: async (id, r) => void roles.set(id, r),
    countAdmins: async () => [...roles.values()].filter((r) => r.includes("admin")).length,
    exportTables: async () => ({ budgets: [{ id: "b1" }] }),
    proposalInput: async () => null,
    receiptInput: async () => null,
    contractClauses: async () => [{ title: "Objetivo", body: "{{N}}.1. Reforma." }],
    bankAccount: async () => null,
  };
  return repo;
}

export async function start(overrides: Partial<Deps> = {}) {
  const invites: string[] = [];
  const authAdmin: AuthAdmin = {
    invite: async (email) => {
      invites.push(email);
      return { id: `new-${invites.length}`, email };
    },
  };
  const deps: Deps = {
    jwtSecret: SECRET,
    siteUrl: "https://app.jmg.test",
    corsOrigins: ["https://app.jmg.test"],
    repo: fakeRepo(),
    authAdmin,
    log: () => {},
    ...overrides,
  };
  const server: Server = createServer((req, res) => void createApp(deps)(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const call = (path: string, init: RequestInit & { auth?: string } = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        ...(init.auth ? { authorization: `Bearer ${init.auth}` } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  return { call, invites, deps, close: () => new Promise((r) => server.close(r)) };
}
