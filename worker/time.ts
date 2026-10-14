// Time zone helpers. Everything is stored in UTC milliseconds; reports and
// opening hours use the shop's own time zone (Asia/Manila by default).

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(ms: number, tz: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Minutes the zone is ahead of UTC at that instant (Manila: 480). */
export function offsetMinutes(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - (ms - (ms % 1000))) / 60000);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** UTC milliseconds of local midnight at the start of `date` (YYYY-MM-DD) in `tz`. */
export function localMidnight(date: string, tz: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Bad date: ${date}`);
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  let guess = naive - offsetMinutes(naive, tz) * 60000;
  // Re-check once in case the offset differs at the guessed instant (DST zones).
  guess = naive - offsetMinutes(guess, tz) * 60000;
  return guess;
}

export function localDate(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Bad date: ${date}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(...ymd(to)) - Date.UTC(...ymd(from))) / 86400000);
}

function ymd(date: string): [number, number, number] {
  const m = DATE_RE.exec(date)!;
  return [+m[1], +m[2] - 1, +m[3]];
}

/** Start of the local day containing `ms`, in UTC milliseconds. */
export function startOfLocalDay(ms: number, tz: string): number {
  return localMidnight(localDate(ms, tz), tz);
}

/** Minutes since local midnight. */
export function localMinuteOfDay(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return p.hour * 60 + p.minute;
}

export function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(ms),
  );
}

export function formatHHMM(value: string): string {
  const minutes = parseHHMM(value);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
