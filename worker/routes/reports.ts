// Sales report, order log, CSV export, and voiding orders.
import type { AdminOrder, SalesReport } from "../../shared/types";
import { requireShop } from "../auth";
import { HttpError, json } from "../http";
import type { Router } from "../router";
import { addDays, daysBetween, isDateString, localDate, localMidnight, offsetMinutes } from "../time";

const MAX_RANGE_DAYS = 366;
const TOP_BUYERS = 10;

interface Range {
  from: string;
  to: string;
  start: number; // UTC ms, inclusive
  end: number; // UTC ms, exclusive
  days: number;
}

/** Reads ?from=YYYY-MM-DD&to=YYYY-MM-DD (dates in `timezone`, inclusive). Defaults to today. */
export function readRange(url: URL, timezone: string): Range {
  const today = localDate(Date.now(), timezone);
  const from = url.searchParams.get("from") ?? today;
  const to = url.searchParams.get("to") ?? from;
  if (!isDateString(from) || !isDateString(to)) throw new HttpError(400, "Use dates like 2026-10-14.");
  if (to < from) throw new HttpError(400, "The end date is before the start date.");
  const days = daysBetween(from, to) + 1;
  if (days > MAX_RANGE_DAYS) throw new HttpError(400, "Pick a range of one year or less.");
  return {
    from,
    to,
    days,
    start: localMidnight(from, timezone),
    end: localMidnight(addDays(to, 1), timezone),
  };
}

const TOTALS_SQL = `SELECT
    COALESCE(SUM(total_cents), 0) AS sales,
    COALESCE(SUM(CASE WHEN total_cents > 0 THEN 1 ELSE 0 END), 0) AS paid_orders,
    COALESCE(SUM(item_count), 0) AS items,
    COALESCE(SUM(stamps_awarded), 0) AS stamps,
    COALESCE(SUM(is_reward), 0) AS free_cups,
    COUNT(DISTINCT card_id) AS customers,
    COALESCE(SUM(discount_cents), 0) AS discounts,
    COUNT(promo_step) AS promos
  FROM orders WHERE shop_id = ? AND status = 'approved' AND created_at >= ? AND created_at < ?`;

export interface OrderRow {
  id: string;
  created_at: number;
  status: "approved" | "voided";
  is_reward: number;
  total_cents: number;
  discount_cents: number;
  promo_step: number | null;
  item_count: number;
  stamps_awarded: number;
  stamps_used: number;
  approved_via: string;
  card_id: string;
  code: string;
  nickname: string | null;
}

export interface OrderItemRow {
  order_id: string;
  name: string;
  qty: number;
  price_cents: number;
}

/** Joins one page of orders with their items, in the shape the order lists show. */
export function toAdminOrders(rows: OrderRow[], items: OrderItemRow[]): AdminOrder[] {
  const byOrder = new Map<string, AdminOrder["items"]>();
  for (const it of items) {
    const list = byOrder.get(it.order_id) ?? [];
    list.push({ name: it.name, qty: it.qty, priceCents: it.price_cents });
    byOrder.set(it.order_id, list);
  }
  return rows.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    status: o.status,
    isReward: o.is_reward === 1,
    totalCents: o.total_cents,
    discountCents: o.discount_cents,
    promoStep: o.promo_step,
    itemCount: o.item_count,
    stampsAwarded: o.stamps_awarded,
    stampsUsed: o.stamps_used,
    approvedVia: o.approved_via,
    card: { id: o.card_id, code: o.code, nickname: o.nickname },
    items: byOrder.get(o.id) ?? [],
  }));
}

