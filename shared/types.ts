// Shapes returned by the API. Shared by the Worker and the React app.
import type { CardColor, InkColor } from "./theme";

export type StampMode = "per_cup" | "per_order";

export interface PublicMenuItem {
  id: string;
  name: string;
  priceCents: number;
  earnsStamp: boolean;
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
}

export interface CardSummary {
  code: string;
  nickname: string | null;
  stamps: number;
  lifetimeStamps: number;
  rewardsRedeemed: number;
  isBlocked: boolean;
  createdAt: number;
}

export interface CardHistoryEntry {
  id: string;
  createdAt: number;
  isReward: boolean;
  status: "approved" | "voided";
  totalCents: number;
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
}

export interface SalesReport {
  range: { from: string; to: string; days: number };
  totals: ReportTotals;
  previous: { from: string; to: string; salesCents: number; paidOrders: number };
  items: { name: string; qty: number; salesCents: number; freeQty: number }[];
  hours: { hour: number; paidOrders: number; salesCents: number; itemsSold: number }[];
  days: { date: string; paidOrders: number; salesCents: number; itemsSold: number }[];
}

export interface AdminOrder {
  id: string;
  createdAt: number;
  status: "approved" | "voided";
  isReward: boolean;
  totalCents: number;
  itemCount: number;
  stampsAwarded: number;
  stampsUsed: number;
  /** "tap", "pin", or "admin" when the barista recorded it from his own phone. */
  approvedVia: string;
  card: { id: string; code: string; nickname: string | null };
  items: { name: string; qty: number; priceCents: number }[];
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

export interface ApiErrorBody {
  error: string;
  code?: string;
}
