// Barista admin: shop settings, menu, customers.
import type { AdminCustomer } from "../../shared/types";
import { type ShopRow, hashPassword, requireShop } from "../auth";
import { HttpError, json, readJson } from "../http";
import { normalizeCode, ulid } from "../ids";
import type { Router } from "../router";
import {
  adjustSchema,
  blockSchema,
  menuItemPatchSchema,
  menuItemSchema,
  reorderSchema,
  setPinSchema,
  shopSettingsSchema,
} from "../validate";
import { type CardRow, type MenuRow, toAdminMenuItem, toShopSettings } from "../views";

const ADMIN_MENU_SQL = `SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items
  WHERE shop_id = ? AND is_archived = 0 ORDER BY sort_order, created_at`;

const toCustomer = (c: CardRow): AdminCustomer => ({
  id: c.id,
  code: c.code,
  nickname: c.nickname,
  stamps: c.stamps,
  lifetimeStamps: c.lifetime_stamps,
  rewardsRedeemed: c.rewards_redeemed,
  isBlocked: c.is_blocked === 1,
  lastVisitAt: c.last_visit_at,
  createdAt: c.created_at,
});

export function adminRoutes(router: Router): void {
  router.get("/api/admin/me", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    return json(toShopSettings(shop));
  });

  router.patch("/api/admin/shop", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const patch = await readJson(req, shopSettingsSchema);
    const next: ShopRow = {
      ...shop,
      name: patch.name ?? shop.name,
      reward_text: patch.rewardText ?? shop.reward_text,
      stamps_required: patch.stampsRequired ?? shop.stamps_required,
      stamp_mode: patch.stampMode ?? shop.stamp_mode,
      cooldown_minutes: patch.cooldownMinutes ?? shop.cooldown_minutes,
      max_stamps_per_day: patch.maxStampsPerDay ?? shop.max_stamps_per_day,
      open_time: patch.openTime === undefined ? shop.open_time : patch.openTime,
      close_time: patch.closeTime === undefined ? shop.close_time : patch.closeTime,
      require_pin: patch.requirePin === undefined ? shop.require_pin : patch.requirePin ? 1 : 0,
    };
    if (next.require_pin && !shop.pin_hash) {
      throw new HttpError(400, "Set a PIN first, then turn this on.", "no_pin");
    }
    if ((next.open_time === null) !== (next.close_time === null)) {
      throw new HttpError(400, "Set both opening and closing time, or leave both empty.");
    }
    if (next.open_time && next.open_time === next.close_time) {
      throw new HttpError(400, "Opening and closing time can't be the same.");
    }
    await env.DB.prepare(
      `UPDATE shops SET name = ?, reward_text = ?, stamps_required = ?, stamp_mode = ?, cooldown_minutes = ?,
         max_stamps_per_day = ?, open_time = ?, close_time = ?, require_pin = ? WHERE id = ?`,
    )
      .bind(
        next.name,
        next.reward_text,
        next.stamps_required,
        next.stamp_mode,
        next.cooldown_minutes,
        next.max_stamps_per_day,
        next.open_time,
        next.close_time,
        next.require_pin,
        shop.id,
      )
      .run();
    return json(toShopSettings(next));
  });

  // Sets or changes the barista PIN. Saving a PIN also turns on "ask for the PIN".
  router.post("/api/admin/pin", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const { pin } = await readJson(req, setPinSchema);
    const pinHash = await hashPassword(pin);
    await env.DB.prepare(
      "UPDATE shops SET pin_hash = ?, require_pin = 1, pin_fail_count = 0, pin_fail_window_start = 0 WHERE id = ?",
    )
      .bind(pinHash, shop.id)
      .run();
    return json(toShopSettings({ ...shop, pin_hash: pinHash, require_pin: 1 }));
  });

  // ---- Menu ----

  router.get("/api/admin/menu", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const rows = await env.DB.prepare(ADMIN_MENU_SQL).bind(shop.id).all<MenuRow>();
    return json(rows.results.map(toAdminMenuItem));
  });

  router.post("/api/admin/menu", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const body = await readJson(req, menuItemSchema);
    const id = ulid();
    await env.DB.prepare(
      `INSERT INTO menu_items (id, shop_id, name, price_cents, earns_stamp, is_available, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?,
         (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM menu_items WHERE shop_id = ?), ?)`,
    )
      .bind(id, shop.id, body.name, body.price, body.earnsStamp ? 1 : 0, body.isAvailable ? 1 : 0, shop.id, Date.now())
      .run();
    const row = await env.DB.prepare(
      "SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items WHERE id = ?",
    )
      .bind(id)
      .first<MenuRow>();
    return json(toAdminMenuItem(row!), 201);
  });

  router.patch("/api/admin/menu/:id", async ({ env, req, params }) => {
    const shop = await requireShop(env, req);
    const patch = await readJson(req, menuItemPatchSchema);
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) (sets.push("name = ?"), values.push(patch.name));
    if (patch.price !== undefined) (sets.push("price_cents = ?"), values.push(patch.price));
    if (patch.earnsStamp !== undefined) (sets.push("earns_stamp = ?"), values.push(patch.earnsStamp ? 1 : 0));
    if (patch.isAvailable !== undefined) (sets.push("is_available = ?"), values.push(patch.isAvailable ? 1 : 0));
    if (sets.length === 0) throw new HttpError(400, "Nothing to change.");

    const res = await env.DB.prepare(
      `UPDATE menu_items SET ${sets.join(", ")} WHERE id = ? AND shop_id = ? AND is_archived = 0`,
    )
      .bind(...values, params.id, shop.id)
      .run();
    if (res.meta.changes === 0) throw new HttpError(404, "That menu item was removed.");
    const row = await env.DB.prepare(
      "SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items WHERE id = ?",
    )
      .bind(params.id)
      .first<MenuRow>();
    return json(toAdminMenuItem(row!));
  });

  // Removing keeps the row (archived) so old orders still link to it.
  router.delete("/api/admin/menu/:id", async ({ env, req, params }) => {
    const shop = await requireShop(env, req);
    await env.DB.prepare("UPDATE menu_items SET is_archived = 1 WHERE id = ? AND shop_id = ?")
      .bind(params.id, shop.id)
      .run();
    return json({ ok: true });
  });

  router.post("/api/admin/menu/reorder", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const { ids } = await readJson(req, reorderSchema);
    await env.DB.batch(
      ids.map((id, i) =>
        env.DB.prepare("UPDATE menu_items SET sort_order = ? WHERE id = ? AND shop_id = ?").bind(i, id, shop.id),
      ),
    );
    const rows = await env.DB.prepare(ADMIN_MENU_SQL).bind(shop.id).all<MenuRow>();
    return json(rows.results.map(toAdminMenuItem));
  });

  // ---- Customers ----

  router.get("/api/admin/customers", async ({ env, req, url }) => {
    const shop = await requireShop(env, req);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
    let rows;
    if (q) {
      const code = normalizeCode(q.replace(/^#/, ""));
      rows = await env.DB.prepare(
        `SELECT * FROM cards WHERE shop_id = ? AND (code LIKE ? OR nickname LIKE ? COLLATE NOCASE)
         ORDER BY last_visit_at DESC LIMIT 50`,
      )
        .bind(shop.id, code ? `${code}%` : "\u0000", `%${q.replace(/[%_]/g, "")}%`)
        .all<CardRow>();
    } else {
      rows = await env.DB.prepare(
        `SELECT * FROM cards WHERE shop_id = ? AND last_visit_at IS NOT NULL
         ORDER BY last_visit_at DESC LIMIT 50`,
      )
        .bind(shop.id)
        .all<CardRow>();
    }
    return json(rows.results.map(toCustomer));
  });

  router.post("/api/admin/customers/:id/adjust", async ({ env, req, params }) => {
    const shop = await requireShop(env, req);
    const { delta, note } = await readJson(req, adjustSchema);
    const now = Date.now();
    const [, update] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO stamp_adjustments (id, shop_id, card_id, delta, note, created_at)
         SELECT ?, ?, id, ?, ?, ? FROM cards WHERE id = ? AND shop_id = ?`,
      ).bind(ulid(now), shop.id, delta, note || null, now, params.id, shop.id),
      env.DB.prepare(
        `UPDATE cards SET stamps = MAX(0, stamps + ?1), lifetime_stamps = lifetime_stamps + MAX(0, ?1)
         WHERE id = ?2 AND shop_id = ?3`,
      ).bind(delta, params.id, shop.id),
    ]);
    if (update.meta.changes === 0) throw new HttpError(404, "Customer not found.");
    const card = await env.DB.prepare("SELECT * FROM cards WHERE id = ?").bind(params.id).first<CardRow>();
    return json(toCustomer(card!));
  });

  router.post("/api/admin/customers/:id/block", async ({ env, req, params }) => {
    const shop = await requireShop(env, req);
    const { blocked } = await readJson(req, blockSchema);
    const res = await env.DB.prepare("UPDATE cards SET is_blocked = ? WHERE id = ? AND shop_id = ?")
      .bind(blocked ? 1 : 0, params.id, shop.id)
      .run();
    if (res.meta.changes === 0) throw new HttpError(404, "Customer not found.");
    const card = await env.DB.prepare("SELECT * FROM cards WHERE id = ?").bind(params.id).first<CardRow>();
    return json(toCustomer(card!));
  });
}
