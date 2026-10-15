// Promo rules shared by the Worker and the app, so the price the customer sees
// is exactly the price the server saves.
import type { Promo } from "./types";

/**
 * The promo the card can use on its next order: the earliest one it has reached and not used
 * in this round. A round ends when the free reward is claimed.
 */
export function readyPromo(promos: Promo[], stamps: number, used: number[]): Promo | null {
  return promos.find((p) => stamps >= p.step && !used.includes(p.step)) ?? null;
}

/** Centavos taken off one unit of an item. */
export function promoDiscount(priceCents: number, percentOff: number): number {
  return Math.round((priceCents * percentOff) / 100);
}

/** Preset promos the owner can pick in Settings. */
export const PROMO_PRESETS = [
  { label: "50% off", percentOff: 50 },
  { label: "Free", percentOff: 100 },
] as const;
