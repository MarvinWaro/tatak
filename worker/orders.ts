// Prices and saves an order: promos, the free box, and the card update. Shared by customer
// orders and purchases the barista records, so both follow the same rules.
import { promoDiscount, promoNeedsStampItem, readyPromo } from "../shared/promos";
import type { Promo } from "../shared/types";
import type { D1Database, D1PreparedStatement, D1Result } from "./env";
import { HttpError } from "./http";
import { ulid } from "./ids";
import { type CardRow, type MenuRow, type PromoRow, PROMOS_SQL, PROMOS_USED_SQL, toPromo } from "./views";

export interface PricedLine {
  item: MenuRow;
  qty: number;
  /** Price per unit as charged. Lower on the promo unit, 0 on the free unit. */
  priceCents: number;
  isFree: boolean;
}

export interface PricedOrder {
  lines: PricedLine[];
  totalCents: number;
  /** Taken off by the promo. The free item is not a discount; it shows as a free drink. */
  discountCents: number;
  itemCount: number;
}

export interface OrderPerks {
  promo: Promo | null;
  promoItemId: string | undefined;
  /** The free item, when this order reaches the free box. */
  freeItemId: string | undefined;
  /** The card's stamps before this order (see promoNeedsStampItem). */
  stampsBefore: number;
}

export const PROMO_USED_MESSAGE = "This promo was already used. Go back and order without it.";
export const REWARD_USED_MESSAGE = "This card just changed, so the free item wasn't given. Check the card and try again.";

/** The two reads needed to find the card's ready promo. Add them to a batch you already run. */
export function promoStatements(db: D1Database, shopId: string, card: CardRow): D1PreparedStatement[] {
  return [db.prepare(PROMOS_SQL).bind(shopId), db.prepare(PROMOS_USED_SQL).bind(card.id, card.rewards_redeemed)];
}

/**
 * The promo this order uses, from the results of promoStatements(). `stampsAfter` is the card's
 * stamps plus the stamps this order really adds (after the daily limit). Throws when there is none.
 */
export function requireReadyPromo(promos: D1Result, used: D1Result, stampsAfter: number): Promo {
  const promo = readyPromo(
    (promos.results as PromoRow[]).map(toPromo),
    stampsAfter,
    (used.results as { promo_step: number }[]).map((r) => r.promo_step),
  );
  if (!promo) throw new HttpError(409, "This order doesn't reach a promo yet. Go back and order without it.", "no_promo");
  return promo;
}

/**
 * The last box on the card is the free one: with 10 boxes, 9 paid stamps and the 10th cup is free.
 * An order gets it when its stamps reach that box, like a promo.
 */
export function assertReachesFreeBox(stampsAfter: number, required: number): void {
  if (stampsAfter < required) {
    throw new HttpError(409, "This order doesn't reach the free box yet. Go back and order without it.", "no_reward");
  }
}

/** Units in the order that earn a stamp. */
export function countStampItems(menu: MenuRow[], qtyById: Map<string, number>): number {
  return menu.reduce((n, item) => n + (item.earns_stamp ? qtyById.get(item.id)! : 0), 0);
}

/**
 * Totals for an order. The promo unit and the free unit each become their own line, so the
 * per-item sales report adds up to what was charged and counts free items.
 */
export function priceOrder(menu: MenuRow[], qtyById: Map<string, number>, perks: OrderPerks): PricedOrder {
  const { promo } = perks;
  let freeId: string | null = null;
  if (perks.freeItemId !== undefined) {
    const target = menu.find((m) => m.id === perks.freeItemId);
    if (!target) throw new HttpError(400, "Pick which item in this order is free.", "reward_item");
    if (!target.earns_stamp) throw new HttpError(400, "The free item has to be one that earns a stamp.", "reward_item");
    freeId = target.id;
  }

  let discountCents = 0;
  let promoId: string | null = null;
  if (promo && promo.percentOff > 0) {
    const target = menu.find((m) => m.id === perks.promoItemId);
    if (!target) throw new HttpError(400, `Pick which item in this order gets the ${promo.label}.`, "promo_item");
    if (!target.earns_stamp && promoNeedsStampItem(promo, perks.stampsBefore)) {
      throw new HttpError(400, `The ${promo.label} goes on a cup that earns a stamp. Pick one of those.`, "promo_item");
    }
    promoId = target.id;
    discountCents = promoDiscount(target.price_cents, promo.percentOff);
  }

  const lines: PricedLine[] = [];
  let totalCents = 0;
  let itemCount = 0;
  for (const item of menu) {
    const qty = qtyById.get(item.id)!;
    const free = item.id === freeId ? 1 : 0;
    const discounted = item.id === promoId ? 1 : 0;
    if (free + discounted > qty) {
      throw new HttpError(400, "The free item and the promo need two different units. Add one more or pick another item.", "promo_item");
    }
    const full = qty - free - discounted;
    if (full > 0) lines.push({ item, qty: full, priceCents: item.price_cents, isFree: false });
    if (discounted) lines.push({ item, qty: 1, priceCents: item.price_cents - discountCents, isFree: false });
    if (free) lines.push({ item, qty: 1, priceCents: 0, isFree: true });
    totalCents += (qty - free) * item.price_cents;
    itemCount += qty;
  }
  return { lines, totalCents: totalCents - discountCents, discountCents, itemCount };
}

