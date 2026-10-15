// Cloudflare Worker entry. Only /api/* reaches this code (see wrangler.jsonc);
// the React app's files are served by Cloudflare directly, free and unlimited.
import type { Env } from "./env";
import { HttpError, assertSameOrigin, json } from "./http";
import { Router } from "./router";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { cardRoutes } from "./routes/card";
import { reportRoutes } from "./routes/reports";
import { superRoutes } from "./routes/super";

const router = new Router();
cardRoutes(router);
authRoutes(router);
adminRoutes(router);
reportRoutes(router);
superRoutes(router);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      assertSameOrigin(req);
      const res = await router.handle(req, env);
      return res ?? json({ error: "Not found." }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
      console.error(err);
      const message = String(err);
      // D1 refuses queries once the free daily limit is used up; it resets at 00:00 UTC (8 AM Manila).
      if (/limit|exceeded|quota/i.test(message)) {
        return json(
          { error: "The app reached its free daily limit. Stamps work again after 8:00 AM.", code: "daily_limit" },
          503,
        );
      }
      return json({ error: "Something went wrong on our side. Try again in a moment.", code: "server_error" }, 500);
    }
  },
};
