import { type CSSProperties, useState } from "react";
import { FREE_LIMITS, PLATFORM_TIMEZONE as TZ, type UsageReport } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { formatDateKey, timeOf } from "../../lib/format";
import { useApi } from "../../lib/useApi";

const count = (n: number) => n.toLocaleString("en-PH");

/** "197 kB", "36.4 MB", "1.2 GB". */
function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`;
  if (n < 1024 * 1024 * 1024) return `${Number((n / 1024 / 1024).toFixed(1))} MB`;
  return `${Number((n / 1024 / 1024 / 1024).toFixed(2))} GB`;
}

/** "0.04%", "2.9%", "71%": small numbers keep a decimal so they don't all read as 0%. */
function percent(used: number, limit: number): string {
  const p = (used / limit) * 100;
  if (p === 0) return "0%";
  if (p < 0.1) return "<0.1%";
  return p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

/** Calm under 70%, a warning from 70%, red from 90%. */
const level = (used: number, limit: number) => {
  const p = used / limit;
  return p >= 0.9 ? "meter--danger" : p >= 0.7 ? "meter--warn" : "";
};

function untilReset(resetsAt: number): string {
  const minutes = Math.max(0, Math.round((resetsAt - Date.now()) / 60000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

/** Cloudflare usage against the free plan, for Tatak and the other systems on the same account. */
export function Usage() {
  const { data, setData, error, loading } = useApi<UsageReport>("/api/super/usage");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      setData(await api<UsageReport>("/api/super/usage?fresh=1"));
    } catch (err) {
      setRefreshError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  if (error) return <p className="form-error">{error}</p>;
  if (loading || !data) return <div className="skeleton" style={{ height: 240 }} aria-busy="true" />;

  const daily = [
    { label: "Requests", used: data.today.requests, limit: FREE_LIMITS.requests },
    { label: "Database rows read", used: data.today.rowsRead, limit: FREE_LIMITS.rowsRead },
    { label: "Database rows written", used: data.today.rowsWritten, limit: FREE_LIMITS.rowsWritten },
  ];

  return (
    <div className="stack" style={{ "--gap": "20px" } as CSSProperties}>
      <div className="spread wrap">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Cloudflare usage
          </h1>
          <p className="small muted">
            Free plan. Updated {timeOf(data.fetchedAt, TZ)}; Cloudflare's numbers can lag a few minutes.
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={refresh} disabled={refreshing || !data.configured}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {refreshError && <p className="form-error">{refreshError}</p>}

      {!data.configured && (
        <div className="form-note stack" style={{ "--gap": "6px" } as CSSProperties}>
          <strong style={{ display: "block" }}>Connect Cloudflare analytics to see today's usage.</strong>
          <span style={{ display: "block" }}>
            In Cloudflare: My Profile → API Tokens → Create Token → Custom, with one permission: Account → Account
            Analytics → Read. Then run <code>npx wrangler secret put CF_ANALYTICS_TOKEN</code> and paste it. Until
            then, only Tatak's database size shows.
          </span>
        </div>
      )}
      {data.error && <p className="form-error">{data.error}</p>}

      {data.configured && !data.error && (
        <section className="panel stack" style={{ "--gap": "16px" } as CSSProperties}>
          <div>
            <h2 className="panel-title" style={{ margin: 0 }}>
              Today, whole account
            </h2>
            <p className="small muted">
              Shared by every system below. Resets in {untilReset(data.resetsAt)} (8:00 AM Manila).
            </p>
          </div>
          {daily.map((m) => (
            <Meter key={m.label} label={m.label} used={m.used} limit={m.limit} format={count} />
          ))}
        </section>
      )}

      <section className="panel stack" style={{ "--gap": "16px" } as CSSProperties}>
        <div>
          <h2 className="panel-title" style={{ margin: 0 }}>
            Database size
          </h2>
          <p className="small muted">Each database can hold {bytes(FREE_LIMITS.databaseBytes)}. This never resets.</p>
        </div>
        {data.systems.map((s) =>
          s.databaseBytes === null ? (
            <p key={s.name} className="small muted">
              {s.name}: size not reported yet.
            </p>
          ) : (
            <Meter key={s.name} label={s.name} used={s.databaseBytes} limit={FREE_LIMITS.databaseBytes} format={bytes} />
          ),
        )}
        {data.configured && !data.error && (
          <Meter
            label="All databases on the account"
            used={data.storageBytes}
            limit={FREE_LIMITS.accountStorageBytes}
            format={bytes}
          />
        )}
      </section>

      {data.configured && !data.error && (
        <>
          <section className="panel">
            <h2 className="panel-title">Each system today</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>System</th>
                  <th className="num">Requests</th>
                  <th className="num">Rows read</th>
                  <th className="num">Rows written</th>
                </tr>
              </thead>
              <tbody>
                {data.systems.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="num">{count(s.requests)}</td>
                    <td className="num">{count(s.rowsRead)}</td>
                    <td className="num">{count(s.rowsWritten)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2 className="panel-title">Last 7 days, whole account</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Requests</th>
                  <th className="num">Rows read</th>
                  <th className="num">Rows written</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDateKey(d.date, true)}</td>
                    <td className="num">{count(d.requests)}</td>
                    <td className="num">{count(d.rowsRead)}</td>
                    <td className="num">{count(d.rowsWritten)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: 12 }}>
              Days are counted in UTC, the way Cloudflare's limits reset (8:00 AM Manila).
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Meter({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number;
  limit: number;
  format: (n: number) => string;
}) {
  const width = Math.min(100, (used / limit) * 100);
  return (
    <div className="meter-row">
      <div className="spread">
        <span className="meter-label">{label}</span>
        <span className="small tnum">
          <strong>{format(used)}</strong> of {format(limit)} · {percent(used, limit)}
        </span>
      </div>
      <div
        className={`meter ${level(used, limit)}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        {/* At least a sliver, so a tiny but real number still shows on the bar. */}
        <span style={{ width: `${used > 0 ? Math.max(width, 1) : 0}%` }} />
      </div>
    </div>
  );
}
