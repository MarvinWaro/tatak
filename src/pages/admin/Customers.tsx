import { type CSSProperties, useEffect, useState } from "react";
import { promoDiscount, promoNeedsStampItem, readyPromo } from "../../../shared/promos";
import type { AdminCustomer, AdminMenuItem, CustomerPromos, StampMode } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { peso, plural, whenOf } from "../../lib/format";
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
  // The menu is needed for "Record a purchase".
  const { data: menu } = useApi<AdminMenuItem[]>("/api/admin/menu");

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
              : "No customers yet. Cards show up here after their first stamped order. To find a new card, search for its name or code."}
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
              stampMode={shop.stampMode}
              menu={menu ?? []}
              onChange={(next) => setData(data.map((x) => (x.id === next.id ? next : x)))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type Panel = "none" | "purchase" | "stamps";

function CustomerRow({
  customer,
  required,
  timezone,
  stampMode,
  menu,
  onChange,
}: {
  customer: AdminCustomer;
  required: number;
  timezone: string;
  stampMode: StampMode;
  menu: AdminMenuItem[];
  onChange: (c: AdminCustomer) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <p className="small muted">{plural(customer.lifetimeStamps, "stamp", "stamps")} collected in total.</p>

          {panel === "none" && (
            <div className="row wrap">
              <button className="btn btn--sm" onClick={() => setPanel("purchase")} disabled={menu.length === 0}>
                <Icon name="receipt" /> Record a purchase
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => setPanel("stamps")}>
                Add stamps only
              </button>
            </div>
          )}
          {panel === "none" && menu.length === 0 && (
            <p className="small muted">Add drinks in Menu first to record purchases.</p>
          )}

          {panel === "purchase" && (
            <RecordPurchase
              customer={customer}
              menu={menu}
              stampMode={stampMode}
              required={required}
              onCancel={() => setPanel("none")}
              onSaved={(next, stampsAdded, totalCents) => {
                onChange(next);
                setPanel("none");
                toast(`Purchase saved: ${peso(totalCents)}, +${plural(stampsAdded, "stamp", "stamps")}`);
              }}
            />
          )}

          {panel === "stamps" && (
            <StampsOnly customer={customer} onCancel={() => setPanel("none")} onChange={onChange} />
          )}

          <div className="row wrap">
            <button className="link-btn link-btn--danger" disabled={busy} onClick={() => setBlocked(!customer.isBlocked)}>
              {customer.isBlocked ? "Unpause card" : "Pause card"}
            </button>
          </div>
          {customer.isBlocked && (
            <p className="small muted">A paused card can't get stamps or free drinks from the customer's phone.</p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </li>
  );
}

/** "YYYY-MM-DDTHH:MM" in the phone's own time, for a datetime-local input. */
function localInputValue(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

/** The item picked in a select, or else the priciest one. */
function pickItem(items: AdminMenuItem[], pickedId: string | null): AdminMenuItem | null {
  if (items.length === 0) return null;
  return items.find((m) => m.id === pickedId) ?? items.reduce((a, b) => (b.priceCents > a.priceCents ? b : a));
}

/** A real purchase: counts in Sales and adds stamps. */
function RecordPurchase({
  customer,
  menu,
  stampMode,
  required,
  onCancel,
  onSaved,
}: {
  customer: AdminCustomer;
  menu: AdminMenuItem[];
  stampMode: StampMode;
  /** Boxes on the card; the last one is free. */
  required: number;
  onCancel: () => void;
  onSaved: (c: AdminCustomer, stampsAdded: number, totalCents: number) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [when, setWhen] = useState<"now" | "earlier">("now");
  const [at, setAt] = useState(() => localInputValue(Date.now() - 3600000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The shop's promos and this customer's used ones. The server checks the promo again when saving.
  const { data: promoState } = useApi<CustomerPromos>(`/api/admin/customers/${customer.id}/promos`);
  const [usePromo, setUsePromo] = useState(false);
  const [promoItemId, setPromoItemId] = useState<string | null>(null);
  const [useFree, setUseFree] = useState(false);
  const [freeItemId, setFreeItemId] = useState<string | null>(null);

  const lines = menu.filter((m) => (qty[m.id] ?? 0) > 0);
  const count = lines.reduce((s, m) => s + qty[m.id], 0);
  const stampItems = lines.reduce((s, m) => s + (m.earnsStamp ? qty[m.id] : 0), 0);
  const stamps = stampMode === "per_cup" ? stampItems : stampItems > 0 ? 1 : 0;
  // Counts this purchase's stamps, like the customer's phone: at 4 stamps, 2 cups reach a stamp-5
  // promo, and at 9 stamps on a 10-box card the next cup lands on the free box.
  const stampsBefore = promoState?.stamps ?? customer.stamps;
  const stampsAfter = stampsBefore + stamps;
  const stampLines = lines.filter((m) => m.earnsStamp);
  const freeOffered = promoState !== null && stampsAfter >= required && stampLines.length > 0;
  const freeItem = freeOffered && useFree ? pickItem(stampLines, freeItemId) : null;
  const reached = promoState ? readyPromo(promoState.promos, stampsAfter, promoState.used) : null;
  const promoLines = reached
    ? (promoNeedsStampItem(reached, stampsBefore) ? stampLines : lines).filter(
        (m) => !(freeItem && m.id === freeItem.id && qty[m.id] < 2),
      )
    : [];
  const promo = reached && (reached.percentOff === 0 || promoLines.length > 0) ? reached : null;
  const promoItem = promo && usePromo && promo.percentOff > 0 ? pickItem(promoLines, promoItemId) : null;
  const discount = promo && promoItem ? promoDiscount(promoItem.priceCents, promo.percentOff) : 0;
  const total = lines.reduce((s, m) => s + qty[m.id] * m.priceCents, 0) - discount - (freeItem?.priceCents ?? 0);
  const change = (id: string, d: number) =>
    setQty({ ...qty, [id]: Math.max(0, Math.min(20, (qty[id] ?? 0) + d)) });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const time = when === "now" ? undefined : new Date(at).getTime();
      if (time !== undefined && Number.isNaN(time)) throw new Error("Pick the date and time of the purchase.");
      const res = await api<{ customer: AdminCustomer; stampsAdded: number; totalCents: number }>(
        `/api/admin/customers/${customer.id}/orders`,
        {
          method: "POST",
          body: {
            items: lines.map((m) => ({ id: m.id, qty: qty[m.id] })),
            at: time,
            promo: promo && usePromo ? { itemId: promoItem?.id } : undefined,
            reward: freeItem ? { itemId: freeItem.id } : undefined,
          },
        },
      );
      onSaved(res.customer, res.stampsAdded, res.totalCents);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="subpanel stack" style={{ "--gap": "12px" } as CSSProperties}>
      <div>
        <h3 className="subpanel-title">Record a purchase</h3>
        <p className="small muted">For when the customer can't use their phone. It counts in Sales and adds stamps.</p>
      </div>
      <ul className="menu-list" style={{ margin: 0 }}>
        {menu.map((m) => {
          const n = qty[m.id] ?? 0;
          return (
            <li key={m.id} className={`menu-row menu-row--compact ${n > 0 ? "menu-row--picked" : ""}`}>
              <div>
                <div className="menu-name">{m.name}</div>
                <div className="menu-meta">
                  {peso(m.priceCents)}
                  {!m.earnsStamp && ", no stamp"}
                </div>
              </div>
              <div className="stepper" role="group" aria-label={`${m.name} quantity`}>
                {n > 0 && (
                  <>
                    <button type="button" onClick={() => change(m.id, -1)} aria-label={`Remove one ${m.name}`}>
                      <Icon name="minus" />
                    </button>
                    <output>{n}</output>
                  </>
                )}
                <button type="button" className="plus" onClick={() => change(m.id, 1)} aria-label={`Add one ${m.name}`}>
                  <Icon name="plus" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {freeOffered && (
        <div className="stack" style={{ "--gap": "8px" } as CSSProperties}>
          <label className="check" style={{ padding: "4px 0" }}>
            <input type="checkbox" checked={useFree} onChange={(e) => setUseFree(e.target.checked)} />
            <span>
              Give their free drink
              <span className="field-hint" style={{ display: "block" }}>
                This purchase reaches box {required}, the free one. One item that earns a stamp is free, and the card
                starts over.
              </span>
            </span>
          </label>
          {useFree && stampLines.length > 1 && (
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor={`free-item-${customer.id}`}>Which one is free?</label>
              <select
                id={`free-item-${customer.id}`}
                className="input"
                value={freeItem?.id ?? ""}
                onChange={(e) => setFreeItemId(e.target.value)}
              >
                {stampLines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}: −{peso(m.priceCents)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {promo && (
        <div className="stack" style={{ "--gap": "8px" } as CSSProperties}>
          <label className="check" style={{ padding: "4px 0" }}>
            <input type="checkbox" checked={usePromo} onChange={(e) => setUsePromo(e.target.checked)} />
            <span>
              Use their {promo.label}
              <span className="field-hint" style={{ display: "block" }}>
                {stampsBefore < promo.step && `This purchase reaches stamp ${promo.step}. `}
                {promo.percentOff > 0
                  ? "On one item. It doesn't use up stamps."
                  : "You give it by hand. The price doesn't change."}
              </span>
            </span>
          </label>
          {usePromo && promo.percentOff > 0 && promoLines.length > 1 && (
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor={`promo-item-${customer.id}`}>Which item gets the {promo.label}?</label>
              <select
                id={`promo-item-${customer.id}`}
                className="input"
                value={promoItem?.id ?? ""}
                onChange={(e) => setPromoItemId(e.target.value)}
              >
                {promoLines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}: −{peso(promoDiscount(m.priceCents, promo.percentOff))}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <fieldset className="when-group">
        <legend className="field-label">When was it bought?</legend>
        <label className="check" style={{ minHeight: 36, padding: "4px 0" }}>
          <input type="radio" name={`when-${customer.id}`} checked={when === "now"} onChange={() => setWhen("now")} />
          <span>Just now</span>
        </label>
        <label className="check" style={{ minHeight: 36, padding: "4px 0" }}>
          <input type="radio" name={`when-${customer.id}`} checked={when === "earlier"} onChange={() => setWhen("earlier")} />
          <span>Earlier</span>
        </label>
        {when === "earlier" && (
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor={`at-${customer.id}`}>Date and time</label>
            <input
              id={`at-${customer.id}`}
              className="input"
              type="datetime-local"
              value={at}
              max={localInputValue(Date.now())}
              onChange={(e) => setAt(e.target.value)}
            />
            <span className="field-hint">Up to 90 days back. The sale goes into that day's report.</span>
          </div>
        )}
      </fieldset>

      {error && <p className="form-error">{error}</p>}
      <div className="row wrap">
        <button className="btn btn--sm" onClick={save} disabled={busy || count === 0}>
          {busy
            ? "Saving…"
            : count === 0
              ? "Pick the drinks"
              : `Save purchase: ${peso(total)}, +${plural(stamps, "stamp", "stamps")}`}
        </button>
        <button className="btn btn--sm btn--ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Stamps without a sale: for old purchases nobody can date, or to fix a mistake. */
function StampsOnly({
  customer,
  onCancel,
  onChange,
}: {
  customer: AdminCustomer;
  onCancel: () => void;
  onChange: (c: AdminCustomer) => void;
}) {
  const toast = useToast();
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

  return (
    <div className="subpanel stack" style={{ "--gap": "12px" } as CSSProperties}>
      <div>
        <h3 className="subpanel-title">Add stamps only</h3>
        <p className="small muted">
          For old purchases you can't date, or to fix a mistake. This changes stamps only and doesn't count as a sale.
        </p>
      </div>
      <div className="field">
        <label htmlFor={`note-${customer.id}`}>Reason (optional)</label>
        <input
          id={`note-${customer.id}`}
          className="input"
          value={note}
          maxLength={120}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. 3 coffees last week, forgot phone"
        />
      </div>
      <div className="row wrap">
        <button className="btn btn--sm" disabled={busy} onClick={() => adjust(1)}>
          <Icon name="plus" /> Add stamp
        </button>
        <button className="btn btn--sm btn--ghost" disabled={busy || customer.stamps === 0} onClick={() => adjust(-1)}>
          <Icon name="minus" /> Remove stamp
        </button>
        <button className="link-btn" onClick={onCancel} disabled={busy}>
          Done
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
