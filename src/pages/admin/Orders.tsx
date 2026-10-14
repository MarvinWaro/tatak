import { useState } from "react";
import type { AdminOrder } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { addDays, dateKey, formatDateKey, itemsText, peso, plural, timeOf } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useShop } from "./AdminLayout";

export function Orders() {
  const { shop } = useShop();
  const today = dateKey(Date.now(), shop.timezone);
  const [date, setDate] = useState(today);
  const { data, error, loading, reload } = useApi<{ orders: AdminOrder[]; nextBefore: number | null }>(
    `/api/admin/orders?from=${date}&to=${date}`,
  );
  const [more, setMore] = useState<AdminOrder[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null | undefined>(undefined);
  const orders = [...(data?.orders ?? []), ...more];
  const cursor = nextBefore === undefined ? data?.nextBefore : nextBefore;

  const changeDate = (next: string) => {
    setMore([]);
    setNextBefore(undefined);
    setDate(next);
  };

  const loadMore = async () => {
    if (!cursor) return;
    const page = await api<{ orders: AdminOrder[]; nextBefore: number | null }>(
      `/api/admin/orders?from=${date}&to=${date}&before=${cursor}`,
    );
    setMore((m) => [...m, ...page.orders]);
    setNextBefore(page.nextBefore);
  };

  const label = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : formatDateKey(date, true);
  const paid = orders.filter((o) => o.status === "approved" && !o.isReward);
  const total = paid.reduce((s, o) => s + o.totalCents, 0);

  return (
    <div className="stack">
      <div className="spread wrap">
        <h1 className="page-title" style={{ margin: 0 }}>
          {label}
        </h1>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" aria-label="Previous day" onClick={() => changeDate(addDays(date, -1))}>
            <Icon name="back" />
          </button>
          <label className="sr-only" htmlFor="order-date">
            Date
          </label>
          <input
            id="order-date"
            className="input"
            type="date"
            value={date}
            max={today}
            style={{ width: "auto" }}
            onChange={(e) => e.target.value && changeDate(e.target.value)}
          />
          <button
            className="icon-btn"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => changeDate(addDays(date, 1))}
            style={{ transform: "scaleX(-1)" }}
          >
            <Icon name="back" />
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && !data ? (
        <div className="skeleton" style={{ height: 200 }} aria-busy="true" />
      ) : orders.length === 0 ? (
        <div className="panel empty">
          <h2 className="page-title" style={{ marginBottom: 0 }}>
            No orders {date === today ? "yet today" : "on this day"}
          </h2>
          <p>When you hold to stamp on a customer's phone, the order appears here with the time.</p>
        </div>
      ) : (
        <>
          <p className="muted">
            {plural(paid.length, "paid order", "paid orders")}, {peso(total)}
            {cursor ? " so far (more below)" : ""}.
          </p>
          <ul className="panel panel--flush divided" style={{ listStyle: "none", margin: 0 }}>
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} timezone={shop.timezone} onChanged={reload} />
            ))}
          </ul>
          {cursor && (
            <button className="btn btn--ghost" onClick={loadMore}>
              Show older orders
            </button>
          )}
        </>
      )}
    </div>
  );
}

function OrderRow({ order, timezone, onChanged }: { order: AdminOrder; timezone: string; onChanged: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = order.card.nickname ? `${order.card.nickname} (${order.card.code})` : `Card ${order.card.code}`;
  const voided = order.status === "voided";

  const voidOrder = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/orders/${order.id}/void`, { method: "POST" });
      toast("Order voided");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const effect = order.isReward
    ? `Used ${order.stampsUsed} stamps`
    : order.stampsAwarded > 0
      ? `+${plural(order.stampsAwarded, "stamp", "stamps")}`
      : "No stamps";

  return (
    <li className={`list-row ${voided ? "list-row--voided" : ""}`}>
      <span className="list-time">{timeOf(order.createdAt, timezone)}</span>
      <div className="list-main">
        <div style={{ fontWeight: 600 }}>{itemsText(order.items)}</div>
        <div className="small muted">
          {who}, {effect}{" "}
          {order.isReward && <span className="tag tag--bond">Free drink</span>}{" "}
          {voided && <span className="tag tag--danger">Voided</span>}
        </div>
      </div>
      <span className="list-amount">{order.isReward ? "Free" : peso(order.totalCents)}</span>
      {!voided && (
        <div className="list-actions">
          {!confirming ? (
            <button className="link-btn link-btn--danger" onClick={() => setConfirming(true)}>
              Void
            </button>
          ) : (
            <div className="confirm">
              <p className="small">
                {order.isReward
                  ? `Void this free drink? ${order.stampsUsed} stamps go back to ${who}.`
                  : `Void this ${peso(order.totalCents)} order? It's removed from sales${
                      order.stampsAwarded > 0
                        ? ` and ${plural(order.stampsAwarded, "stamp", "stamps")} ${order.stampsAwarded === 1 ? "comes" : "come"} off ${who}`
                        : ""
                    }.`}
              </p>
              {error && <p className="form-error">{error}</p>}
              <div className="row">
                <button className="btn btn--danger btn--sm" onClick={voidOrder} disabled={busy}>
                  {busy ? "Voiding…" : "Void order"}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep order
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