export interface NewOrder {
  orderId: string;
  shopId: string;
  card: CardRow;
  approvedVia: string;
  priced: PricedOrder;
  /** Stamps this order adds to the card (after the daily limit). */
  stampsAdded: number;
  promo: Promo | null;
  /** Stamps the free box uses up: the card's box count, or 0 when this order has no free item. */
  stampsUsed: number;
  at: number;
}

/**
 * The statements that save an order and update the card, as one batch. With a free item, the
 * order is only saved while the card still has the stamps and round it was read with, so a
 * double tap can't give two free items. The other statements only run if the order was saved.
 */
export function orderStatements(db: D1Database, o: NewOrder): D1PreparedStatement[] {
  const free = o.stampsUsed > 0;
  const savedOrder = "EXISTS (SELECT 1 FROM orders WHERE id = ?)";
  return [
    db
      .prepare(
        `INSERT INTO orders (id, shop_id, card_id, status, is_reward, approved_via, total_cents, item_count,
           stamps_awarded, stamps_used, discount_cents, promo_step, promo_round, created_at)
         SELECT ?, ?, id, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM cards
         WHERE id = ?${free ? " AND stamps = ? AND rewards_redeemed = ?" : ""}`,
      )
      .bind(
        o.orderId,
        o.shopId,
        free ? 1 : 0,
        o.approvedVia,
        o.priced.totalCents,
        o.priced.itemCount,
        o.stampsAdded,
        o.stampsUsed,
        o.priced.discountCents,
        o.promo?.step ?? null,
        o.promo ? o.card.rewards_redeemed : null,
        o.at,
        o.card.id,
        ...(free ? [o.card.stamps, o.card.rewards_redeemed] : []),
      ),
    ...o.priced.lines.map((line) =>
      db
        .prepare(
          `INSERT INTO order_items (id, order_id, menu_item_id, name, price_cents, qty, earns_stamp, is_free)
           SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${savedOrder}`,
        )
        .bind(
          ulid(o.at),
          o.orderId,
          line.item.id,
          line.item.name,
          line.priceCents,
          line.qty,
          line.item.earns_stamp,
          line.isFree ? 1 : 0,
          o.orderId,
        ),
    ),
    db
      .prepare(
        `UPDATE cards SET stamps = stamps + ?1 - ?2, lifetime_stamps = lifetime_stamps + ?1,
           rewards_redeemed = rewards_redeemed + ?3, last_visit_at = MAX(COALESCE(last_visit_at, 0), ?4)
         WHERE id = ?5 AND EXISTS (SELECT 1 FROM orders WHERE id = ?6)`,
      )
      .bind(o.stampsAdded, o.stampsUsed, free ? 1 : 0, o.at, o.card.id, o.orderId),
  ];
}

/**
 * Runs orderStatements() and turns a lost race into a clear error: a promo used twice (the
 * orders_promo_once index) or a free item given twice (the card changed since it was read).
 */
export async function saveOrder(db: D1Database, o: NewOrder): Promise<void> {
  let results: D1Result[];
  try {
    results = await db.batch(orderStatements(db, o));
  } catch (err) {
    if (o.promo && String(err).includes("UNIQUE")) throw new HttpError(409, PROMO_USED_MESSAGE, "promo_used");
    throw err;
  }
  if (results[0].meta.changes === 0) throw new HttpError(409, REWARD_USED_MESSAGE, "reward_used");
}
