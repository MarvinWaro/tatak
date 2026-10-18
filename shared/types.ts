// Shapes returned by the API. Shared by the Worker and the React app.
import type { CardColor, InkColor } from "./theme";

export type StampMode = "per_cup" | "per_order";

/** One size of a menu item, with its own price: "Large", ₱120. */
export interface MenuSize {
  id: string;
  name: string;
  priceCents: number;
}

export interface PublicMenuItem {
  id: string;
  name: string;
  /** The price when the item has no sizes; the lowest size price when it has some. */
  priceCents: number;
  earnsStamp: boolean;
  /** Empty when the item has a single price. */
  sizes: MenuSize[];
}

/** A promo on one stamp of the card, e.g. stamp 5 = 50% off one item. */
export interface Promo {
  /** The stamp number that unlocks it. */
  step: number;
  /** 0 to 100. 0 means the barista gives the perk by hand and the price doesn't change. */
  percentOff: number;
  /** Shown in the card slot, e.g. "50% off" or "Free upsize". */
  label: string;
}

export interface PublicShop {
  slug: string;
  name: string;
  timezone: string;
  stampsRequired: number;
  rewardText: string;
  stampMode: StampMode;
  openTime: string | null;
  closeTime: string | null;
  /** When true, the barista types a 4-digit PIN after the hold to approve a stamp. */
  requirePin: boolean;
  cardColor: CardColor;
  inkColor: InkColor;
  /** Versioned URL of the shop's logo, or null when there is none. */
  logoUrl: string | null;
  menu: PublicMenuItem[];
  /** Sorted by step. */
  promos: Promo[];
}

export interface CardSummary {
  code: string;
  nickname: string | null;
  stamps: number;
  lifetimeStamps: number;
  rewardsRedeemed: number;
  isBlocked: boolean;
  createdAt: number;
  /** Steps of the promos already used in this round of the card. */
  promosUsed: number[];
}

export interface CardHistoryEntry {
  id: string;
  createdAt: number;
  isReward: boolean;
  status: "approved" | "voided";
  totalCents: number;
  discountCents: number;
  /** Label of the promo used on this order, or null. */
  promoLabel: string | null;
  stampsAwarded: number;
  items: { name: string; qty: number }[];
}

export interface CardView {
  shop: PublicShop;
  card: CardSummary;
  /** Timestamps of the stamps currently on the card, newest first. */
  stampDates: number[];
  history: CardHistoryEntry[];
}

export interface CardCreated extends CardView {
  /** The customer's backup code. Only ever sent to the customer's own browser. */
  token: string;
}

export interface OrderResult extends CardView {
  orderId: string;
  stampsAdded: number;
  stampsEarned: number;
  /** Set when fewer stamps were added than earned because of the daily limit. */
  limitNote: string | null;
  approvedAt: number;
  /** How much the promo took off this order, in centavos. */
  discountCents: number;
}

export interface ShopSettings {
  id: string;
  slug: string;
  name: string;
  email: string;
  timezone: string;
  stampsRequired: number;
  rewardText: string;
  stampMode: StampMode;
  cooldownMinutes: number;
  maxStampsPerDay: number;
  openTime: string | null;
  closeTime: string | null;
  requirePin: boolean;
  hasPin: boolean;
  cardColor: CardColor;
  inkColor: InkColor;
  logoUrl: string | null;
}

export interface AdminMenuItem extends PublicMenuItem {
  isAvailable: boolean;
  sortOrder: number;
}

export interface ReportTotals {
  salesCents: number;
  paidOrders: number;
  itemsSold: number;
  stampsGiven: number;
  freeCups: number;
  customers: number;
  discountsCents: number;
  promosUsed: number;
}

/** A customer who bought in the report's date range. */
export interface ReportBuyer {
  id: string;
  code: string;
  nickname: string | null;
  visits: number;
  itemsBought: number;
  spentCents: number;
  lastAt: number;
  /** Stamps on the card now. */
  stamps: number;
}

