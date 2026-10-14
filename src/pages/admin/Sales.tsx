import { type CSSProperties, useState } from "react";
import type { SalesReport } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { addDays, dateKey, formatDateKey, hourLabel, peso, plural } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useShop } from "./AdminLayout";

type Preset = "today" | "yesterday" | "7" | "30" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "custom", label: "Pick dates" },
];

function rangeFor(preset: Preset, today: string, custom: { from: string; to: string }) {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7":
      return { from: addDays(today, -6), to: today };
    case "30":
      return { from: addDays(today, -29), to: today };
    default:
      return custom;
  }
}

function periodName(preset: Preset, from: string, to: string): { now: string; before: string } {
  switch (preset) {
    case "today":
      return { now: "Today", before: "yesterday" };
    case "yesterday":
      return { now: "Yesterday", before: "the day before" };
    case "7":
      return { now: "In the last 7 days", before: "the 7 days before" };
    case "30":
      return { now: "In the last 30 days", before: "the 30 days before" };
    default:
      return from === to
        ? { now: `On ${formatDateKey(from, true)}`, before: "the day before" }
        : { now: `From ${formatDateKey(from)} to ${formatDateKey(to)}`, before: "the same number of days before" };
  }
}

export function Sales() {
  const { shop } = useShop();
  const today = dateKey(Date.now(), shop.timezone);
  const [preset, setPreset] = useState<Preset>("today");
  const [custom, setCustom] = useState({ from: addDays(today, -6), to: today });
  const range = rangeFor(preset, today, custom);
  const valid = range.from <= range.to;
  const { data, error, loading } = useApi<SalesReport>(
    valid ? `/api/admin/report?from=${range.from}&to=${range.to}` : null,
  );
  const names = periodName(preset, range.from, range.to);

  return (
    <div className="stack" style={{ "--gap": "20px" } as CSSProperties}>
      <div className="chips" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button key={p.id} className="chip" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="row wrap">
          <div className="field">
            <label htmlFor="from">From</label>
            <input
              id="from"
              className="input"
              type="date"
              value={custom.from}
              max={today}
              onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input
              id="to"
              className="input"
              type="date"
              value={custom.to}
              max={today}
              onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
            />
          </div>
          {!valid && <p className="form-error">The end date is before the start date.</p>}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      {!data || loading ? (
        <div className="skeleton" style={{ height: 120 }} aria-busy="true" />
      ) : (
        <Report report={data} names={names} />
      )}
    </div>
  );
}

function Report({ report, names }: { report: SalesReport; names: { now: string; before: string } }) {
  const t = report.totals;
  const diff = t.salesCents - report.previous.salesCents;
  const multiDay = report.range.days > 1;

  if (t.paidOrders === 0 && t.freeCups === 0) {
    return (
      <section className="panel empty">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          No sales yet {names.now === "Today" ? "today" : "for these dates"}
        </h1>
        <p>Orders show up here as soon as you stamp them on a customer's phone.</p>
      </section>
    );
  }

  const facts = [
    plural(t.itemsSold, "item sold", "items sold"),
    plural(t.customers, "customer", "customers"),
    plural(t.stampsGiven, "stamp given", "stamps given"),
    plural(t.freeCups, "free drink", "free drinks"),
  ];

  return (
    <>
      <section>
        <h1 className="headline">
          {names.now} you sold {peso(t.salesCents)} across {plural(t.paidOrders, "order", "orders")}.
        </h1>
        <p className="subline">{facts.join(", ")}.</p>
        {report.previous.salesCents > 0 ? (
          <p className="subline small" style={{ marginTop: 6 }}>
            {diff === 0 ? (
              <>Same as {names.before}.</>
            ) : (
              <>
                <span className={diff > 0 ? "delta-up" : "delta-down"}>
                  {peso(Math.abs(diff))} {diff > 0 ? "more" : "less"}
                </span>{" "}
                than {names.before} ({peso(report.previous.salesCents)}).
              </>
            )}
          </p>
        ) : null}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2 className="panel-title">Sales per item</h2>
          <ItemsTable items={report.items} />
          <a
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 16 }}
            href={`/api/admin/orders.csv?from=${report.range.from}&to=${report.range.to}`}
            download
          >
            <Icon name="download" /> Download orders (CSV)
          </a>
        </section>

        <div className="stack">
          <section className="panel">
            <h2 className="panel-title">Busiest hours</h2>
            <Hours hours={report.hours} />
          </section>
          {multiDay && (
            <section className="panel">
              <h2 className="panel-title">Sales per day</h2>
              <Days report={report} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function ItemsTable({ items }: { items: SalesReport["items"] }) {
  const max = Math.max(1, ...items.map((i) => i.qty));
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Item</th>
          <th className="num">Sold</th>
          <th className="num">Sales</th>
          <th className="bar-cell">
            <span className="sr-only">Share</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.name}>
            <td>
              {i.name}
              {i.freeQty > 0 && <span className="xsmall muted"> ({i.freeQty} free)</span>}
            </td>
            <td className="num">{i.qty}</td>
            <td className="num">{peso(i.salesCents)}</td>
            <td className="bar-cell">
              <div className="bar" style={{ width: `${(i.qty / max) * 100}%` }} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Hours({ hours }: { hours: SalesReport["hours"] }) {
  const first = Math.min(...hours.map((h) => h.hour));
  const last = Math.max(...hours.map((h) => h.hour));
  const start = Math.max(0, Math.min(first, 6));
  const end = Math.min(23, Math.max(last, start + 7));
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const max = Math.max(1, ...hours.map((h) => h.itemsSold));
  const busiest = hours.reduce((a, b) => (b.itemsSold > a.itemsSold ? b : a), hours[0]);

  return (
    <>
      <div className="columns" role="img" aria-label={`Busiest hour: ${hourLabel(busiest.hour)}m with ${busiest.itemsSold} items`}>
        {Array.from({ length: end - start + 1 }, (_, i) => {
          const hour = start + i;
          const h = byHour.get(hour);
          const pct = h ? (h.itemsSold / max) * 100 : 0;
          return (
            <div className="column" key={hour} title={h ? `${hourLabel(hour)}m: ${h.itemsSold} items, ${peso(h.salesCents)}` : undefined}>
              <div className={`column-bar ${h ? "" : "column-bar--empty"}`} style={{ height: `${Math.max(pct, 1.5)}%` }} />
              <span className="column-label">{i % 2 === 0 || end - start < 10 ? hourLabel(hour) : ""}</span>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Busiest at {hourLabel(busiest.hour)}m with {plural(busiest.itemsSold, "item", "items")}. Bars show items sold per hour.
      </p>
    </>
  );
}

function Days({ report }: { report: SalesReport }) {
  const byDate = new Map(report.days.map((d) => [d.date, d]));
  const dates = Array.from({ length: report.range.days }, (_, i) => addDays(report.range.from, i));
  const max = Math.max(1, ...report.days.map((d) => d.salesCents));
  const step = Math.ceil(dates.length / 8);

  return (
    <div className="columns" role="img" aria-label="Sales per day">
      {dates.map((date, i) => {
        const d = byDate.get(date);
        const pct = d ? (d.salesCents / max) * 100 : 0;
        return (
          <div className="column" key={date} title={`${formatDateKey(date, true)}: ${peso(d?.salesCents ?? 0)}`}>
            <div className={`column-bar ${d ? "" : "column-bar--empty"}`} style={{ height: `${Math.max(pct, 1.5)}%` }} />
            <span className="column-label">{i % step === 0 ? formatDateKey(date).replace(/^\w+ /, "") : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
