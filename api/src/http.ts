import type { IncomingMessage, ServerResponse } from "node:http";

// Roteador mínimo sobre node:http (sem framework): rotas com parâmetros, JSON e erros padronizados.

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type Request = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  headers: IncomingMessage["headers"];
  body: () => Promise<unknown>;
};

export type Reply = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type Handler = (req: Request) => Promise<Reply> | Reply;

type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      "^" +
        path.replace(/\/:(\w+)/g, (_, key: string) => {
          keys.push(key);
          return "/([^/]+)";
        }) +
        "/?$",
    );
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }

  match(method: string, path: string) {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      try {
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? "")));
      } catch {
        throw new HttpError(400, "bad_request", "Endereço inválido");
      }
      return { handler: route.handler, params };
    }
    if (pathMatched) throw new HttpError(405, "method_not_allowed", "Método não permitido");
    return null;
  }
}

const MAX_BODY = 1024 * 1024;

export function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "payload_too_large", "Corpo da requisição muito grande"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "invalid_json", "JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

export function send(res: ServerResponse, reply: Reply, extraHeaders: Record<string, string>) {
  const headers: Record<string, string> = { ...extraHeaders, ...reply.headers };
  let payload: string | Buffer | undefined;
  if (reply.body !== undefined) {
    if (typeof reply.body === "string" || Buffer.isBuffer(reply.body)) {
      payload = reply.body;
    } else {
      payload = JSON.stringify(reply.body);
      headers["content-type"] ??= "application/json; charset=utf-8";
    }
  }
  res.writeHead(reply.status, headers);
  res.end(payload);
}

export const json = (status: number, body: unknown): Reply => ({ status, body });
