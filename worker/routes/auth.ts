// Shop owner sign-up, log-in and log-out.
import {
  type ShopRow,
  createSession,
  destroySession,
  hashPassword,
  requireShop,
  verifyPassword,
} from "../auth";
import { HttpError, json, readJson } from "../http";
import { ulid } from "../ids";
import type { Router } from "../router";
import { changePasswordSchema, loginSchema, registerSchema } from "../validate";
import { toShopSettings } from "../views";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 10;

export function authRoutes(router: Router): void {
  router.post("/api/auth/register", async ({ env, req }) => {
    const body = await readJson(req, registerSchema);
    const taken = await env.DB.prepare("SELECT slug, email FROM shops WHERE slug = ? OR email = ?")
      .bind(body.slug, body.email)
      .first<{ slug: string; email: string }>();
    if (taken?.email === body.email) {
      throw new HttpError(409, "There's already a shop with this email. Log in instead.", "email_taken");
    }
    if (taken?.slug === body.slug) {
      throw new HttpError(409, "That shop link is taken. Try adding your street or town to it.", "slug_taken");
    }

    const id = ulid();
    await env.DB.prepare(
      `INSERT INTO shops (id, slug, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, body.slug, body.shopName, body.email, await hashPassword(body.password), Date.now())
      .run();

    const shop = await env.DB.prepare("SELECT * FROM shops WHERE id = ?").bind(id).first<ShopRow>();
    const cookie = await createSession(env, req, id);
    return json(toShopSettings(shop!), 201, { "set-cookie": cookie });
  });

  router.post("/api/auth/login", async ({ env, req }) => {
    const body = await readJson(req, loginSchema);
    const now = Date.now();
    const shop = await env.DB.prepare("SELECT * FROM shops WHERE email = ?").bind(body.email).first<ShopRow>();
    const wrong = new HttpError(401, "The email or password is wrong.", "bad_login");
    if (!shop) throw wrong;

    if (shop.locked_until > now) {
      const minutes = Math.ceil((shop.locked_until - now) / 60000);
      throw new HttpError(
        429,
        `Too many wrong passwords. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        "locked",
      );
    }

    if (!(await verifyPassword(body.password, shop.password_hash))) {
      const failed = shop.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await env.DB.prepare("UPDATE shops SET failed_logins = ?, locked_until = ? WHERE id = ?")
        .bind(lock ? 0 : failed, lock ? now + LOCK_MINUTES * 60000 : 0, shop.id)
        .run();
      throw wrong;
    }

    const cookie = await createSession(env, req, shop.id);
    await env.DB.batch([
      env.DB.prepare("UPDATE shops SET failed_logins = 0, locked_until = 0 WHERE id = ?").bind(shop.id),
      env.DB.prepare("DELETE FROM sessions WHERE shop_id = ? AND expires_at < ?").bind(shop.id, now),
    ]);
    return json(toShopSettings(shop), 200, { "set-cookie": cookie });
  });

  router.post("/api/auth/logout", async ({ env, req }) => {
    return json({ ok: true }, 200, { "set-cookie": await destroySession(env, req) });
  });

  router.post("/api/admin/password", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const body = await readJson(req, changePasswordSchema);
    if (!(await verifyPassword(body.currentPassword, shop.password_hash))) {
      throw new HttpError(400, "Your current password is wrong.", "bad_password");
    }
    await env.DB.prepare("UPDATE shops SET password_hash = ? WHERE id = ?")
      .bind(await hashPassword(body.newPassword), shop.id)
      .run();
    return json({ ok: true });
  });
}
