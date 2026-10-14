import type { Env } from "./env";

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
}

export type Handler = (ctx: Ctx) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

/** A small path router: `/api/shops/:slug` style patterns, no dependencies. */
export class Router {
  private routes: Route[] = [];

  on(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const source = path
      .split("/")
      .map((segment) => {
        if (segment.startsWith(":")) {
          keys.push(segment.slice(1));
          return "([^/]+)";
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    this.routes.push({ method, pattern: new RegExp(`^${source}/?$`), keys, handler });
    return this;
  }

  get(path: string, handler: Handler) {
    return this.on("GET", path, handler);
  }
  post(path: string, handler: Handler) {
    return this.on("POST", path, handler);
  }
  patch(path: string, handler: Handler) {
    return this.on("PATCH", path, handler);
  }
  delete(path: string, handler: Handler) {
    return this.on("DELETE", path, handler);
  }

  /** Returns null when no route matches the path. */
  async handle(req: Request, env: Env): Promise<Response | null> {
    const url = new URL(req.url);
    let pathMatched = false;
    for (const route of this.routes) {
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => (params[key] = decodeURIComponent(match[i + 1])));
      return route.handler({ req, env, url, params });
    }
    if (pathMatched) {
      return new Response(JSON.stringify({ error: "Method not allowed." }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }
    return null;
  }
}
