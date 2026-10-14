// Customer-facing routes: open a shop, create or restore a card, order, and redeem.
import type { CardCreated, OrderResult } from "../../shared/types";
import { type ShopRow, verifyPassword } from "../auth";
import type { D1Database, Env } from "../env";
import { HttpError, json, readJson } from "../http";
import { normalizeCode, randomCode, sha256Hex, ulid } from "../ids";
import type { Router } from "../router";
import {
  formatHHMM,
  formatTime,
  localMinuteOfDay,
  parseHHMM,
  startOfLocalDay,
} from "../time";
import {
  createCardSchema,
  orderSchema,
  redeemSchema,
  restoreCardSchema,
  updateCardSchema,
} from "../validate";
import { type CardRow, type MenuRow, MENU_SQL, loadCardView, toPublicShop } from "../views";

const CARD_HEADER = "x-card-token";
// Wrong-PIN limits. A 4-digit PIN has only 10,000 combinations, so guessing must be slow.
const CARD_PIN_TRIES = 5; // wrong PINs on one card before it is locked
const CARD_PIN_LOCK_MINUTES = 15;
const SHOP_PIN_TRIES = 10; // wrong PINs across the whole shop before PIN stamping pauses
const SHOP_PIN_WINDOW_MINUTES = 10;
const BACKUP_CODE_LENGTH = 16; // 80 random bits
const CARD_CODE_LENGTH = 6;

async function findShopBySlug(db: D1Database, slug: string): Promise<ShopRow> {
  const shop = await db.prepare("SELECT * FROM shops WHERE slug = ?").bind(slug.toLowerCase()).first<ShopRow>();
  if (!shop) throw new HttpError(404, "We couldn't find this shop. Check the link or scan the QR code again.");
  return shop;
}

/** The customer's card, identified by the backup code their browser keeps. */
async function requireCard(env: Env, req: Request): Promise<{ card: CardRow; shop: ShopRow }> {
  const token = req.headers.get(CARD_HEADER);
  if (!token) throw new HttpError(401, "This phone doesn't have a card yet.", "no_card");
  const row = await env.DB.prepare(
    `SELECT cards.id AS card_id, cards.code, cards.nickname, cards.stamps, cards.lifetime_stamps,
            cards.rewards_redeemed, cards.is_blocked, cards.last_visit_at, cards.pin_failures, cards.pin_locked_until,
            cards.created_at AS card_created_at, shops.*
     FROM cards JOIN shops ON shops.id = cards.shop_id WHERE cards.secret_hash = ?`,
  )
    .bind(await sha256Hex(normalizeCode(token)))
    .first<ShopRow & Omit<CardRow, "id" | "shop_id" | "created_at"> & { card_id: string; card_created_at: number }>();
  if (!row) throw new HttpError(401, "We couldn't find this card. Restore it with your backup code.", "no_card");
  const card: CardRow = {
    id: row.card_id,
    shop_id: row.id,
    code: row.code,
    nickname: row.nickname,
    stamps: row.stamps,
    lifetime_stamps: row.lifetime_stamps,
    rewards_redeemed: row.rewards_redeemed,
    is_blocked: row.is_blocked,
    last_visit_at: row.last_visit_at,
    pin_failures: row.pin_failures,
    pin_locked_until: row.pin_locked_until,
    created_at: row.card_created_at,
  };
  return { card, shop: row };
}

function assertCanStamp(shop: ShopRow, card: CardRow, now: number): void {
  if (card.is_blocked) {
    throw new HttpError(403, "This card is paused. Please talk to the barista.", "card_blocked");
  }
  if (shop.open_time && shop.close_time) {
    const minute = localMinuteOfDay(now, shop.timezone);
    const open = parseHHMM(shop.open_time);
    const close = parseHHMM(shop.close_time);
    const isOpen = open <= close ? minute >= open && minute < close : minute >= open || minute < close;
    if (!isOpen) {
      throw new HttpError(
        409,
        `${shop.name} is closed now. Stamps work from ${formatHHMM(shop.open_time)} to ${formatHHMM(shop.close_time)}.`,
        "shop_closed",
      );
    }
  }
}

/**
 * When the shop requires a PIN, checks the barista's PIN and returns "pin"; otherwise returns "tap".
 * Wrong PINs are counted per card and per shop, and lock further tries for a while.
 */
