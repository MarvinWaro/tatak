// Prices and saves an order: promos, the free box, and the card update. Shared by customer
// orders and purchases the barista records, so both follow the same rules.
import { promoDiscount, promoNeedsStampItem, readyPromo } from "../shared/promos";
import type { Promo } from "../shared/types";
import type { D1Database, D1PreparedStatement, D1Result } from "./env";
import { HttpError } from "./http";
import { ulid } from "./ids";
import {
  type CardRow,
  type MenuRow,
  type PromoRow,
  type SizeRow,
  PROMOS_SQL,
  PROMOS_USED_SQL,
  toPromo,
} from "./views";

/** One line of an order as asked for: an item, its size (when it has sizes), and how many. */
export interface OrderLine {
  item: MenuRow;
  sizeId: string | null;
  /** The name as sold: "Spanish Latte (Large)", or just the item name without sizes. */
  name: string;
  /** Price of one unit: the size's price, or the item's. */
  unitCents: number;
  qty: number;
}

/** A menu item and, when it has sizes, which size. */
export interface ItemRef {
  itemId?: string;
  sizeId?: string;
}

export interface PricedLine {
  item: MenuRow;
  sizeId: string | null;
  name: string;
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
  promoItem: ItemRef | undefined;
  /** The free item, when this order reaches the free box. */
  freeItem: ItemRef | undefined;
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

/** The active sizes of the given items. The items were already checked to belong to the shop. */
export const sizesForItemsSql = (count: number): string =>
  `SELECT id, menu_item_id, name, price_cents FROM menu_item_sizes
   WHERE is_archived = 0 AND menu_item_id IN (${Array(count).fill("?").join(",")})
   ORDER BY sort_order, created_at`;

/**
 * Turns the asked-for lines into order lines: picks each size's price, names the item as sold
 * ("Spanish Latte (Large)"), and merges repeated lines. An item with sizes must say which size;
 * an item without sizes must not. Either mismatch means the menu changed under the customer.
 */
export function buildLines(
  menu: MenuRow[],
  sizes: SizeRow[],
  asked: { id: string; sizeId?: string; qty: number }[],
): OrderLine[] {
  const byKey = new Map<string, OrderLine>();
  for (const a of asked) {
    const item = menu.find((m) => m.id === a.id)!;
    const itemSizes = sizes.filter((z) => z.menu_item_id === item.id);
    let line: Omit<OrderLine, "qty">;
    if (itemSizes.length > 0) {
      const size = itemSizes.find((z) => z.id === a.sizeId);
      if (!size) {
        throw new HttpError(409, `Pick a size for ${item.name}. Go back and check the order.`, "menu_changed");
      }
      line = { item, sizeId: size.id, name: `${item.name} (${size.name})`, unitCents: size.price_cents };
    } else {
      if (a.sizeId) {
        throw new HttpError(409, `${item.name} has no sizes now. Go back and check the order.`, "menu_changed");
      }
      line = { item, sizeId: null, name: item.name, unitCents: item.price_cents };
    }
    const key = `${item.id}|${line.sizeId ?? ""}`;
    const prev = byKey.get(key);
    if (prev) prev.qty += a.qty;
    else byKey.set(key, { ...line, qty: a.qty });
  }
  return [...byKey.values()];
}

/** Units in the order that earn a stamp. Every size of an item earns the same stamp. */
export function countStampItems(lines: OrderLine[]): number {
  return lines.reduce((n, l) => n + (l.item.earns_stamp ? l.qty : 0), 0);
}

const findLine = (lines: OrderLine[], ref: ItemRef | undefined): OrderLine | undefined =>
  ref && lines.find((l) => l.item.id === ref.itemId && l.sizeId === (ref.sizeId ?? null));

/**
 * Totals for an order. The promo unit and the free unit each become their own line, so the
 * per-item sales report adds up to what was charged and counts free items.
 */
export function priceOrder(lines: OrderLine[], perks: OrderPerks): PricedOrder {
  const { promo } = perks;
  let freeLine: OrderLine | undefined;
  if (perks.freeItem !== undefined) {
    freeLine = findLine(lines, perks.freeItem);
    if (!freeLine) throw new HttpError(400, "Pick which item in this order is free.", "reward_item");
    if (!freeLine.item.earns_stamp) {
      throw new HttpError(400, "The free item has to be one that earns a stamp.", "reward_item");
    }
  }

  let discountCents = 0;
  let promoLine: OrderLine | undefined;
  if (promo && promo.percentOff > 0) {
    promoLine = findLine(lines, perks.promoItem);
    if (!promoLine) throw new HttpError(400, `Pick which item in this order gets the ${promo.label}.`, "promo_item");
    if (!promoLine.item.earns_stamp && promoNeedsStampItem(promo, perks.stampsBefore)) {
      throw new HttpError(400, `The ${promo.label} goes on a cup that earns a stamp. Pick one of those.`, "promo_item");
    }
    discountCents = promoDiscount(promoLine.unitCents, promo.percentOff);
  }

  const priced: PricedLine[] = [];
  let totalCents = 0;
  let itemCount = 0;
  for (const line of lines) {
    const { item, sizeId, name, unitCents, qty } = line;
    const free = line === freeLine ? 1 : 0;
    const discounted = line === promoLine ? 1 : 0;
    if (free + discounted > qty) {
      throw new HttpError(
        400,
        "The free item and the promo need two different units. Add one more or pick another item.",
        "promo_item",
      );
    }
    const full = qty - free - discounted;
    const base = { item, sizeId, name };
    if (full > 0) priced.push({ ...base, qty: full, priceCents: unitCents, isFree: false });
    if (discounted) priced.push({ ...base, qty: 1, priceCents: unitCents - discountCents, isFree: false });
    if (free) priced.push({ ...base, qty: 1, priceCents: 0, isFree: true });
    totalCents += (qty - free) * unitCents;
    itemCount += qty;
  }
  return { lines: priced, totalCents: totalCents - discountCents, discountCents, itemCount };
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
          `INSERT INTO order_items (id, order_id, menu_item_id, size_id, name, price_cents, qty, earns_stamp, is_free)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${savedOrder}`,
        )
        .bind(
          ulid(o.at),
          o.orderId,
          line.item.id,
          line.sizeId,
          line.name,
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
