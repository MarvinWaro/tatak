import type { MenuSize, PublicMenuItem } from "../../shared/types";
import { peso } from "../lib/format";
import { Icon } from "./Icon";

/** Quantities in an order, by line key (see lineKey). */
export type Quantities = Record<string, number>;

/** One line of an order: an item, its size when it has sizes, and how many. */
export interface OrderLine {
  key: string;
  item: PublicMenuItem;
  size: MenuSize | null;
  /** The name as sold: "Spanish Latte (Large)", or the item name. */
  name: string;
  /** Price of one unit: the size's price, or the item's. */
  unitCents: number;
  qty: number;
}

/** An item without sizes has one line; an item with sizes has one line per size. */
export const lineKey = (itemId: string, sizeId?: string | null): string => `${itemId}|${sizeId ?? ""}`;

/** The picked lines, in menu order. */
export function orderLines(menu: PublicMenuItem[], qty: Quantities): OrderLine[] {
  return menu.flatMap((item) =>
    (item.sizes.length > 0 ? item.sizes : [null]).flatMap((size) => {
      const key = lineKey(item.id, size?.id);
      const n = qty[key] ?? 0;
      if (n === 0) return [];
      return [
        {
          key,
          item,
          size,
          name: size ? `${item.name} (${size.name})` : item.name,
          unitCents: size?.priceCents ?? item.priceCents,
          qty: n,
        },
      ];
    }),
  );
}

/** What the API takes for each line. */
export const apiLines = (lines: OrderLine[]) => lines.map((l) => ({ id: l.item.id, sizeId: l.size?.id, qty: l.qty }));

/** What the API takes to point at one line, for a promo or the free item. */
export const apiRef = (line: OrderLine | null) => (line ? { itemId: line.item.id, sizeId: line.size?.id } : {});

/** The line the customer picked, or else the priciest one. */
export function pickLine(lines: OrderLine[], pickedKey: string | null): OrderLine | null {
  if (lines.length === 0) return null;
  return lines.find((l) => l.key === pickedKey) ?? lines.reduce((a, b) => (b.unitCents > a.unitCents ? b : a));
}

const MAX_QTY = 20;

/**
 * The menu with a − / + stepper per line. An item with sizes shows its name once, then one row
 * per size, so ordering a Large stays one tap with no popup.
 */
export function MenuPicker({
  menu,
  qty,
  setQty,
  compact = false,
  className = "",
}: {
  menu: PublicMenuItem[];
  qty: Quantities;
  setQty: (q: Quantities) => void;
  compact?: boolean;
  className?: string;
}) {
  const change = (key: string, delta: number) =>
    setQty({ ...qty, [key]: Math.max(0, Math.min(MAX_QTY, (qty[key] ?? 0) + delta)) });
  const noStamp = (item: PublicMenuItem) => (item.earnsStamp ? "" : ", no stamp");
  const rowClass = `menu-row ${compact ? "menu-row--compact" : ""}`;

  return (
    <ul className={`menu-list ${className}`}>
      {menu.map((item) =>
        item.sizes.length === 0 ? (
          <QtyRow
            key={item.id}
            className={rowClass}
            title={item.name}
            meta={`${peso(item.priceCents)}${noStamp(item)}`}
            label={item.name}
            n={qty[lineKey(item.id)] ?? 0}
            onChange={(d) => change(lineKey(item.id), d)}
          />
        ) : (
          [
            <li key={item.id} className={`${rowClass} menu-row--group`}>
              <div>
                <div className="menu-name">{item.name}</div>
                {!item.earnsStamp && <div className="menu-meta">No stamp</div>}
              </div>
            </li>,
            ...item.sizes.map((size) => {
              const key = lineKey(item.id, size.id);
              return (
                <QtyRow
                  key={key}
                  className={`${rowClass} menu-row--size`}
                  title={size.name}
                  meta={peso(size.priceCents)}
                  label={`${item.name} (${size.name})`}
                  n={qty[key] ?? 0}
                  onChange={(d) => change(key, d)}
                />
              );
            }),
          ]
        ),
      )}
    </ul>
  );
}

function QtyRow({
  className,
  title,
  meta,
  label,
  n,
  onChange,
}: {
  className: string;
  title: string;
  meta: string;
  /** The full name for screen readers: "Spanish Latte (Large)". */
  label: string;
  n: number;
  onChange: (delta: number) => void;
}) {
  return (
    <li className={`${className} ${n > 0 ? "menu-row--picked" : ""}`}>
      <div>
        <div className="menu-name">{title}</div>
        <div className="menu-meta">{meta}</div>
      </div>
      <div className="stepper" role="group" aria-label={`${label} quantity`}>
        {n > 0 && (
          <>
            <button type="button" onClick={() => onChange(-1)} aria-label={`Remove one ${label}`}>
              <Icon name="minus" />
            </button>
            <output aria-live="polite">{n}</output>
          </>
        )}
        <button
          type="button"
          className="plus"
          onClick={() => onChange(1)}
          disabled={n >= MAX_QTY}
          aria-label={`Add one ${label}`}
        >
          <Icon name="plus" />
        </button>
      </div>
    </li>
  );
}