async function checkBaristaPin(
  db: D1Database,
  shop: ShopRow,
  card: CardRow,
  pin: string | undefined,
  now: number,
): Promise<"tap" | "pin"> {
  if (!shop.require_pin || !shop.pin_hash) return "tap";

  if (card.pin_locked_until > now) {
    throw new HttpError(
      429,
      `Too many wrong PINs on this card. Try again at ${formatTime(card.pin_locked_until, shop.timezone)}.`,
      "pin_locked",
    );
  }
  const windowEnd = shop.pin_fail_window_start + SHOP_PIN_WINDOW_MINUTES * 60000;
  const windowActive = now < windowEnd;
  if (windowActive && shop.pin_fail_count >= SHOP_PIN_TRIES) {
    throw new HttpError(
      429,
      `Too many wrong PINs at ${shop.name}. PIN stamping is paused until ${formatTime(windowEnd, shop.timezone)}.`,
      "pin_locked",
    );
  }
  if (!pin) throw new HttpError(400, "Barista: enter your PIN.", "pin_required");

  if (await verifyPassword(pin, shop.pin_hash)) {
    if (card.pin_failures > 0) {
      await db.prepare("UPDATE cards SET pin_failures = 0 WHERE id = ?").bind(card.id).run();
    }
    return "pin";
  }

  const failures = card.pin_failures + 1;
  const lock = failures >= CARD_PIN_TRIES;
  await db.batch([
    db
      .prepare("UPDATE cards SET pin_failures = ?, pin_locked_until = ? WHERE id = ?")
      .bind(lock ? 0 : failures, lock ? now + CARD_PIN_LOCK_MINUTES * 60000 : 0, card.id),
    windowActive
      ? db.prepare("UPDATE shops SET pin_fail_count = pin_fail_count + 1 WHERE id = ?").bind(shop.id)
      : db.prepare("UPDATE shops SET pin_fail_count = 1, pin_fail_window_start = ? WHERE id = ?").bind(now, shop.id),
  ]);
  if (lock) {
    throw new HttpError(429, `Wrong PIN. This card is locked for ${CARD_PIN_LOCK_MINUTES} minutes.`, "pin_locked");
  }
  const left = CARD_PIN_TRIES - failures;
  throw new HttpError(403, `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.`, "wrong_pin");
}

async function getCardRow(db: D1Database, id: string): Promise<CardRow> {
  const card = await db.prepare("SELECT * FROM cards WHERE id = ?").bind(id).first<CardRow>();
  if (!card) throw new HttpError(404, "Card not found.");
  return card;
}