export function reportRoutes(router: Router): void {
  router.get("/api/admin/report", async ({ env, req, url }) => {
    const shop = await requireShop(env, req);
    const r = readRange(url, shop.timezone);
    const prevFrom = addDays(r.from, -r.days);
    const prevTo = addDays(r.from, -1);
    const offsetSec = offsetMinutes(r.start, shop.timezone) * 60;

    const [totals, prev, items, hours, days, buyers] = await env.DB.batch([
      env.DB.prepare(TOTALS_SQL).bind(shop.id, r.start, r.end),
      env.DB.prepare(TOTALS_SQL).bind(shop.id, localMidnight(prevFrom, shop.timezone), r.start),
      env.DB.prepare(
        `SELECT oi.name AS name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price_cents) AS sales,
                SUM(CASE WHEN oi.is_free = 1 THEN oi.qty ELSE 0 END) AS free_qty
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.shop_id = ? AND o.status = 'approved' AND o.created_at >= ? AND o.created_at < ?
         GROUP BY oi.name ORDER BY qty DESC, sales DESC`,
      ).bind(shop.id, r.start, r.end),
      env.DB.prepare(
        `SELECT CAST(((created_at / 1000 + ?) % 86400) / 3600 AS INTEGER) AS hour,
                SUM(CASE WHEN total_cents > 0 THEN 1 ELSE 0 END) AS paid_orders,
                SUM(total_cents) AS sales, SUM(item_count) AS items
         FROM orders WHERE shop_id = ? AND status = 'approved' AND created_at >= ? AND created_at < ?
         GROUP BY hour ORDER BY hour`,
      ).bind(offsetSec, shop.id, r.start, r.end),
      env.DB.prepare(
        `SELECT CAST((created_at / 1000 + ?) / 86400 AS INTEGER) AS day,
                SUM(CASE WHEN total_cents > 0 THEN 1 ELSE 0 END) AS paid_orders,
                SUM(total_cents) AS sales, SUM(item_count) AS items
         FROM orders WHERE shop_id = ? AND status = 'approved' AND created_at >= ? AND created_at < ?
         GROUP BY day ORDER BY day`,
      ).bind(offsetSec, shop.id, r.start, r.end),
      env.DB.prepare(
        `SELECT c.id, c.code, c.nickname, c.stamps, COUNT(*) AS visits, SUM(o.item_count) AS items,
                SUM(o.total_cents) AS spent, MAX(o.created_at) AS last_at
         FROM orders o JOIN cards c ON c.id = o.card_id
         WHERE o.shop_id = ? AND o.status = 'approved' AND o.created_at >= ? AND o.created_at < ?
         GROUP BY o.card_id ORDER BY spent DESC, last_at DESC LIMIT ?`,
      ).bind(shop.id, r.start, r.end, TOP_BUYERS),
    ]);

    type Totals = {
      sales: number;
      paid_orders: number;
      items: number;
      stamps: number;
      free_cups: number;
      customers: number;
      discounts: number;
      promos: number;
    };
    type BuyerRow = {
      id: string;
      code: string;
      nickname: string | null;
      stamps: number;
      visits: number;
      items: number;
      spent: number;
      last_at: number;
    };
    type Bucket = { paid_orders: number; sales: number; items: number };
    const t = totals.results[0] as Totals;
    const p = prev.results[0] as Totals;

    const report: SalesReport = {
      range: { from: r.from, to: r.to, days: r.days },
      totals: {
        salesCents: t.sales,
        paidOrders: t.paid_orders,
        itemsSold: t.items,
        stampsGiven: t.stamps,
        freeCups: t.free_cups,
        customers: t.customers,
        discountsCents: t.discounts,
        promosUsed: t.promos,
      },
      previous: { from: prevFrom, to: prevTo, salesCents: p.sales, paidOrders: p.paid_orders },
      items: (items.results as { name: string; qty: number; sales: number; free_qty: number }[]).map((i) => ({
        name: i.name,
        qty: i.qty,
        salesCents: i.sales,
        freeQty: i.free_qty,
      })),
      hours: (hours.results as (Bucket & { hour: number })[]).map((h) => ({
        hour: h.hour,
        paidOrders: h.paid_orders,
        salesCents: h.sales,
        itemsSold: h.items,
      })),
      days: (days.results as (Bucket & { day: number })[]).map((d) => ({
        date: new Date(d.day * 86400000).toISOString().slice(0, 10),
        paidOrders: d.paid_orders,
        salesCents: d.sales,
        itemsSold: d.items,
      })),
      buyers: (buyers.results as BuyerRow[]).map((b) => ({
        id: b.id,
        code: b.code,
        nickname: b.nickname,
        visits: b.visits,
        itemsBought: b.items,
        spentCents: b.spent,
        lastAt: b.last_at,
        stamps: b.stamps,
      })),
    };
    return json(report);
  });

  router.get("/api/admin/orders", async ({ env, req, url }) => {
    const shop = await requireShop(env, req);
    const r = readRange(url, shop.timezone);
    const before = Number(url.searchParams.get("before")) || r.end;
    const end = Math.min(before, r.end);
    const limit = 100;

    const [orders, items] = await env.DB.batch([
      env.DB.prepare(
        `SELECT o.id, o.created_at, o.status, o.is_reward, o.total_cents, o.discount_cents, o.promo_step,
                o.item_count, o.stamps_awarded, o.stamps_used, o.approved_via, o.card_id, c.code, c.nickname
         FROM orders o JOIN cards c ON c.id = o.card_id
         WHERE o.shop_id = ? AND o.created_at >= ? AND o.created_at < ?
         ORDER BY o.created_at DESC LIMIT ?`,
      ).bind(shop.id, r.start, end, limit),
      env.DB.prepare(
        `SELECT order_id, name, qty, price_cents FROM order_items WHERE order_id IN
           (SELECT id FROM orders WHERE shop_id = ? AND created_at >= ? AND created_at < ?
            ORDER BY created_at DESC LIMIT ?)`,
      ).bind(shop.id, r.start, end, limit),
    ]);

    const rows = orders.results as OrderRow[];
    const list = toAdminOrders(rows, items.results as OrderItemRow[]);
    const nextBefore = rows.length === limit ? rows[rows.length - 1].created_at : null;
    return json({ orders: list, nextBefore });
  });

  router.get("/api/admin/orders.csv", async ({ env, req, url }) => {
    const shop = await requireShop(env, req);
    const r = readRange(url, shop.timezone);
    const rows = await env.DB.prepare(
      `SELECT o.id, o.created_at, o.status, oi.is_free, o.promo_step, o.stamps_awarded, c.code, c.nickname,
              oi.name, oi.qty, oi.price_cents
       FROM orders o JOIN cards c ON c.id = o.card_id JOIN order_items oi ON oi.order_id = o.id
       WHERE o.shop_id = ? AND o.created_at >= ? AND o.created_at < ?
       ORDER BY o.created_at, o.id LIMIT 20000`,
    )
      .bind(shop.id, r.start, r.end)
      .all<{
        id: string;
        created_at: number;
        status: string;
        is_free: number;
        promo_step: number | null;
        stamps_awarded: number;
        code: string;
        nickname: string | null;
        name: string;
        qty: number;
        price_cents: number;
      }>();

    const timeFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: shop.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const cell = (v: unknown) => {
      let s = String(v ?? "");
      // Stop spreadsheet apps from running text that starts like a formula.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      ["Date", "Time", "Order", "Card", "Customer", "Item", "Qty", "Unit price", "Line total", "Free reward", "Promo", "Status"].join(","),
      ...rows.results.map((row) =>
        [
          localDate(row.created_at, shop.timezone),
          timeFmt.format(new Date(row.created_at)),
          row.id,
          row.code,
          row.nickname ?? "",
          row.name,
          row.qty,
          (row.price_cents / 100).toFixed(2),
          ((row.price_cents * row.qty) / 100).toFixed(2),
          row.is_free ? "yes" : "no",
          row.promo_step === null ? "" : `stamp ${row.promo_step}`,
          row.status,
        ]
          .map(cell)
          .join(","),
      ),
    ];
    const filename = `${shop.slug}-orders-${r.from}${r.to !== r.from ? `-to-${r.to}` : ""}.csv`;
    return new Response(`﻿${lines.join("\r\n")}\r\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  });

  router.post("/api/admin/orders/:id/void", async ({ env, req, params }) => {
    const shop = await requireShop(env, req);
    const order = await env.DB.prepare(
      "SELECT id, card_id, status, is_reward, stamps_awarded, stamps_used FROM orders WHERE id = ? AND shop_id = ?",
    )
      .bind(params.id, shop.id)
      .first<{ id: string; card_id: string; status: string; is_reward: number; stamps_awarded: number; stamps_used: number }>();
    if (!order) throw new HttpError(404, "Order not found.");
    if (order.status === "voided") throw new HttpError(409, "This order is already voided.");

    const now = Date.now();
    // Undoes both halves of an order: the stamps it added, and the stamps its free item used
    // (which gives the free item back). Only runs if this request is the one that voided it.
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = 'voided', voided_at = ? WHERE id = ? AND status = 'approved'").bind(
        now,
        order.id,
      ),
      env.DB.prepare(
        `UPDATE cards SET stamps = MAX(0, stamps - ?1 + ?2), lifetime_stamps = MAX(0, lifetime_stamps - ?1),
           rewards_redeemed = MAX(0, rewards_redeemed - ?3)
         WHERE id = ?4 AND EXISTS (SELECT 1 FROM orders WHERE id = ?5 AND voided_at = ?6)`,
      ).bind(order.stamps_awarded, order.stamps_used, order.is_reward, order.card_id, order.id, now),
    ]);
    return json({ ok: true });
  });
}
