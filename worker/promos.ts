// Prices an order and applies the card's promo. Shared by customer orders and
// purchases the barista records, so both follow the same rules.
import { promoDiscount, readyPromo } from "../shared/promos";
import type { Promo } from "../shared/types";
import type { D1Database, D1PreparedStatement, D1Result } from "./env";
import { HttpError } from "./http";
import { type CardRow, type MenuRow, type PromoRow, PROMOS_SQL, PROMOS_USED_SQL, toPromo } from "./views";

export interface PricedLine {
  item: MenuRow;
  qty: number;
  /** Price per unit as charged. Lower than the menu price on the one discounted unit. */
  priceCents: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  totalCents: number;
  discountCents: number;
  itemCount: number;
  stampItems: number;
}

export const PROMO_USED_MESSAGE = "This promo was already used. Go back and order without it.";

/** The two reads needed to find the card's ready promo. Add them to a batch you already run. */
export function promoStatements(db: D1Database, shopId: string, card: CardRow): D1PreparedStatement[] {
  return [db.prepare(PROMOS_SQL).bind(shopId), db.prepare(PROMOS_USED_SQL).bind(card.id, card.rewards_redeemed)];
}

/** The promo this card can use now, from the results of promoStatements(). Throws when there is none. */
export function requireReadyPromo(promos: D1Result, used: D1Result, card: CardRow): Promo {
  const promo = readyPromo(
    (promos.results as PromoRow[]).map(toPromo),
    card.stamps,
    (used.results as { promo_step: number }[]).map((r) => r.promo_step),
  );
  if (!promo) throw new HttpError(409, "This card has no promo ready. Go back and order without it.", "no_promo");
  return promo;
}

/**
 * Totals for an order. With a promo, one unit of the picked item gets the discount; that unit
 * becomes its own line so the per-item sales report adds up to what was charged.
 */
export function priceOrder(
  menu: MenuRow[],
  qtyById: Map<string, number>,
  promo: Promo | null,
  promoItemId: string | undefined,
): PricedOrder {
  let discountCents = 0;
  let discountedId: string | null = null;
  if (promo && promo.percentOff > 0) {
    const target = menu.find((m) => m.id === promoItemId);
    if (!target) throw new HttpError(400, `Pick which item in this order gets the ${promo.label}.`, "promo_item");
    discountedId = target.id;
    discountCents = promoDiscount(target.price_cents, promo.percentOff);
  }

  const lines: PricedLine[] = [];
  let totalCents = 0;
  let itemCount = 0;
  let stampItems = 0;
  for (const item of menu) {
    const qty = qtyById.get(item.id)!;
    totalCents += item.price_cents * qty;
    itemCount += qty;
    if (item.earns_stamp) stampItems += qty;
    if (item.id === discountedId) {
      if (qty > 1) lines.push({ item, qty: qty - 1, priceCents: item.price_cents });
      lines.push({ item, qty: 1, priceCents: item.price_cents - discountCents });
    } else {
      lines.push({ item, qty, priceCents: item.price_cents });
    }
  }
  return { lines, totalCents: totalCents - discountCents, discountCents, itemCount, stampItems };
}

/** D1 reports a broken unique index as an error whose text includes "UNIQUE". */
export const isUniqueError = (err: unknown): boolean => String(err).includes("UNIQUE");