export function cardRoutes(router: Router): void {
  // Shop info and menu, shown before the customer has a card.
  router.get("/api/shops/:slug", async ({ env, params }) => {
    const shop = await findShopBySlug(env.DB, params.slug);
    const menu = await env.DB.prepare(MENU_SQL).bind(shop.id).all<MenuRow>();
    return json(toPublicShop(shop, menu.results));
  });

  // The shop logo. The URL carries a version number, so browsers can keep it for a year.
  router.get("/api/shops/:slug/logo", async ({ env, params }) => {
    const logo = await env.DB.prepare(
      `SELECT shop_logos.mime, shop_logos.data FROM shop_logos
       JOIN shops ON shops.id = shop_logos.shop_id WHERE shops.slug = ?`,
    )
      .bind(params.slug.toLowerCase())
      .first<{ mime: string; data: string }>();
    if (!logo) return new Response("Not found", { status: 404 });
    const bin = atob(logo.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, {
      headers: {
        "content-type": logo.mime,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  });

  router.post("/api/shops/:slug/cards", async ({ env, req, params }) => {
    const shop = await findShopBySlug(env.DB, params.slug);
    const { nickname } = await readJson(req, createCardSchema);
    const backupCode = randomCode(BACKUP_CODE_LENGTH);
    const now = Date.now();
    const id = ulid(now);
    const secretHash = await sha256Hex(backupCode);

    // The short card code must be unique within the shop; retry on the rare collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await env.DB.prepare(
          `INSERT INTO cards (id, shop_id, code, secret_hash, nickname, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, shop.id, randomCode(CARD_CODE_LENGTH), secretHash, nickname ?? null, now)
          .run();
        const card = await getCardRow(env.DB, id);
        const view = await loadCardView(env.DB, shop, card);
        return json({ ...view, token: backupCode } satisfies CardCreated, 201);
      } catch (err) {
        if (!String(err).includes("UNIQUE")) throw err;
      }
    }
    throw new HttpError(500, "We couldn't create a card. Try again.");
  });

  router.post("/api/shops/:slug/cards/restore", async ({ env, req, params }) => {
    const shop = await findShopBySlug(env.DB, params.slug);
    const { code } = await readJson(req, restoreCardSchema);
    const backupCode = normalizeCode(code);
    const card = await env.DB.prepare("SELECT * FROM cards WHERE secret_hash = ? AND shop_id = ?")
      .bind(await sha256Hex(backupCode), shop.id)
      .first<CardRow>();
    if (!card) {
      throw new HttpError(404, "That backup code doesn't match a card at this shop. Check each character and try again.");
    }
    const view = await loadCardView(env.DB, shop, card);
    return json({ ...view, token: backupCode } satisfies CardCreated);
  });

  router.get("/api/card", async ({ env, req }) => {
    const { card, shop } = await requireCard(env, req);
    return json(await loadCardView(env.DB, shop, card));
  });

  router.patch("/api/card", async ({ env, req }) => {
    const { card, shop } = await requireCard(env, req);
    const { nickname } = await readJson(req, updateCardSchema);
    await env.DB.prepare("UPDATE cards SET nickname = ? WHERE id = ?").bind(nickname ?? null, card.id).run();
    return json(await loadCardView(env.DB, shop, { ...card, nickname: nickname ?? null }));
  });

  // The barista holds "Hold to stamp" on the customer's phone, which sends this.
  router.post("/api/card/orders", async ({ env, req }) => {
    const { card, shop } = await requireCard(env, req);
    const body = await readJson(req, orderSchema);
    const now = Date.now();
    assertCanStamp(shop, card, now);
    const approvedVia = await checkBaristaPin(env.DB, shop, card, body.pin, now);

    // Merge duplicate lines (same item twice).
    const qtyById = new Map<string, number>();
    for (const line of body.items) qtyById.set(line.id, (qtyById.get(line.id) ?? 0) + line.qty);
    const ids = [...qtyById.keys()];

    const [menuRes, lastRes, todayRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items
         WHERE shop_id = ? AND is_archived = 0 AND is_available = 1 AND id IN (${ids.map(() => "?").join(",")})`,
      ).bind(shop.id, ...ids),
      env.DB.prepare(
        `SELECT created_at FROM orders WHERE card_id = ? AND status = 'approved' AND is_reward = 0
         ORDER BY created_at DESC LIMIT 1`,
      ).bind(card.id),
      env.DB.prepare(
        `SELECT COALESCE(SUM(stamps_awarded), 0) AS n FROM orders
         WHERE card_id = ? AND status = 'approved' AND created_at >= ?`,
      ).bind(card.id, startOfLocalDay(now, shop.timezone)),
    ]);

    const menu = menuRes.results as MenuRow[];
    if (menu.length !== ids.length) {
      throw new HttpError(409, "Something in this order is sold out or no longer on the menu. Go back and check the order.", "menu_changed");
    }

    const last = (lastRes.results as { created_at: number }[])[0];
    if (shop.cooldown_minutes > 0 && last && now - last.created_at < shop.cooldown_minutes * 60000) {
      const nextAt = last.created_at + shop.cooldown_minutes * 60000;
      throw new HttpError(
        429,
        `This card got a stamp at ${formatTime(last.created_at, shop.timezone)}. The next order can be stamped from ${formatTime(nextAt, shop.timezone)}.`,
        "cooldown",
      );
    }

    let totalCents = 0;
    let itemCount = 0;
    let stampItems = 0;
    for (const item of menu) {
      const qty = qtyById.get(item.id)!;
      totalCents += item.price_cents * qty;
      itemCount += qty;
      if (item.earns_stamp) stampItems += qty;
    }
    const earned = shop.stamp_mode === "per_cup" ? stampItems : stampItems > 0 ? 1 : 0;
    const today = (todayRes.results as { n: number }[])[0]?.n ?? 0;
    const added =
      shop.max_stamps_per_day > 0 ? Math.max(0, Math.min(earned, shop.max_stamps_per_day - today)) : earned;
    const limitNote =
      added < earned
        ? `Order saved. This card already reached today's limit of ${shop.max_stamps_per_day} stamps, so ${
            added === 0 ? "no stamps were" : `only ${added} ${added === 1 ? "stamp was" : "stamps were"}`
          } added.`
        : null;

    const orderId = ulid(now);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (id, shop_id, card_id, status, is_reward, approved_via, total_cents, item_count, stamps_awarded, created_at)
         VALUES (?, ?, ?, 'approved', 0, ?, ?, ?, ?, ?)`,
      ).bind(orderId, shop.id, card.id, approvedVia, totalCents, itemCount, added, now),
      ...menu.map((item) =>
        env.DB.prepare(
          `INSERT INTO order_items (id, order_id, menu_item_id, name, price_cents, qty, earns_stamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(ulid(now), orderId, item.id, item.name, item.price_cents, qtyById.get(item.id)!, item.earns_stamp),
      ),
      env.DB.prepare(
        `UPDATE cards SET stamps = stamps + ?, lifetime_stamps = lifetime_stamps + ?, last_visit_at = ? WHERE id = ?`,
      ).bind(added, added, now, card.id),
    ]);

    const updated = await getCardRow(env.DB, card.id);
    const view = await loadCardView(env.DB, shop, updated);
    return json(
      { ...view, orderId, stampsAdded: added, stampsEarned: earned, limitNote, approvedAt: now } satisfies OrderResult,
      201,
    );
  });

  // Uses a full card for one free drink. The barista holds "Hold to give" on the customer's phone.
  router.post("/api/card/redeem", async ({ env, req }) => {
    const { card, shop } = await requireCard(env, req);
    const { itemId, pin } = await readJson(req, redeemSchema);
    const now = Date.now();
    assertCanStamp(shop, card, now);

    const item = await env.DB.prepare(
      `SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items
       WHERE id = ? AND shop_id = ? AND is_archived = 0 AND is_available = 1`,
    )
      .bind(itemId, shop.id)
      .first<MenuRow>();
    if (!item) throw new HttpError(409, "That drink is sold out. Pick another one.", "menu_changed");
    if (!item.earns_stamp) throw new HttpError(400, "Pick a drink that's part of the stamp card.");
    if (card.stamps < shop.stamps_required) {
      const missing = shop.stamps_required - card.stamps;
      throw new HttpError(409, `You need ${missing} more ${missing === 1 ? "stamp" : "stamps"} for ${shop.reward_text}.`, "not_enough_stamps");
    }
    const approvedVia = await checkBaristaPin(env.DB, shop, card, pin, now);

    const required = shop.stamps_required;
    const orderId = ulid(now);
    // The order is only inserted while the card still has enough stamps, and the other two
    // statements only run if that order exists. D1 runs a batch as one transaction, so a
    // double tap can't use the same stamps twice.
    const [insertRes] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (id, shop_id, card_id, status, is_reward, approved_via, total_cents, item_count, stamps_awarded, stamps_used, created_at)
         SELECT ?1, ?2, id, 'approved', 1, ?6, 0, 1, 0, ?3, ?4 FROM cards
         WHERE id = ?5 AND stamps >= ?3 AND is_blocked = 0`,
      ).bind(orderId, shop.id, required, now, card.id, approvedVia),
      env.DB.prepare(
        `INSERT INTO order_items (id, order_id, menu_item_id, name, price_cents, qty, earns_stamp)
         SELECT ?, id, ?, ?, 0, 1, 1 FROM orders WHERE id = ?`,
      ).bind(ulid(now), item.id, item.name, orderId),
      env.DB.prepare(
        `UPDATE cards SET stamps = stamps - ?1, rewards_redeemed = rewards_redeemed + 1, last_visit_at = ?2
         WHERE id = ?3 AND EXISTS (SELECT 1 FROM orders WHERE id = ?4)`,
      ).bind(required, now, card.id, orderId),
    ]);

    if (insertRes.meta.changes === 0) {
      const missing = Math.max(0, required - card.stamps);
      throw new HttpError(
        409,
        missing > 0
          ? `You need ${missing} more ${missing === 1 ? "stamp" : "stamps"} for ${shop.reward_text}.`
          : "This reward was already used.",
        "not_enough_stamps",
      );
    }

    const updated = await getCardRow(env.DB, card.id);
    const view = await loadCardView(env.DB, shop, updated);
    return json(
      { ...view, orderId, stampsAdded: 0, stampsEarned: 0, limitNote: null, approvedAt: now } satisfies OrderResult,
      201,
    );
  });
}
