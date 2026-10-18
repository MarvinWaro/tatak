import { type CSSProperties, useEffect, useState } from "react";
import type { AdminMenuItem, MenuSize } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { peso } from "../../lib/format";
import { useSearch } from "../../lib/router";
import { startTour, tourUnseen } from "../../lib/tour";
import { useApi } from "../../lib/useApi";

export function Menu() {
  const { data: items, setData, error, loading } = useApi<AdminMenuItem[]>("/api/admin/menu");
  const welcome = useSearch().get("welcome") === "1";
  const toast = useToast();

  const replace = (item: AdminMenuItem) => setData((items ?? []).map((i) => (i.id === item.id ? item : i)));
  // Size names the shop already uses, offered as one-tap suggestions on other items.
  const sizeNames = sizeSuggestions(items ?? []);
  const loaded = items !== null;

  // The first time an owner opens Menu, walk them through adding an item once the menu has loaded.
  useEffect(() => {
    if (loaded && tourUnseen("menu")) void startTour("menu");
  }, [loaded]);

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
      <div className="spread">
        <span className="small muted">New here? See how to add your drinks.</span>
        <button className="btn btn--ghost btn--sm" onClick={() => void startTour("menu")}>
          Show me around
        </button>
      </div>
      <AddItem sizeNames={sizeNames} onAdded={(item) => setData([...(items ?? []), item])} />

      <section data-tour="menu-list">
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
                sizeNames={sizeNames}
                onRemoved={() => setData(items.filter((x) => x.id !== item.id))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const MAX_SIZES = 6;

/** A size being edited. `key` keeps React rows stable; `id` is set for sizes already saved. */
interface SizeDraft {
  key: string;
  id?: string;
  name: string;
  price: string;
}

let draftCount = 0;
const newDraft = (name = "", price = ""): SizeDraft => ({ key: `new-${++draftCount}`, name, price });
const toDrafts = (sizes: MenuSize[]): SizeDraft[] =>
  sizes.map((z) => ({ key: z.id, id: z.id, name: z.name, price: String(z.priceCents / 100) }));

/** What the API takes: the sizes, and the item price (the lowest size price when it has sizes). */
function sizesBody(drafts: SizeDraft[], price: string) {
  const sizes = drafts.map((d) => ({ id: d.id, name: d.name.trim(), price: Number(d.price) }));
  return { sizes, price: sizes.length > 0 ? Math.min(...sizes.map((z) => z.price)) : Number(price) };
}

/** Size names used anywhere on the menu; Small, Medium and Large until the shop has its own. */
function sizeSuggestions(items: AdminMenuItem[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) for (const z of item.sizes) seen.set(z.name.toLowerCase(), z.name);
  return seen.size > 0 ? [...seen.values()] : ["Small", "Medium", "Large"];
}

/** "Medium ₱100 · Large ₱120", or the single price. */
const priceText = (item: AdminMenuItem) =>
  item.sizes.length > 0 ? item.sizes.map((z) => `${z.name} ${peso(z.priceCents)}`).join(" · ") : peso(item.priceCents);

/** Sizes of one item: each with its own name and price. Empty means the item has one price. */
function SizesEditor({
  idPrefix,
  drafts,
  setDrafts,
  sizeNames,
}: {
  idPrefix: string;
  drafts: SizeDraft[];
  setDrafts: (d: SizeDraft[]) => void;
  sizeNames: string[];
}) {
  const used = new Set(drafts.map((d) => d.name.trim().toLowerCase()));
  const suggestions = sizeNames.filter((n) => !used.has(n.toLowerCase()));
  const full = drafts.length >= MAX_SIZES;
  const add = (name = "") => {
    const draft = newDraft(name);
    setDrafts([...drafts, draft]);
    // Jump to the new row's empty field: the price when the name came from a suggestion.
    setTimeout(() => document.getElementById(`${idPrefix}-${draft.key}-${name ? "price" : "name"}`)?.focus(), 0);
  };
  const update = (key: string, patch: Partial<SizeDraft>) =>
    setDrafts(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <fieldset className="sizes">
      <legend className="field-label">Sizes</legend>
      {drafts.length === 0 && (
        <p className="field-hint">One price for this item. Add sizes if it comes in Medium, Large and so on.</p>
      )}
      {drafts.map((d) => (
        <div key={d.key} className="size-row">
          <div className="field">
            <label htmlFor={`${idPrefix}-${d.key}-name`} className="sr-only">
              Size name
            </label>
            <input
              id={`${idPrefix}-${d.key}-name`}
              className="input"
              placeholder="e.g. Large"
              value={d.name}
              maxLength={20}
              required
              onChange={(e) => update(d.key, { name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-${d.key}-price`} className="sr-only">
              Price of {d.name || "this size"}
            </label>
            <div className="input-prefix">
              <span>₱</span>
              <input
                id={`${idPrefix}-${d.key}-price`}
                className="input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={d.price}
                required
                onChange={(e) => update(d.key, { price: e.target.value })}
              />
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove size ${d.name || ""}`.trim()}
            onClick={() => setDrafts(drafts.filter((x) => x.key !== d.key))}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
      {!full && (
        <div className="row wrap" style={{ gap: 8 }}>
          {suggestions.map((n) => (
            <button key={n} type="button" className="chip" onClick={() => add(n)}>
              <Icon name="plus" /> {n}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => add()}>
            <Icon name="plus" /> Other size
          </button>
        </div>
      )}
    </fieldset>
  );
}

function AddItem({ onAdded, sizeNames }: { onAdded: (item: AdminMenuItem) => void; sizeNames: string[] }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [sizes, setSizes] = useState<SizeDraft[]>([]);
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
        body: { name, earnsStamp, ...sizesBody(sizes, price) },
      });
      onAdded(item);
      toast(`Added ${item.name}`);
      setName("");
      setPrice("");
      setSizes([]);
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
        <div className="field" data-tour="add-name">
          <label htmlFor="item-name">Name</label>
          <input id="item-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </div>
        {sizes.length === 0 && (
          <div className="field" data-tour="add-price">
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
        )}
      </div>
      <div data-tour="add-sizes">
        <SizesEditor idPrefix="new-item" drafts={sizes} setDrafts={setSizes} sizeNames={sizeNames} />
      </div>
      <label className="check" data-tour="add-stamp">
        <input type="checkbox" checked={earnsStamp} onChange={(e) => setEarnsStamp(e.target.checked)} />
        <span>
          Gives a stamp
          <span className="field-hint" style={{ display: "block" }}>
            Turn off for things like pastries that shouldn't count toward a free coffee.
          </span>
        </span>
      </label>
      {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}
      <button className="btn" type="submit" disabled={busy} data-tour="add-submit">
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
  sizeNames,
  onRemoved,
}: {
  item: AdminMenuItem;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onChange: (item: AdminMenuItem) => void;
  sizeNames: string[];
  onRemoved: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.priceCents / 100));
  const [sizes, setSizes] = useState<SizeDraft[]>(() => toDrafts(item.sizes));
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
            if (await patch({ name, ...sizesBody(sizes, price) }, "Saved")) setEditing(false);
          }}
        >
          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor={`name-${item.id}`}>Name</label>
              <input id={`name-${item.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
            </div>
            {sizes.length === 0 && (
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
            )}
          </div>
          <SizesEditor idPrefix={`item-${item.id}`} drafts={sizes} setDrafts={setSizes} sizeNames={sizeNames} />
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
                setSizes(toDrafts(item.sizes));
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
    <li
      className={`menu-admin-row ${item.isAvailable ? "" : "menu-admin-row--off"}`}
      data-tour={first ? "menu-row" : undefined}
    >
      <div>
        <div className="menu-name">
          {item.name} {!item.isAvailable && <span className="tag tag--grey">Sold out</span>}
        </div>
        <div className="menu-meta">
          {priceText(item)}
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
