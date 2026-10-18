import { type ReactNode, useEffect, useState } from "react";
import type { ShopSettings } from "../../shared/types";
import { BrandLogo } from "../components/Icon";
import { PasswordInput } from "../components/PasswordInput";
import { api, errorMessage } from "../lib/api";
import { Link, navigate } from "../lib/router";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | Tatak`;
  }, [title]);
  return (
    <main className="auth">
      <Link to="/" className="brand">
        <BrandLogo />
      </Link>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api<ShopSettings>("/api/auth/login", { method: "POST", body: { email, password } });
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Log in to your shop">
      <form
        className="stack"
        style={{ marginTop: 24 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--big btn--block" type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="small">
          New here? <Link to="/register">Set up your shop</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const [shopName, setShopName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shownSlug = slugEdited ? slug : toSlug(shopName);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api<ShopSettings>("/api/auth/register", {
        method: "POST",
        body: { shopName, slug: shownSlug, email, password },
      });
      navigate("/admin/menu?welcome=1", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Set up your shop">
      <p className="muted">It's free. You'll add your menu next.</p>
      <form
        className="stack"
        style={{ marginTop: 24 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor="shopName">Shop name</label>
          <input
            id="shopName"
            className="input"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            maxLength={60}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="slug">Shop link</label>
          <div className="input-prefix">
            <span>{location.host}/s/</span>
            <input
              id="slug"
              className="input"
              value={shownSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              maxLength={40}
              required
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <span className="field-hint">Your QR poster opens this link. It can't be changed later.</span>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
          <span className="field-hint">At least 8 characters.</span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--big btn--block" type="submit" disabled={busy}>
          {busy ? "Setting up…" : "Set up shop"}
        </button>
        <p className="small">
          Already have a shop? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
