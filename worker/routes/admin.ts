// Barista admin: shop settings, menu, customers.
import type { AdminCustomer, CustomerPromos, Promo } from "../../shared/types";
import { type ShopRow, hashPassword, requireShop } from "../auth";
import type { Env } from "../env";
import { HttpError, json, readJson } from "../http";
import { normalizeCode, ulid } from "../ids";
import {
  assertReachesFreeBox,
  countStampItems,
  priceOrder,
  promoStatements,
  requireReadyPromo,
  saveOrder,
} from "../orders";
import type { Router } from "../router";
import {
  adjustSchema,
  adminOrderSchema,
  blockSchema,
  logoSchema,
  menuItemPatchSchema,
  menuItemSchema,
  promosSchema,
  reorderSchema,
  setPinSchema,
  shopSettingsSchema,
} from "../validate";
import {
  type CardRow,
  type MenuRow,
  type PromoRow,
  PROMOS_SQL,
  toAdminMenuItem,
  toPromo,
  toShopSettings,
} from "../views";

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

async function requireShopCard(env: Env, shopId: string, cardId: string): Promise<CardRow> {
  const card = await env.DB.prepare("SELECT * FROM cards WHERE id = ? AND shop_id = ?").bind(cardId, shopId).first<CardRow>();
  if (!card) throw new HttpError(404, "Customer not found.");
  return card;
}

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
      card_color: patch.cardColor ?? shop.card_color,
      ink_color: patch.inkColor ?? shop.ink_color,
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
    if (next.stamps_required < shop.stamps_required) {
      const last = await env.DB.prepare("SELECT MAX(step) AS step FROM card_promos WHERE shop_id = ?")
        .bind(shop.id)
        .first<{ step: number | null }>();
      if (last?.step != null && last.step >= next.stamps_required) {
        throw new HttpError(
          400,
          `Stamp ${last.step} has a promo. Move or remove that promo first, then use fewer stamps.`,
          "promo_in_the_way",
        );
      }
    }
    await env.DB.prepare(
      `UPDATE shops SET name = ?, reward_text = ?, stamps_required = ?, stamp_mode = ?, cooldown_minutes = ?,
         max_stamps_per_day = ?, open_time = ?, close_time = ?, require_pin = ?, card_color = ?, ink_color = ?
       WHERE id = ?`,
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
        next.card_color,
        next.ink_color,
        shop.id,
      )
      .run();
    return json(toShopSettings(next));
  });

  // Uploads the shop logo. The browser resizes it first, so it arrives small.
  router.post("/api/admin/logo", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const { dataUrl } = await readJson(req, logoSchema);
    const [, mime, data] = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl)!;
    const version = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO shop_logos (shop_id, mime, data, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (shop_id) DO UPDATE SET mime = ?2, data = ?3, updated_at = ?4`,
      ).bind(shop.id, mime, data, version),
      env.DB.prepare("UPDATE shops SET logo_version = ? WHERE id = ?").bind(version, shop.id),
    ]);
    return json(toShopSettings({ ...shop, logo_version: version }));
  });

  router.delete("/api/admin/logo", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM shop_logos WHERE shop_id = ?").bind(shop.id),
      env.DB.prepare("UPDATE shops SET logo_version = 0 WHERE id = ?").bind(shop.id),
    ]);
    return json(toShopSettings({ ...shop, logo_version: 0 }));
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

  // ---- Promos on the card ----

  router.get("/api/admin/promos", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const rows = await env.DB.prepare(PROMOS_SQL).bind(shop.id).all<PromoRow>();
    return json(rows.results.map(toPromo));
  });

  // Replaces all of the shop's promos at once. Orders keep their promo step, so old reports don't change.
  router.post("/api/admin/promos", async ({ env, req }) => {
    const shop = await requireShop(env, req);
    const { promos } = await readJson(req, promosSchema);
    const last = shop.stamps_required - 1;
    const outside = promos.find((p) => p.step > last);
    if (outside) {
      throw new HttpError(400, `The card has ${shop.stamps_required} stamps. Put promos on stamps 1 to ${last}.`);
    }
    const sorted = [...promos].sort((a, b) => a.step - b.step);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM card_promos WHERE shop_id = ?").bind(shop.id),
      ...sorted.map((p) =>
        env.DB.prepare("INSERT INTO card_promos (shop_id, step, percent_off, label) VALUES (?, ?, ?, ?)").bind(
          shop.id,
          p.step,
          p.percentOff,
          p.label,
        ),
      ),
    ]);
    return json(sorted satisfies Promo[]);
  });

  // ---- Customers ----

  // The shop's promos and which ones this customer used this round, for "Record a purchase".
  // The page works out which promo the purchase reaches; the server checks it again when saving.
  router.get("/api/admin/customers/:id/promos", async ({ env, req, params }) => {
    const shop = await requireShop(env, req);
    const card = await requireShopCard(env, shop.id, params.id);
    const [promos, used] = await env.DB.batch(promoStatements(env.DB, shop.id, card));
    return json({
      stamps: card.stamps,
      promos: (promos.results as PromoRow[]).map(toPromo),
      used: (used.results as { promo_step: number }[]).map((r) => r.promo_step),
    } satisfies CustomerPromos);
  });

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

  // Records a real purchase for a customer from the barista's own phone. It counts in sales,
  // adds stamps by the shop's rules, and skips the customer-side limits (wait time, daily
  // limit, opening hours) because the barista is entering it himself.
  router.post("/api/admin/customers/:id/orders", async ({ env, req, params }) => {
    const shop = await requireShop(env, req);
    const body = await readJson(req, adminOrderSchema);
    const now = Date.now();
    const at = body.at ?? now;
    if (at > now + 5 * 60000) throw new HttpError(400, "The purchase time can't be in the future.");
    if (at < now - 90 * 86400000) {
      throw new HttpError(400, "That's more than 90 days ago. Use \"Add stamps only\" for old purchases.");
    }

    const card = await requireShopCard(env, shop.id, params.id);

    const qtyById = new Map<string, number>();
    for (const line of body.items) qtyById.set(line.id, (qtyById.get(line.id) ?? 0) + line.qty);
    const ids = [...qtyById.keys()];
    const [menuRes, promosRes, usedRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items
         WHERE shop_id = ? AND is_archived = 0 AND id IN (${ids.map(() => "?").join(",")})`,
      ).bind(shop.id, ...ids),
      ...(body.promo ? promoStatements(env.DB, shop.id, card) : []),
    ]);
    const menu = menuRes.results as MenuRow[];
    if (menu.length !== ids.length) throw new HttpError(409, "Something in this purchase was removed from the menu.");

    const stampItems = countStampItems(menu, qtyById);
    const stamps = shop.stamp_mode === "per_cup" ? stampItems : stampItems > 0 ? 1 : 0;
    const stampsAfter = card.stamps + stamps;
    const promo = body.promo ? requireReadyPromo(promosRes, usedRes, stampsAfter) : null;
    if (body.reward) assertReachesFreeBox(stampsAfter, shop.stamps_required);
    const priced = priceOrder(menu, qtyById, {
      promo,
      promoItemId: body.promo?.itemId,
      freeItemId: body.reward?.itemId,
      stampsBefore: card.stamps,
    });

    await saveOrder(env.DB, {
      orderId: ulid(at),
      shopId: shop.id,
      card,
      approvedVia: "admin",
      priced,
      stampsAdded: stamps,
      promo,
      stampsUsed: body.reward ? shop.stamps_required : 0,
      at,
    });

    const updated = await env.DB.prepare("SELECT * FROM cards WHERE id = ?").bind(card.id).first<CardRow>();
    return json({ customer: toCustomer(updated!), stampsAdded: stamps, totalCents: priced.totalCents }, 201);
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
