import { useState } from "react";
import { PasswordInput } from "../../components/PasswordInput";
import { api, errorMessage } from "../../lib/api";
import { navigate } from "../../lib/router";
import { AuthShell } from "../Auth";

// Super admin accounts are made in the terminal with `npm run superadmin`, so there's no sign-up link here.
export function SuperLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/super/auth/login", { method: "POST", body: { email, password } });
      navigate("/super", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Super admin log in">
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
            autoComplete="username"
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
      </form>
    </AuthShell>
  );
}
