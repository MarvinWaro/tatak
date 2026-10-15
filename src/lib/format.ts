const pesoWhole = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const pesoCents = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₱120, or ₱45.50 when there are centavos. */
export function peso(cents: number): string {
  return cents % 100 === 0 ? pesoWhole.format(cents / 100) : pesoCents.format(cents / 100);
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;
}

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-PH", { timeZone: tz, ...options });
    cache.set(key, f);
  }
  return f;
}

export const timeOf = (ms: number, tz: string) => fmt(tz, { hour: "numeric", minute: "2-digit" }).format(ms);

export const dayOf = (ms: number, tz: string) => fmt(tz, { month: "short", day: "numeric" }).format(ms);

/** "Oct 14, 2026". */
export const dateOf = (ms: number, tz: string) =>
  fmt(tz, { month: "short", day: "numeric", year: "numeric" }).format(ms);

/** "YYYY-MM-DD" in the shop's time zone. */
export function dateKey(ms: number, tz: string): string {
  const parts = fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or "Oct 12". */
export function relativeDay(ms: number, tz: string): string {
  const key = dateKey(ms, tz);
  const today = dateKey(Date.now(), tz);
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return dayOf(ms, tz);
}

export const whenOf = (ms: number, tz: string) => `${relativeDay(ms, tz)}, ${timeOf(ms, tz)}`;

/** "Oct 14" or "Mon, Oct 14" from a YYYY-MM-DD string. */
export function formatDateKey(date: string, withWeekday = false): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  }).format(Date.UTC(y, m - 1, d));
}

/** "Today", "Yesterday", or "Mon, Oct 12" from a YYYY-MM-DD string. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDateKey(date, true);
}

export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "a" : "p"}`;
}

export function itemsText(items: { name: string; qty: number }[]): string {
  return items.map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(", ");
}

/** "Ana (K7Q4MZ)" or "Card K7Q4MZ". */
export function cardLabel(card: { code: string; nickname: string | null }): string {
  return card.nickname ? `${card.nickname} (${card.code})` : `Card ${card.code}`;
}

/** What an order did to the card: "+2 stamps", "Used 10 stamps" or "No stamps". */
export function stampEffect(order: { isReward: boolean; stampsUsed: number; stampsAwarded: number }): string {
  if (order.isReward) return `Used ${order.stampsUsed} stamps`;
  return order.stampsAwarded > 0 ? `+${plural(order.stampsAwarded, "stamp", "stamps")}` : "No stamps";
}
