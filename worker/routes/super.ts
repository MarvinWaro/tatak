// Super admin (the Tatak owner only): log in, then every shop and every transaction, read-only.
// Accounts live in super_admins and are made with `npm run superadmin`; there is no sign-up route.
import {
  PLATFORM_TIMEZONE,
  SUPER_RECENT_DAYS,
  type SuperOrder,
  type SuperOrderPage,
  type SuperShop,
} from "../../shared/types";
import { createSuperSession, destroySuperSession, requireSuperAdmin, verifyPassword } from "../auth";
import { HttpError, json, readJson } from "../http";
import type { Router } from "../router";
import { addDays, localDate, localMidnight } from "../time";
import { loginSchema, shopIdSchema } from "../validate";
import { type OrderItemRow, type OrderRow, readRange, toAdminOrders } from "./reports";

const PAGE_SIZE = 100;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 10;
// Checked when the email doesn't exist, so a wrong email takes as long as a wrong password
// and the response time doesn't reveal which emails are super admins.
const DUMMY_HASH = "pbkdf2-sha256$20000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

interface ShopListRow {
  id: string;
  slug: string;
  name: string;
  email: string;
  created_at: number;
  customers: number;
  menu_items: number;
  last_order_at: number | null;
  recent_paid_orders: number;
  recent_sales: number;
}

export function superRoutes(router: Router): void {
  router.post("/api/super/auth/login", async ({ env, req }) => {
    const body = await readJson(req, loginSchema);
    const now = Date.now();
    const admin = await env.DB.prepare(
      "SELECT id, password_hash, failed_logins, locked_until FROM super_admins WHERE email = ?",
    )
      .bind(body.email)
      .first<{ id: string; password_hash: string; failed_logins: number; locked_until: number }>();
    const wrong = new HttpError(401, "The email or password is wrong.", "bad_login");
    if (!admin) {
      await verifyPassword(body.password, DUMMY_HASH);
      throw wrong;
    }

    if (admin.locked_until > now) {
      const minutes = Math.ceil((admin.locked_until - now) / 60000);
      throw new HttpError(
        429,
        `Too many wrong passwords. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        "locked",
      );
    }

    if (!(await verifyPassword(body.password, admin.password_hash))) {
      const failed = admin.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await env.DB.prepare("UPDATE super_admins SET failed_logins = ?, locked_until = ? WHERE id = ?")
        .bind(lock ? 0 : failed, lock ? now + LOCK_MINUTES * 60000 : 0, admin.id)
        .run();
      throw wrong;
    }

    const cookie = await createSuperSession(env, req, admin.id);
    await env.DB.batch([
      env.DB.prepare("UPDATE super_admins SET failed_logins = 0, locked_until = 0 WHERE id = ?").bind(admin.id),
      env.DB.prepare("DELETE FROM super_sessions WHERE super_admin_id = ? AND expires_at < ?").bind(admin.id, now),
    ]);
    return json({ ok: true }, 200, { "set-cookie": cookie });
  });

  router.post("/api/super/auth/logout", async ({ env, req }) => {
    return json({ ok: true }, 200, { "set-cookie": await destroySuperSession(env, req) });
  });

  // All shops, newest first, with a few numbers to see who is actually using Tatak.
  router.get("/api/super/shops", async ({ env, req }) => {
    await requireSuperAdmin(env, req);
    const today = localDate(Date.now(), PLATFORM_TIMEZONE);
    const since = localMidnight(addDays(today, 1 - SUPER_RECENT_DAYS), PLATFORM_TIMEZONE);
    const rows = await env.DB.prepare(
      `SELECT s.id, s.slug, s.name, s.email, s.created_at,
              (SELECT COUNT(*) FROM cards WHERE cards.shop_id = s.id) AS customers,
              (SELECT COUNT(*) FROM menu_items WHERE menu_items.shop_id = s.id AND menu_items.is_archived = 0) AS menu_items,
              (SELECT MAX(created_at) FROM orders WHERE orders.shop_id = s.id) AS last_order_at,
              COALESCE(SUM(CASE WHEN o.is_reward = 0 THEN 1 ELSE 0 END), 0) AS recent_paid_orders,
              COALESCE(SUM(o.total_cents), 0) AS recent_sales
       FROM shops s
       LEFT JOIN orders o ON o.shop_id = s.id AND o.status = 'approved' AND o.created_at >= ?
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
    )
      .bind(since)
      .all<ShopListRow>();

    const shops: SuperShop[] = rows.results.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      email: s.email,
      createdAt: s.created_at,
      customers: s.customers,
      menuItems: s.menu_items,
      lastOrderAt: s.last_order_at,
      recentPaidOrders: s.recent_paid_orders,
      recentSalesCents: s.recent_sales,
    }));
    return json(shops);
  });

  // Transactions across all shops (or one shop with ?shop=<id>), newest first, 100 per page.
  router.get("/api/super/orders", async ({ env, req, url }) => {
    await requireSuperAdmin(env, req);
    const r = readRange(url, PLATFORM_TIMEZONE);
    const shopParam = url.searchParams.get("shop");
    if (shopParam !== null && !shopIdSchema.safeParse(shopParam).success) {
      throw new HttpError(400, "That shop ID isn't valid. Pick the shop from the list again.");
    }
    const end = Math.min(Number(url.searchParams.get("before")) || r.end, r.end);
    const shopFilter = shopParam ? "AND o.shop_id = ?" : "";
    const binds = shopParam ? [r.start, end, shopParam] : [r.start, end];

    const [orders, items] = await env.DB.batch([
      env.DB.prepare(
        `SELECT o.id, o.created_at, o.status, o.is_reward, o.total_cents, o.discount_cents, o.promo_step,
                o.item_count, o.stamps_awarded, o.stamps_used, o.approved_via, o.card_id, c.code, c.nickname,
                o.shop_id, s.name AS shop_name, s.slug AS shop_slug
         FROM orders o JOIN cards c ON c.id = o.card_id JOIN shops s ON s.id = o.shop_id
         WHERE o.created_at >= ? AND o.created_at < ? ${shopFilter}
         ORDER BY o.created_at DESC LIMIT ${PAGE_SIZE}`,
      ).bind(...binds),
      env.DB.prepare(
        `SELECT order_id, name, qty, price_cents FROM order_items WHERE order_id IN
           (SELECT o.id FROM orders o WHERE o.created_at >= ? AND o.created_at < ? ${shopFilter}
            ORDER BY o.created_at DESC LIMIT ${PAGE_SIZE})`,
      ).bind(...binds),
    ]);

    const rows = orders.results as (OrderRow & { shop_id: string; shop_name: string; shop_slug: string })[];
    const list: SuperOrder[] = toAdminOrders(rows, items.results as OrderItemRow[]).map((o, i) => ({
      ...o,
      shop: { id: rows[i].shop_id, name: rows[i].shop_name, slug: rows[i].shop_slug },
    }));
    const nextBefore = rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null;
    return json({ orders: list, nextBefore } satisfies SuperOrderPage);
  });
}