export interface SalesReport {
  range: { from: string; to: string; days: number };
  totals: ReportTotals;
  previous: { from: string; to: string; salesCents: number; paidOrders: number };
  items: { name: string; qty: number; salesCents: number; freeQty: number }[];
  hours: { hour: number; paidOrders: number; salesCents: number; itemsSold: number }[];
  days: { date: string; paidOrders: number; salesCents: number; itemsSold: number }[];
  /** Top buyers by amount spent. */
  buyers: ReportBuyer[];
}

export interface AdminOrder {
  id: string;
  createdAt: number;
  status: "approved" | "voided";
  isReward: boolean;
  totalCents: number;
  discountCents: number;
  /** The stamp number of the promo used on this order, or null. */
  promoStep: number | null;
  itemCount: number;
  stampsAwarded: number;
  stampsUsed: number;
  /** "tap", "pin", or "admin" when the barista recorded it from his own phone. */
  approvedVia: string;
  card: { id: string; code: string; nickname: string | null };
  items: { name: string; qty: number; priceCents: number }[];
}

/** A customer's promo state, for "Record a purchase". */
export interface CustomerPromos {
  stamps: number;
  promos: Promo[];
  /** Steps already used in this round of the card. */
  used: number[];
}

export interface AdminCustomer {
  id: string;
  code: string;
  nickname: string | null;
  stamps: number;
  lifetimeStamps: number;
  rewardsRedeemed: number;
  isBlocked: boolean;
  lastVisitAt: number | null;
  createdAt: number;
}

// ---- Super admin ----

/** Every shop is in the Philippines, so the super admin shows dates and times in Manila time. */
export const PLATFORM_TIMEZONE = "Asia/Manila";

/** How many days the shop list's sales and order counts cover (today included). */
export const SUPER_RECENT_DAYS = 30;

export interface SuperShop {
  id: string;
  slug: string;
  name: string;
  email: string;
  createdAt: number;
  /** Customer cards ever made at this shop. */
  customers: number;
  /** Items on the menu now (not removed). 0 means the shop hasn't finished setting up. */
  menuItems: number;
  lastOrderAt: number | null;
  /** Paid orders (something was charged, not voided) in the last SUPER_RECENT_DAYS days. */
  recentPaidOrders: number;
  recentSalesCents: number;
}

export interface SuperOrder extends AdminOrder {
  shop: { id: string; name: string; slug: string };
}

export interface SuperOrderPage {
  orders: SuperOrder[];
  /** Pass as ?before= to load the next (older) page; null when there are no more. */
  nextBefore: number | null;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}

// ---- Super admin: Cloudflare usage ----

/** Free plan limits. The daily ones are shared by every system on the account and reset at 00:00 UTC (8 AM Manila). */
export const FREE_LIMITS = {
  requests: 100_000,
  rowsRead: 5_000_000,
  rowsWritten: 100_000,
  databaseBytes: 500 * 1024 * 1024,
  accountStorageBytes: 5 * 1024 * 1024 * 1024,
} as const;

export interface UsageNumbers {
  requests: number;
  rowsRead: number;
  rowsWritten: number;
}

/** One app on the account (Tatak, NEXA): its Worker and its database. */
export interface UsageSystem extends UsageNumbers {
  name: string;
  /** Database size in bytes, or null when Cloudflare hasn't reported it. */
  databaseBytes: number | null;
}

export interface UsageReport {
  /** False until CF_ANALYTICS_TOKEN is set; then only Tatak's database size is shown. */
  configured: boolean;
  /** What went wrong asking Cloudflare, in plain words, or null. */
  error: string | null;
  fetchedAt: number;
  /** When today's counters go back to 0 (next 00:00 UTC). */
  resetsAt: number;
  /** Today, the whole account: this is what the daily limits count. */
  today: UsageNumbers;
  systems: UsageSystem[];
  /** All databases on the account together. */
  storageBytes: number;
  /** The last 7 days for the whole account, oldest first. */
  days: (UsageNumbers & { date: string })[];
}
