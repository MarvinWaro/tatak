import { type CSSProperties, useState } from "react";
import type { ShopSettings, StampMode } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { Link, navigate } from "../../lib/router";
import { useShop } from "./AdminLayout";

export function Settings() {
  const { shop } = useShop();
  const link = `${location.origin}/s/${shop.slug}`;
  const toast = useToast();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Select the link and copy it.");
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    navigate("/login", { replace: true });
  };

  return (
    <div className="stack" style={{ "--gap": "20px", maxWidth: 720 } as CSSProperties}>
      <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties}>
        <h1 className="panel-title" style={{ margin: 0 }}>
          Your customer link
        </h1>
        <p style={{ overflowWrap: "anywhere", fontWeight: 600 }}>{link}</p>
        <div className="row wrap">
          <Link to="/admin/poster" className="btn btn--sm">
            <Icon name="print" /> Print QR poster
          </Link>
          <button className="btn btn--sm btn--ghost" onClick={copyLink}>
            <Icon name="copy" /> Copy link
          </button>
        </div>
      </section>

      <ShopForm />
      <PasswordForm />

      <section className="panel">
        <h2 className="panel-title">Account</h2>
        <p className="small muted" style={{ marginBottom: 12 }}>
          Logged in as {shop.email}
        </p>
        <button className="btn btn--ghost" onClick={logout}>
          Log out
        </button>
      </section>
    </div>
  );
}

function ShopForm() {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const [form, setForm] = useState({
    name: shop.name,
    rewardText: shop.rewardText,
    stampsRequired: String(shop.stampsRequired),
    stampMode: shop.stampMode,
    cooldownMinutes: String(shop.cooldownMinutes),
    maxStampsPerDay: String(shop.maxStampsPerDay),
    limitHours: shop.openTime !== null,
    openTime: shop.openTime ?? "06:00",
    closeTime: shop.closeTime ?? "18:00",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api<ShopSettings>("/api/admin/shop", {
        method: "PATCH",
        body: {
          name: form.name,
          rewardText: form.rewardText,
          stampsRequired: Number(form.stampsRequired),
          stampMode: form.stampMode,
          cooldownMinutes: Number(form.cooldownMinutes),
          maxStampsPerDay: Number(form.maxStampsPerDay),
          openTime: form.limitHours ? form.openTime : null,
          closeTime: form.limitHours ? form.closeTime : null,
        },
      });
      setShop(next);
      toast("Settings saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="panel-title" style={{ margin: 0 }}>
        Stamp card
      </h2>
      <div className="field">
        <label htmlFor="s-name">Shop name</label>
        <input id="s-name" className="input" value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label htmlFor="s-required">Stamps for a reward</label>
          <input
            id="s-required"
            className="input"
            type="number"
            min={2}
            max={30}
            value={form.stampsRequired}
            onChange={(e) => set("stampsRequired", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="s-reward">Reward</label>
          <input
            id="s-reward"
            className="input"
            value={form.rewardText}
            maxLength={40}
            onChange={(e) => set("rewardText", e.target.value)}
          />
          <span className="field-hint">Shown as "10 stamps = 1 free coffee".</span>
        </div>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, "--gap": "8px" } as CSSProperties}>
        <legend className="field-label" style={{ marginBottom: 8 }}>
          How stamps are counted
        </legend>
        {(
          [
            ["per_cup", "One stamp per cup", "3 coffees in one order give 3 stamps."],
            ["per_order", "One stamp per order", "Any order with a coffee gives 1 stamp."],
          ] as [StampMode, string, string][]
        ).map(([value, title, hint]) => (
          <label key={value} className="radio-card">
            <input type="radio" name="mode" checked={form.stampMode === value} onChange={() => set("stampMode", value)} />
            <strong>{title}</strong>
            <span className="small muted">{hint}</span>
          </label>
        ))}
      </fieldset>

      <h2 className="panel-title" style={{ margin: "8px 0 0" }}>
        Limits
      </h2>
      <p className="small muted">These stop people from stamping their own phone away from your stall.</p>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label htmlFor="s-cooldown">Minutes between stamped orders</label>
          <input
            id="s-cooldown"
            className="input"
            type="number"
            min={0}
            max={240}
            value={form.cooldownMinutes}
            onChange={(e) => set("cooldownMinutes", e.target.value)}
          />
          <span className="field-hint">Per card. 0 means no wait.</span>
        </div>
        <div className="field">
          <label htmlFor="s-daily">Most stamps per card per day</label>
          <input
            id="s-daily"
            className="input"
            type="number"
            min={0}
            max={100}
            value={form.maxStampsPerDay}
            onChange={(e) => set("maxStampsPerDay", e.target.value)}
          />
          <span className="field-hint">0 means no limit. Orders past the limit are still saved.</span>
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={form.limitHours} onChange={(e) => set("limitHours", e.target.checked)} />
        <span>
          Only allow stamps during opening hours
          <span className="field-hint" style={{ display: "block" }}>
            Uses Philippine time.
          </span>
        </span>
      </label>
      {form.limitHours && (
        <div className="form-grid form-grid--2">
          <div className="field">
            <label htmlFor="s-open">Opens</label>
            <input
              id="s-open"
              className="input"
              type="time"
              value={form.openTime}
              onChange={(e) => set("openTime", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="s-close">Closes</label>
            <input
              id="s-close"
              className="input"
              type="time"
              value={form.closeTime}
              onChange={(e) => set("closeTime", e.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      toast("Password changed");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="panel-title" style={{ margin: 0 }}>
        Change password
      </h2>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label htmlFor="pw-current">Current password</label>
          <input
            id="pw-current"
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pw-new">New password</label>
          <input
            id="pw-new"
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div>
        <button className="btn btn--ghost" type="submit" disabled={busy}>
          {busy ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
