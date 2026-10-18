// Turns database rows into API shapes, and loads the full card view.
import type {
  AdminMenuItem,
  CardHistoryEntry,
  CardSummary,
  CardView,
  MenuSize,
  Promo,
  PublicMenuItem,
  PublicShop,
  ShopSettings,
} from "../shared/types";
import { CARD_COLORS, type CardColor, INK_COLORS, type InkColor } from "../shared/theme";
import type { ShopRow } from "./auth";
import type { D1Database } from "./env";

export interface MenuRow {
  id: string;
  name: string;
  price_cents: number;
  earns_stamp: number;
  is_available: number;
  sort_order: number;
}

export interface SizeRow {
  id: string;
  menu_item_id: string;
  name: string;
  price_cents: number;
}

/** The shop's active sizes, for every item on its menu. */
export const SIZES_SQL = `SELECT z.id, z.menu_item_id, z.name, z.price_cents FROM menu_item_sizes z
  JOIN menu_items m ON m.id = z.menu_item_id
  WHERE m.shop_id = ? AND m.is_archived = 0 AND z.is_archived = 0
  ORDER BY z.sort_order, z.created_at`;

/** Sizes grouped by menu item id. */
export function sizesByItem(rows: SizeRow[]): Map<string, MenuSize[]> {
  const map = new Map<string, MenuSize[]>();
  for (const r of rows) {
    const list = map.get(r.menu_item_id) ?? [];
    list.push({ id: r.id, name: r.name, priceCents: r.price_cents });
    map.set(r.menu_item_id, list);
  }
  return map;
}

export interface CardRow {
  id: string;
  shop_id: string;
  code: string;
  nickname: string | null;
  stamps: number;
  lifetime_stamps: number;
  rewards_redeemed: number;
  is_blocked: number;
  last_visit_at: number | null;
  pin_failures: number;
  pin_locked_until: number;
  created_at: number;
}

export interface PromoRow {
  step: number;
  percent_off: number;
  label: string;
}

export const PROMOS_SQL = "SELECT step, percent_off, label FROM card_promos WHERE shop_id = ? ORDER BY step";

export const toPromo = (r: PromoRow): Promo => ({ step: r.step, percentOff: r.percent_off, label: r.label });

export const toPublicMenuItem = (r: MenuRow, sizes: Map<string, MenuSize[]>): PublicMenuItem => ({
  id: r.id,
  name: r.name,
  priceCents: r.price_cents,
  earnsStamp: r.earns_stamp === 1,
  sizes: sizes.get(r.id) ?? [],
});

export const toAdminMenuItem = (r: MenuRow, sizes: Map<string, MenuSize[]>): AdminMenuItem => ({
  ...toPublicMenuItem(r, sizes),
  isAvailable: r.is_available === 1,
  sortOrder: r.sort_order,
});

const cardColorOf = (s: ShopRow): CardColor => (s.card_color in CARD_COLORS ? (s.card_color as CardColor) : "canary");
const inkColorOf = (s: ShopRow): InkColor => (s.ink_color in INK_COLORS ? (s.ink_color as InkColor) : "violet");
export const logoUrlOf = (s: ShopRow): string | null =>
  s.logo_version > 0 ? `/api/shops/${s.slug}/logo?v=${s.logo_version}` : null;

export function toPublicShop(s: ShopRow, menu: MenuRow[], sizes: SizeRow[], promos: PromoRow[]): PublicShop {
  const bySize = sizesByItem(sizes);
  return {
    slug: s.slug,
    name: s.name,
    timezone: s.timezone,
    stampsRequired: s.stamps_required,
    rewardText: s.reward_text,
    stampMode: s.stamp_mode,
    openTime: s.open_time,
    closeTime: s.close_time,
    requirePin: s.require_pin === 1 && s.pin_hash !== null,
    cardColor: cardColorOf(s),
    inkColor: inkColorOf(s),
    logoUrl: logoUrlOf(s),
    menu: menu.map((m) => toPublicMenuItem(m, bySize)),
    promos: promos.map(toPromo),
  };
}

export const toShopSettings = (s: ShopRow): ShopSettings => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  email: s.email,
  timezone: s.timezone,
  stampsRequired: s.stamps_required,
  rewardText: s.reward_text,
  stampMode: s.stamp_mode,
  cooldownMinutes: s.cooldown_minutes,
  maxStampsPerDay: s.max_stamps_per_day,
  openTime: s.open_time,
  closeTime: s.close_time,
  requirePin: s.require_pin === 1 && s.pin_hash !== null,
  hasPin: s.pin_hash !== null,
  cardColor: cardColorOf(s),
  inkColor: inkColorOf(s),
  logoUrl: logoUrlOf(s),
});

