// Turns database rows into API shapes, and loads the full card view.
import type {
  AdminMenuItem,
  CardHistoryEntry,
  CardSummary,
  CardView,
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

export const toPublicMenuItem = (r: MenuRow): PublicMenuItem => ({
  id: r.id,
  name: r.name,
  priceCents: r.price_cents,
  earnsStamp: r.earns_stamp === 1,
});

export const toAdminMenuItem = (r: MenuRow): AdminMenuItem => ({
  ...toPublicMenuItem(r),
  isAvailable: r.is_available === 1,
  sortOrder: r.sort_order,
});

const cardColorOf = (s: ShopRow): CardColor => (s.card_color in CARD_COLORS ? (s.card_color as CardColor) : "canary");
const inkColorOf = (s: ShopRow): InkColor => (s.ink_color in INK_COLORS ? (s.ink_color as InkColor) : "violet");
export const logoUrlOf = (s: ShopRow): string | null =>
  s.logo_version > 0 ? `/api/shops/${s.slug}/logo?v=${s.logo_version}` : null;

export const toPublicShop = (s: ShopRow, menu: MenuRow[]): PublicShop => ({
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
  menu: menu.map(toPublicMenuItem),
});

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

export const toCardSummary = (c: CardRow): CardSummary => ({
  code: c.code,
  nickname: c.nickname,
  stamps: c.stamps,
  lifetimeStamps: c.lifetime_stamps,
  rewardsRedeemed: c.rewards_redeemed,
  isBlocked: c.is_blocked === 1,
  createdAt: c.created_at,
});

export const MENU_SQL = `SELECT id, name, price_cents, earns_stamp, is_available, sort_order FROM menu_items
  WHERE shop_id = ? AND is_archived = 0 AND is_available = 1 ORDER BY sort_order, created_at`;

/** Everything the customer's card page needs, in one database round trip. */
export async function loadCardView(db: D1Database, shop: ShopRow, card: CardRow): Promise<CardView> {
  const [menu, stampSources, orders, items] = await db.batch([
    db.prepare(MENU_SQL).bind(shop.id),
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
        `SELECT id, created_at, is_reward, status, total_cents, stamps_awarded FROM orders
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

  // The stamps on the card are the newest ones (older ones were used for rewards).
  const visible = Math.min(card.stamps, shop.stamps_required);
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

  const history: CardHistoryEntry[] = (
    orders.results as {
      id: string;
      created_at: number;
      is_reward: number;
      status: "approved" | "voided";
      total_cents: number;
      stamps_awarded: number;
    }[]
  ).map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    isReward: o.is_reward === 1,
    status: o.status,
    totalCents: o.total_cents,
    stampsAwarded: o.stamps_awarded,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return {
    shop: toPublicShop(shop, menu.results as MenuRow[]),
    card: toCardSummary(card),
    stampDates,
    history,
  };
}
