import { type CSSProperties, useState } from "react";
import type { AdminMenuItem } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { peso } from "../../lib/format";
import { useSearch } from "../../lib/router";
import { useApi } from "../../lib/useApi";

export function Menu() {
  const { data: items, setData, error, loading } = useApi<AdminMenuItem[]>("/api/admin/menu");
  const welcome = useSearch().get("welcome") === "1";
  const toast = useToast();

  const replace = (item: AdminMenuItem) => setData((items ?? []).map((i) => (i.id === item.id ? item : i)));

  const move = async (index: number, dir: -1 | 1) => {
    if (!items) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + dir, 0, moved);
    setData(next);
    try {
      setData(await api<AdminMenuItem[]>("/api/admin/menu/reorder", { method: "POST", body: { ids: next.map((i) => i.id) } }));
    } catch (err) {
      toast(errorMessage(err));
      setData(items);
    }
  };

  return (
    <div className="stack" style={{ "--gap": "20px" } as CSSProperties}>
      {welcome && (
        <p className="form-note">
          Your shop is ready. Add the drinks you sell, then print your QR poster from Settings.
        </p>
      )}
      <AddItem onAdded={(item) => setData([...(items ?? []), item])} />

      <section>
        <h1 className="page-title">Your menu</h1>
        {error && <p className="form-error">{error}</p>}
        {loading && !items ? (
          <div className="skeleton" style={{ height: 160 }} aria-busy="true" />
        ) : !items || items.length === 0 ? (
          <div className="panel empty">
            <p style={{ margin: 0 }}>No items yet. Add your first drink above. Customers see this list when they order.</p>
          </div>
        ) : (
          <ul className="panel panel--flush divided" style={{ listStyle: "none", margin: 0 }}>
            {items.map((item, i) => (
              <MenuRow
                key={item.id}
                item={item}
                first={i === 0}
                last={i === items.length - 1}
                onMove={(dir) => move(i, dir)}
                onChange={replace}
                onRemoved={() => setData(items.filter((x) => x.id !== item.id))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddItem({ onAdded }: { onAdded: (item: AdminMenuItem) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [earnsStamp, setEarnsStamp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const item = await api<AdminMenuItem>("/api/admin/menu", {
        method: "POST",
        body: { name, price: Number(price), earnsStamp },
      });
      onAdded(item);
      toast(`Added ${item.name}`);
      setName("");
      setPrice("");
      setEarnsStamp(true);
      document.getElementById("item-name")?.focus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="panel-title">Add an item</h2>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label htmlFor="item-name">Name</label>
          <input id="item-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </div>
        <div className="field">
          <label htmlFor="item-price">Price</label>
          <div className="input-prefix">
            <span>₱</span>
            <input
              id="item-price"
              className="input"
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={earnsStamp} onChange={(e) => setEarnsStamp(e.target.checked)} />
        <span>
          Gives a stamp
          <span className="field-hint" style={{ display: "block" }}>
            Turn off for things like pastries that shouldn't count toward a free coffee.
          </span>
        </span>
      </label>
      {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        <Icon name="plus" /> {busy ? "Adding…" : "Add item"}
      </button>
    </form>
  );
}

function MenuRow({
  item,
  first,
  last,
  onMove,
  onChange,
  onRemoved,
}: {
  item: AdminMenuItem;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onChange: (item: AdminMenuItem) => void;
  onRemoved: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.priceCents / 100));
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>, message?: string) => {
    setError(null);
    try {
      onChange(await api<AdminMenuItem>(`/api/admin/menu/${item.id}`, { method: "PATCH", body }));
      if (message) toast(message);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  const remove = async () => {
    try {
      await api(`/api/admin/menu/${item.id}`, { method: "DELETE" });
      toast(`Removed ${item.name}`);
      onRemoved();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (editing) {
    return (
      <li className="menu-admin-row" style={{ display: "block" }}>
        <form
          className="stack"
          style={{ "--gap": "12px" } as CSSProperties}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await patch({ name, price: Number(price) }, "Saved")) setEditing(false);
          }}
        >
          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor={`name-${item.id}`}>Name</label>
              <input id={`name-${item.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
            </div>
            <div className="field">
              <label htmlFor={`price-${item.id}`}>Price</label>
              <div className="input-prefix">
                <span>₱</span>
                <input
                  id={`price-${item.id}`}
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="row">
            <button className="btn btn--sm" type="submit">
              Save changes
            </button>
            <button
              className="btn btn--sm btn--ghost"
              type="button"
              onClick={() => {
                setEditing(false);
                setName(item.name);
                setPrice(String(item.priceCents / 100));
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`menu-admin-row ${item.isAvailable ? "" : "menu-admin-row--off"}`}>
      <div>
        <div className="menu-name">
          {item.name} {!item.isAvailable && <span className="tag tag--grey">Sold out</span>}
        </div>
        <div className="menu-meta">
          {peso(item.priceCents)}
          {item.earnsStamp ? ", gives a stamp" : ", no stamp"}
        </div>
      </div>
      <div className="row" style={{ gap: 0 }}>
        <button className="icon-btn" aria-label={`Move ${item.name} up`} disabled={first} onClick={() => onMove(-1)}>
          <Icon name="up" />
        </button>
        <button className="icon-btn" aria-label={`Move ${item.name} down`} disabled={last} onClick={() => onMove(1)}>
          <Icon name="down" />
        </button>
      </div>
      <div className="menu-admin-tools">
        <label className="switch">
          <input
            type="checkbox"
            checked={item.isAvailable}
            onChange={(e) => patch({ isAvailable: e.target.checked }, e.target.checked ? `${item.name} is back` : `${item.name} marked sold out`)}
          />
          Available
        </label>
        <label className="switch">
          <input type="checkbox" checked={item.earnsStamp} onChange={(e) => patch({ earnsStamp: e.target.checked })} />
          Gives a stamp
        </label>
        <button className="link-btn" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className="link-btn link-btn--danger" onClick={() => setConfirmRemove(true)}>
          Remove
        </button>
      </div>
      {confirmRemove && (
        <div className="confirm" style={{ gridColumn: "1 / -1" }}>
          <p className="small">Remove {item.name} from the menu? Past orders and sales reports keep it.</p>
          <div className="row">
            <button className="btn btn--danger btn--sm" onClick={remove}>
              Remove {item.name}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setConfirmRemove(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" style={{ gridColumn: "1 / -1" }}>
          {error}
        </p>
      )}
    </li>
  );
}
