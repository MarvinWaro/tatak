import type { Env } from "./env";
import { HttpError, getCookie, serializeCookie } from "./http";
import { randomToken, sha256Hex } from "./ids";

// PBKDF2 iterations. The Workers free plan allows about 10 ms of CPU per request,
// so this stays modest (~4 ms). The count is saved inside each hash, so you can
// raise it later (for example on the paid plan) without breaking old passwords.
const PBKDF2_ITERATIONS = 20_000;

export const SESSION_COOKIE = "tatak_session";
const SESSION_DAYS = 30;

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iter || !salt || !hash) return false;
  const expected = fromB64(hash);
  const actual = await pbkdf2(password, fromB64(salt), Number(iter));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function createSession(env: Env, req: Request, shopId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, shop_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await sha256Hex(token), shopId, now + SESSION_DAYS * 86400000, now)
    .run();
  return serializeCookie(req, SESSION_COOKIE, token, SESSION_DAYS * 86400);
}

export async function destroySession(env: Env, req: Request): Promise<string> {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  }
  return serializeCookie(req, SESSION_COOKIE, "", 0);
}

export interface ShopRow {
  id: string;
  slug: string;
  name: string;
  email: string;
  password_hash: string;
  timezone: string;
  stamps_required: number;
  reward_text: string;
  stamp_mode: "per_cup" | "per_order";
  cooldown_minutes: number;
  max_stamps_per_day: number;
  open_time: string | null;
  close_time: string | null;
  failed_logins: number;
  locked_until: number;
  pin_hash: string | null;
  require_pin: number;
  pin_fail_count: number;
  pin_fail_window_start: number;
  card_color: string;
  ink_color: string;
  logo_version: number;
  created_at: number;
}

/** The logged-in shop for admin routes. Throws 401 when the session is missing or expired. */
export async function requireShop(env: Env, req: Request): Promise<ShopRow> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) throw new HttpError(401, "Log in to continue.", "unauthenticated");
  const shop = await env.DB.prepare(
    `SELECT shops.* FROM sessions JOIN shops ON shops.id = sessions.shop_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<ShopRow>();
  if (!shop) throw new HttpError(401, "Your session ended. Log in again.", "unauthenticated");
  return shop;
}

// ---- Super admin ----
// Separate accounts (super_admins) and sessions (super_sessions), made with `npm run superadmin`.
// The cookie is only sent to /api/super/*, and lasts a week instead of a month.

const SUPER_COOKIE = "tatak_super";
const SUPER_COOKIE_PATH = "/api/super";
const SUPER_SESSION_DAYS = 7;

export interface SuperAdmin {
  id: string;
  name: string;
  email: string;
}

export async function createSuperSession(env: Env, req: Request, superAdminId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO super_sessions (token_hash, super_admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await sha256Hex(token), superAdminId, now + SUPER_SESSION_DAYS * 86400000, now)
    .run();
  return serializeCookie(req, SUPER_COOKIE, token, SUPER_SESSION_DAYS * 86400, SUPER_COOKIE_PATH);
}

export async function destroySuperSession(env: Env, req: Request): Promise<string> {
  const token = getCookie(req, SUPER_COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM super_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  }
  return serializeCookie(req, SUPER_COOKIE, "", 0, SUPER_COOKIE_PATH);
}

/** The logged-in super admin for /api/super/* routes. Throws 401 when the session is missing or expired. */
export async function requireSuperAdmin(env: Env, req: Request): Promise<SuperAdmin> {
  const token = getCookie(req, SUPER_COOKIE);
  if (!token) throw new HttpError(401, "Log in to continue.", "unauthenticated");
  const admin = await env.DB.prepare(
    `SELECT super_admins.id, super_admins.name, super_admins.email
     FROM super_sessions JOIN super_admins ON super_admins.id = super_sessions.super_admin_id
     WHERE super_sessions.token_hash = ? AND super_sessions.expires_at > ?`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<SuperAdmin>();
  if (!admin) throw new HttpError(401, "Your session ended. Log in again.", "unauthenticated");
  return admin;
}
