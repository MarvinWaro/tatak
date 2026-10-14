import { type CSSProperties, useEffect, useState } from "react";
import type { AdminCustomer } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { plural, whenOf } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useShop } from "./AdminLayout";

export function Customers() {
  const { shop } = useShop();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");

  // Search after the person stops typing for a moment.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, setData, error, loading } = useApi<AdminCustomer[]>(
    `/api/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );

  return (
    <div className="stack">
      <h1 className="page-title" style={{ marginBottom: 0 }}>
        Customers
      </h1>
      <div className="field">
        <label htmlFor="search">Find a customer</label>
        <div className="input-prefix">
          <span>
            <Icon name="search" />
          </span>
          <input
            id="search"
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
        <span className="field-hint">Search by name or by the card code shown on their phone.</span>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && !data ? (
        <div className="skeleton" style={{ height: 180 }} aria-busy="true" />
      ) : !data || data.length === 0 ? (
        <div className="panel empty">
          <p style={{ margin: 0 }}>
            {query
              ? `No customer matches "${query}".`
              : "No customers yet. Cards show up here after their first stamped order."}
          </p>
        </div>
      ) : (
        <ul className="panel panel--flush divided" style={{ listStyle: "none", margin: 0 }}>
          {data.map((c) => (
            <CustomerRow
              key={c.id}
              customer={c}
              required={shop.stampsRequired}
              timezone={shop.timezone}
              onChange={(next) => setData(data.map((x) => (x.id === next.id ? next : x)))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomerRow({
  customer,
  required,
  timezone,
  onChange,
}: {
  customer: AdminCustomer;
  required: number;
  timezone: string;
  onChange: (c: AdminCustomer) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adjust = async (delta: number) => {
    setBusy(true);
    setError(null);
    try {
      onChange(
        await api<AdminCustomer>(`/api/admin/customers/${customer.id}/adjust`, {
          method: "POST",
          body: { delta, note: note || undefined },
        }),
      );
      toast(delta > 0 ? `Added ${plural(delta, "stamp", "stamps")}` : `Removed ${plural(-delta, "stamp", "stamps")}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setBlocked = async (blocked: boolean) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await api<AdminCustomer>(`/api/admin/customers/${customer.id}/block`, { method: "POST", body: { blocked } }));
      toast(blocked ? "Card paused" : "Card active again");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li style={{ padding: "14px 16px" }}>
      <button
        className="spread"
        style={{ width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          <span style={{ fontWeight: 700 }}>{customer.nickname ?? "No name"}</span>{" "}
          <span className="muted small">card {customer.code}</span>{" "}
          {customer.isBlocked && <span className="tag tag--danger">Paused</span>}
          <span className="small muted" style={{ display: "block" }}>
            {customer.lastVisitAt ? `Last visit ${whenOf(customer.lastVisitAt, timezone)}` : "No visits yet"}
          </span>
        </span>
        <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <strong className="tnum">
            {customer.stamps}/{required}
          </strong>
          <span className="xsmall muted" style={{ display: "block" }}>
            {plural(customer.rewardsRedeemed, "free drink", "free drinks")}
          </span>
        </span>
      </button>

      {open && (
        <div className="stack" style={{ marginTop: 14, "--gap": "12px" } as CSSProperties}>
          <p className="small muted">
            {plural(customer.lifetimeStamps, "stamp", "stamps")} collected in total.
          </p>
          <div className="field">
            <label htmlFor={`note-${customer.id}`}>Reason for changing stamps (optional)</label>
            <input
              id={`note-${customer.id}`}
              className="input"
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. moved from paper card"
            />
          </div>
          <div className="row wrap">
            <button className="btn btn--sm" disabled={busy} onClick={() => adjust(1)}>
              <Icon name="plus" /> Add stamp
            </button>
            <button className="btn btn--sm btn--ghost" disabled={busy || customer.stamps === 0} onClick={() => adjust(-1)}>
              <Icon name="minus" /> Remove stamp
            </button>
            <button className="link-btn link-btn--danger" disabled={busy} onClick={() => setBlocked(!customer.isBlocked)}>
              {customer.isBlocked ? "Unpause card" : "Pause card"}
            </button>
          </div>
          {customer.isBlocked && <p className="small muted">A paused card can't get stamps or free drinks until you unpause it.</p>}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </li>
  );
}
