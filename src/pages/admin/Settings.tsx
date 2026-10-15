import { type CSSProperties, useState } from "react";
import { PROMO_PRESETS } from "../../../shared/promos";
import type { Promo, ShopSettings, StampMode } from "../../../shared/types";
import {
  CARD_COLOR_KEYS,
  CARD_COLORS,
  type CardColor,
  INK_COLOR_KEYS,
  INK_COLORS,
  type InkColor,
  themeVars,
} from "../../../shared/theme";
import { Icon } from "../../components/Icon";
import { StampCard } from "../../components/StampCard";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { resizeLogo } from "../../lib/image";
import { Link, navigate } from "../../lib/router";
import { useApi } from "../../lib/useApi";
import { useShop } from "./AdminLayout";

export function Settings() {
  const { shop } = useShop();
  const link = `${location.origin}/s/${shop.slug}`;
  const toast = useToast();
  const { data: promos, setData: setPromos, error: promosError } = useApi<Promo[]>("/api/admin/promos");

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

      <BrandingSettings promos={promos ?? []} />
      {promos ? (
        <PromoSettings saved={promos} onSaved={setPromos} />
      ) : promosError ? (
        <p className="form-error">{promosError}</p>
      ) : (
        <div className="skeleton" style={{ height: 160 }} aria-busy="true" />
      )}
      <PinSettings />
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

const DAY = 86400000;

/** Logo and colors of the customer's stamp card, with a live preview. */
function BrandingSettings({ promos }: { promos: Promo[] }) {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const [card, setCard] = useState<CardColor>(shop.cardColor);
  const [ink, setInk] = useState<InkColor>(shop.inkColor);
  const [busy, setBusy] = useState<"colors" | "logo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = card !== shop.cardColor || ink !== shop.inkColor;
  const [sampleDates] = useState(() => [0, 1, 3, 6].map((d) => Date.now() - d * DAY));

  const saveColors = async () => {
    setBusy("colors");
    setError(null);
    try {
      setShop(await api<ShopSettings>("/api/admin/shop", { method: "PATCH", body: { cardColor: card, inkColor: ink } }));
      toast("Card colors saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy("logo");
    setError(null);
    try {
      const dataUrl = await resizeLogo(file);
      setShop(await api<ShopSettings>("/api/admin/logo", { method: "POST", body: { dataUrl } }));
      toast("Logo uploaded");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const removeLogo = async () => {
    setBusy("logo");
    setError(null);
    try {
      setShop(await api<ShopSettings>("/api/admin/logo", { method: "DELETE" }));
      toast("Logo removed");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel stack">
      <h2 className="panel-title" style={{ margin: 0 }}>
        Card design
      </h2>
      <p className="small muted">This is how your customers' stamp card looks. Changes show for everyone right away.</p>

      <div className="brand-preview" style={themeVars(card, ink) as CSSProperties}>
        <StampCard
          shopName={shop.name}
          code="K7Q4MZ"
          required={shop.stampsRequired}
          stamps={Math.min(4, shop.stampsRequired - 1)}
          stampDates={sampleDates}
          rewardText={shop.rewardText}
          timezone={shop.timezone}
          logoUrl={shop.logoUrl}
          promos={promos}
        />
        <span className="brand-preview-button">Order</span>
      </div>

      <div className="field">
        <span className="field-label">Logo</span>
        <div className="row wrap">
          {shop.logoUrl ? (
            <img className="logo-thumb" src={shop.logoUrl} alt="Your logo" />
          ) : (
            <span className="logo-thumb logo-thumb--empty" aria-hidden="true">
              <Icon name="cup" />
            </span>
          )}
          <label className={`btn btn--sm ${busy === "logo" ? "is-busy" : ""}`}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                void uploadLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {busy === "logo" ? "Uploading…" : shop.logoUrl ? "Change logo" : "Upload logo"}
          </label>
          {shop.logoUrl && (
            <button className="link-btn link-btn--danger" onClick={removeLogo} disabled={busy !== null}>
              Remove logo
            </button>
          )}
        </div>
        <span className="field-hint">PNG, JPG or WebP. Square pictures look best. We shrink it to 256 pixels.</span>
      </div>

      <fieldset className="swatch-group">
        <legend className="field-label">Card color</legend>
        <div className="swatches">
          {CARD_COLOR_KEYS.map((key) => (
            <label key={key} className="swatch" title={CARD_COLORS[key].label}>
              <input type="radio" name="card-color" checked={card === key} onChange={() => setCard(key)} />
              <span className="swatch-chip" style={{ background: CARD_COLORS[key].hex }} />
              <span className="swatch-name">{CARD_COLORS[key].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="swatch-group">
        <legend className="field-label">Stamp color</legend>
        <div className="swatches">
          {INK_COLOR_KEYS.map((key) => (
            <label key={key} className="swatch" title={INK_COLORS[key].label}>
              <input type="radio" name="ink-color" checked={ink === key} onChange={() => setInk(key)} />
              <span className="swatch-chip" style={{ background: INK_COLORS[key].hex }} />
              <span className="swatch-name">{INK_COLORS[key].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="form-error">{error}</p>}
      <div className="row">
        <button className="btn" onClick={saveColors} disabled={!changed || busy !== null}>
          {busy === "colors" ? "Saving…" : "Save colors"}
        </button>
        {changed && (
          <button
            className="link-btn"
            onClick={() => {
              setCard(shop.cardColor);
              setInk(shop.inkColor);
            }}
          >
            Undo
          </button>
        )}
      </div>
    </section>
  );
}

const MAX_PROMOS = 3;

type PromoKind = (typeof PROMO_PRESETS)[number]["label"] | "custom";
interface PromoDraft {
  step: number;
  kind: PromoKind;
  label: string;
  percent: string;
}

const toDraft = (p: Promo): PromoDraft => {
  const preset = PROMO_PRESETS.find((x) => x.label === p.label && x.percentOff === p.percentOff);
  return { step: p.step, kind: preset ? preset.label : "custom", label: p.label, percent: String(p.percentOff) };
};

const fromDraft = (d: PromoDraft): Promo => {
  const preset = PROMO_PRESETS.find((x) => x.label === d.kind);
  return preset
    ? { step: d.step, label: preset.label, percentOff: preset.percentOff }
    : { step: d.step, label: d.label.trim(), percentOff: Number(d.percent) };
};

/** Bonuses on chosen stamps before the free reward, e.g. stamp 5 = 50% off. */
function PromoSettings({ saved, onSaved }: { saved: Promo[]; onSaved: (p: Promo[]) => void }) {
  const { shop } = useShop();
  const toast = useToast();
  const [rows, setRows] = useState<PromoDraft[]>(() => saved.map(toDraft));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sampleDates] = useState(() => [Date.now()]);
  const lastStep = shop.stampsRequired - 1;
  const draft = rows.map(fromDraft);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  const setRow = (i: number, patch: Partial<PromoDraft>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const add = () => {
    const taken = new Set(rows.map((r) => r.step));
    const middle = Math.ceil(shop.stampsRequired / 2);
    const step = [middle, ...Array.from({ length: lastStep }, (_, n) => n + 1)].find((n) => n <= lastStep && !taken.has(n));
    if (step) setRows([...rows, { step, kind: "50% off", label: "", percent: "50" }]);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api<Promo[]>("/api/admin/promos", { method: "POST", body: { promos: draft } });
      onSaved(next);
      setRows(next.map(toDraft));
      toast("Promos saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel stack">
      <h2 className="panel-title" style={{ margin: 0 }}>
        Promos on the card
      </h2>
      <p className="small muted">
        Give a bonus on the way to the free reward, like 50% off on stamp 5. The customer picks one item to use it on.
        Each promo works once per card and doesn't use up stamps. Unused promos end when the free reward is claimed.
      </p>

      <div className="brand-preview" style={themeVars(shop.cardColor, shop.inkColor) as CSSProperties}>
        <StampCard
          shopName={shop.name}
          required={shop.stampsRequired}
          stamps={0}
          stampDates={sampleDates}
          timezone={shop.timezone}
          logoUrl={shop.logoUrl}
          promos={draft.filter((p) => p.label)}
        />
      </div>

      {rows.length === 0 && <p className="small">No promos yet. Customers get only the free reward.</p>}
      {rows.map((row, i) => (
        <div key={i} className="subpanel stack" style={{ "--gap": "12px" } as CSSProperties}>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label htmlFor={`promo-step-${i}`}>On stamp</label>
              <select
                id={`promo-step-${i}`}
                className="input"
                value={row.step}
                onChange={(e) => setRow(i, { step: Number(e.target.value) })}
              >
                {Array.from({ length: lastStep }, (_, n) => n + 1).map((n) => (
                  <option key={n} value={n} disabled={n !== row.step && rows.some((r) => r.step === n)}>
                    Stamp {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`promo-kind-${i}`}>Promo</label>
              <select
                id={`promo-kind-${i}`}
                className="input"
                value={row.kind}
                onChange={(e) => setRow(i, { kind: e.target.value as PromoKind })}
              >
                {PROMO_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.percentOff === 100 ? "Free item" : p.label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          {row.kind === "custom" && (
            <div className="form-grid form-grid--2">
              <div className="field">
                <label htmlFor={`promo-label-${i}`}>Name on the card</label>
                <input
                  id={`promo-label-${i}`}
                  className="input"
                  value={row.label}
                  maxLength={12}
                  placeholder="e.g. 20% off"
                  onChange={(e) => setRow(i, { label: e.target.value })}
                />
                <span className="field-hint">Up to 12 characters.</span>
              </div>
              <div className="field">
                <label htmlFor={`promo-percent-${i}`}>Discount on one item (%)</label>
                <input
                  id={`promo-percent-${i}`}
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={row.percent}
                  onChange={(e) => setRow(i, { percent: e.target.value })}
                />
                <span className="field-hint">0 means you give it by hand, like a free upsize.</span>
              </div>
            </div>
          )}
          <div>
            <button className="link-btn link-btn--danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              Remove promo
            </button>
          </div>
        </div>
      ))}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="row wrap">
        <button className="btn" onClick={save} disabled={!changed || busy}>
          {busy ? "Saving…" : "Save promos"}
        </button>
        {rows.length < MAX_PROMOS && rows.length < lastStep && (
          <button className="btn btn--ghost" onClick={add}>
            <Icon name="plus" /> Add promo
          </button>
        )}
      </div>
    </section>
  );
}

/** The barista PIN: typed on the customer's phone after the hold, so customers can't stamp themselves. */
function PinSettings() {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const savePin = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api<ShopSettings>("/api/admin/pin", { method: "POST", body: { pin } });
      setShop(next);
      setPin("");
      toast(shop.hasPin ? "PIN changed" : "PIN saved and turned on");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (requirePin: boolean) => {
    setError(null);
    try {
      setShop(await api<ShopSettings>("/api/admin/shop", { method: "PATCH", body: { requirePin } }));
      toast(requirePin ? "PIN turned on" : "PIN turned off");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const status = shop.requirePin
    ? "On. After holding the button on the customer's phone, you type this PIN to approve the stamp."
    : shop.hasPin
      ? "Off. Anyone holding the phone can stamp by holding the button."
      : "Not set yet. Anyone holding the phone can stamp by holding the button. Set a PIN so only you can approve stamps.";

  return (
    <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties}>
      <h2 className="panel-title" style={{ margin: 0 }}>
        Barista PIN
      </h2>
      <p className="small">{status}</p>
      {shop.hasPin && (
        <label className="switch">
          <input type="checkbox" checked={shop.requirePin} onChange={(e) => toggle(e.target.checked)} />
          Ask for the PIN when stamping
        </label>
      )}
      <form
        className="row wrap"
        style={{ alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          void savePin();
        }}
      >
        <div className="field" style={{ width: 160 }}>
          <label htmlFor="pin">{shop.hasPin ? "New PIN" : "PIN"}</label>
          <input
            id="pin"
            className="input input--code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            pattern="[0-9]{4}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </div>
        <button className="btn" type="submit" disabled={busy || pin.length !== 4}>
          {busy ? "Saving…" : shop.hasPin ? "Change PIN" : "Set PIN"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      <p className="field-hint">
        4 numbers. Changing it stops the old PIN right away. After 5 wrong tries, that customer's card waits 15 minutes.
      </p>
    </section>
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
