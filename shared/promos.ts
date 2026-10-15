// Promo rules shared by the Worker and the app, so the price the customer sees
// is exactly the price the server saves.
import type { Promo } from "./types";

/**
 * The promo an order can use: the earliest one not used in this round that the card reaches,
 * counting this order's stamps. So at 4 stamps, an order of 2 cups reaches a stamp-5 promo
 * right away. Pass the card's current stamps alone to get the promo that is ready before ordering.
 * A round ends when the free reward is claimed.
 */
export function readyPromo(promos: Promo[], stampsAfter: number, used: number[]): Promo | null {
  return promos.find((p) => stampsAfter >= p.step && !used.includes(p.step)) ?? null;
}

/**
 * When this order is the one that reaches the promo stamp, the discount goes on a cup that lands
 * on that stamp, so it must be an item that earns a stamp. A promo reached on an earlier visit
 * and saved for later can go on any item.
 */
export const promoNeedsStampItem = (promo: Promo, stampsBefore: number): boolean => stampsBefore < promo.step;

/** Centavos taken off one unit of an item. */
export function promoDiscount(priceCents: number, percentOff: number): number {
  return Math.round((priceCents * percentOff) / 100);
}

/** Preset promos the owner can pick in Settings. */
export const PROMO_PRESETS = [
  { label: "50% off", percentOff: 50 },
  { label: "Free", percentOff: 100 },
] as const;