export const toCardSummary = (c: CardRow, promosUsed: number[]): CardSummary => ({
  code: c.code,
  nickname: c.nickname,
  stamps: c.stamps,
  lifetimeStamps: c.lifetime_stamps,
  rewardsRedeemed: c.rewards_redeemed,
  isBlocked: c.is_blocked === 1,
  createdAt: c.created_at,
  promosUsed,
});

export const MENU_SQL = `SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items
  WHERE shop_id = ? AND is_archived = 0 AND is_available = 1 ORDER BY sort_order, created_at`;

/** Steps of the promos this card used in its current round. Served by the orders_promo_once index. */
export const PROMOS_USED_SQL = `SELECT promo_step FROM orders
  WHERE card_id = ? AND promo_round = ? AND promo_step IS NOT NULL AND status = 'approved'`;

/** Everything the customer's card page needs, in one database round trip. */
export async function loadCardView(db: D1Database, shop: ShopRow, card: CardRow): Promise<CardView> {
  const [menu, sizes, promos, promosUsed, stampSources, orders, items] = await db.batch([
    db.prepare(MENU_SQL).bind(shop.id),
    db.prepare(SIZES_SQL).bind(shop.id),
    db.prepare(PROMOS_SQL).bind(shop.id),
    db.prepare(PROMOS_USED_SQL).bind(card.id, card.rewards_redeemed),
    db
      .prepare(
        `SELECT created_at, stamps_awarded AS n FROM orders
           WHERE card_id = ?1 AND status = 'approved' AND stamps_awarded > 0
         UNION ALL
         SELECT created_at, delta AS n FROM stamp_adjustments WHERE card_id = ?1 AND delta > 0
         ORDER BY created_at DESC LIMIT 40`,
      )
      .bind(card.id),
    db
      .prepare(
        `SELECT id, created_at, is_reward, status, total_cents, discount_cents, promo_step, stamps_awarded FROM orders
         WHERE card_id = ? ORDER BY created_at DESC LIMIT 10`,
      )
      .bind(card.id),
    db
      .prepare(
        `SELECT order_id, name, qty FROM order_items WHERE order_id IN
           (SELECT id FROM orders WHERE card_id = ? ORDER BY created_at DESC LIMIT 10)`,
      )
      .bind(card.id),
  ]);

  // The stamps on the card are the newest ones (older ones were used for rewards). The last box
  // is the free one, so at most stamps_required - 1 paid stamps show.
  const visible = Math.min(card.stamps, shop.stamps_required - 1);
  const stampDates: number[] = [];
  for (const row of stampSources.results as { created_at: number; n: number }[]) {
    for (let i = 0; i < row.n && stampDates.length < visible; i++) stampDates.push(row.created_at);
    if (stampDates.length >= visible) break;
  }
  // Stamps older than the 40 rows we read still need a date to show.
  while (stampDates.length < visible) stampDates.push(card.created_at);

  const itemsByOrder = new Map<string, { name: string; qty: number }[]>();
  for (const it of items.results as { order_id: string; name: string; qty: number }[]) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push({ name: it.name, qty: it.qty });
    itemsByOrder.set(it.order_id, list);
  }

  const promoRows = promos.results as PromoRow[];
  const labelOf = (step: number | null) =>
    step === null ? null : (promoRows.find((p) => p.step === step)?.label ?? "Promo");

  const history: CardHistoryEntry[] = (
    orders.results as {
      id: string;
      created_at: number;
      is_reward: number;
      status: "approved" | "voided";
      total_cents: number;
      discount_cents: number;
      promo_step: number | null;
      stamps_awarded: number;
    }[]
  ).map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    isReward: o.is_reward === 1,
    status: o.status,
    totalCents: o.total_cents,
    discountCents: o.discount_cents,
    promoLabel: labelOf(o.promo_step),
    stampsAwarded: o.stamps_awarded,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return {
    shop: toPublicShop(shop, menu.results as MenuRow[], sizes.results as SizeRow[], promoRows),
    card: toCardSummary(
      card,
      (promosUsed.results as { promo_step: number }[]).map((r) => r.promo_step),
    ),
    stampDates,
    history,
  };
}
