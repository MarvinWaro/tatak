import { useState } from "react";
import { PLATFORM_TIMEZONE as TZ, type SuperOrder, type SuperOrderPage } from "../../../shared/types";
import { DayPicker } from "../../components/DayPicker";
import { api, errorMessage } from "../../lib/api";
import { cardLabel, dateKey, dayLabel, itemsText, peso, plural, stampEffect, timeOf } from "../../lib/format";
import { navigate, useSearch } from "../../lib/router";
import { useApi } from "../../lib/useApi";
import { useShops } from "./SuperLayout";

export function Transactions() {
  const shops = useShops();
  const shopId = useSearch().get("shop") ?? "";
  const today = dateKey(Date.now(), TZ);
  const [date, setDate] = useState(today);

  const pickShop = (id: string) =>
    navigate(id ? `/super/transactions?shop=${encodeURIComponent(id)}` : "/super/transactions", { replace: true });

  return (
    <div className="stack">
      <div className="spread wrap">
        <h1 className="page-title" style={{ margin: 0 }}>
          {dayLabel(date, today)}
        </h1>
        <DayPicker date={date} today={today} onChange={setDate} />
      </div>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="shop-filter">Shop</label>
        <select id="shop-filter" className="input" value={shopId} onChange={(e) => pickShop(e.target.value)}>
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {/* The key starts a fresh list (and paging) whenever the shop or day changes. */}
      <OrderList key={`${shopId}|${date}`} shopId={shopId} date={date} isToday={date === today} />
    </div>
  );
}

function OrderList({ shopId, date, isToday }: { shopId: string; date: string; isToday: boolean }) {
  const query = `/api/super/orders?from=${date}&to=${date}${shopId ? `&shop=${encodeURIComponent(shopId)}` : ""}`;
  const { data, error, loading } = useApi<SuperOrderPage>(query);
  const [more, setMore] = useState<SuperOrder[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null | undefined>(undefined);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orders = [...(data?.orders ?? []), ...more];
  const cursor = nextBefore === undefined ? data?.nextBefore : nextBefore;

  const loadMore = async () => {
    if (!cursor) return;
    setBusy(true);
    setMoreError(null);
    try {
      const page = await api<SuperOrderPage>(`${query}&before=${cursor}`);
      setMore((m) => [...m, ...page.orders]);
      setNextBefore(page.nextBefore);
    } catch (err) {
      setMoreError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="form-error">{error}</p>;
  if (loading && !data) return <div className="skeleton" style={{ height: 200 }} aria-busy="true" />;
  if (orders.length === 0) {
    return (
      <div className="panel empty">
        <h2 className="page-title" style={{ marginBottom: 0 }}>
          No transactions {isToday ? "yet today" : "on this day"}
        </h2>
        <p>Orders show up here as soon as a barista stamps them, at any shop.</p>
      </div>
    );
  }

  const paid = orders.filter((o) => o.status === "approved" && o.totalCents > 0);
  const total = paid.reduce((s, o) => s + o.totalCents, 0);

  return (
    <>
      <p className="muted">
        {plural(paid.length, "paid order", "paid orders")}, {peso(total)}
        {cursor ? " so far (more below)" : ""}.
      </p>
      <ul className="panel panel--flush divided" style={{ listStyle: "none", margin: 0 }}>
        {orders.map((o) => (
          <OrderRow key={o.id} order={o} showShop={!shopId} />
        ))}
      </ul>
      {moreError && <p className="form-error">{moreError}</p>}
      {cursor && (
        <button className="btn btn--ghost" onClick={loadMore} disabled={busy}>
          {busy ? "Loading…" : "Show older transactions"}
        </button>
      )}
    </>
  );
}

function OrderRow({ order, showShop }: { order: SuperOrder; showShop: boolean }) {
  const voided = order.status === "voided";
  return (
    <li className={`list-row ${voided ? "list-row--voided" : ""}`}>
      <span className="list-time">{timeOf(order.createdAt, TZ)}</span>
      <div className="list-main">
        {showShop && <div className="list-shop">{order.shop.name}</div>}
        <div style={{ fontWeight: 600 }}>{itemsText(order.items)}</div>
        <div className="small muted">
          {cardLabel(order.card)}, {stampEffect(order)}{" "}
          {order.isReward && <span className="tag tag--bond">Free drink</span>}{" "}
          {order.approvedVia === "admin" && <span className="tag tag--grey">Added by barista</span>}{" "}
          {voided && <span className="tag tag--danger">Voided</span>}
        </div>
      </div>
      <span className="list-amount">{order.totalCents > 0 ? peso(order.totalCents) : "Free"}</span>
    </li>
  );
}
