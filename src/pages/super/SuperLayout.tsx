import { type CSSProperties, type ReactNode, createContext, useContext, useEffect, useState } from "react";
import type { SuperShop } from "../../../shared/types";
import { Icon, type IconName } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { Link, navigate } from "../../lib/router";
import { useApi } from "../../lib/useApi";

const ShopsContext = createContext<SuperShop[] | null>(null);

/** Every shop, loaded once by SuperLayout and shared by its pages. */
export function useShops(): SuperShop[] {
  const shops = useContext(ShopsContext);
  if (!shops) throw new Error("useShops must be used inside SuperLayout");
  return shops;
}

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: "/super", label: "Shops", icon: "store" },
  { to: "/super/transactions", label: "Transactions", icon: "receipt" },
];

export function SuperLayout({ path, children }: { path: string; children: ReactNode }) {
  const { data: shops, error } = useApi<SuperShop[]>("/api/super/shops");
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const logOut = async () => {
    setLoggingOut(true);
    try {
      await api("/api/super/auth/logout", { method: "POST" });
      navigate("/super/login", { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    const tab = TABS.find((t) => t.to === path);
    document.title = `${tab?.label ?? "Super admin"} | Tatak super admin`;
  }, [path]);

  if (error) {
    return (
      <main className="auth">
        <div className="panel empty" style={{ marginTop: 40 }}>
          <h1 className="page-title">The super admin didn't load</h1>
          <p>{error}</p>
          <button className="btn" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="admin">
      <header className="admin-top">
        <span className="admin-shop">Tatak super admin</span>
        <button className="btn btn--ghost btn--sm" onClick={logOut} disabled={loggingOut}>
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </header>
      <nav className="tabs" aria-label="Super admin" style={{ "--tab-count": TABS.length } as CSSProperties}>
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} className="tab" aria-current={path === t.to ? "page" : undefined}>
            <Icon name={t.icon} />
            {t.label}
          </Link>
        ))}
      </nav>
      <main className="admin-main">
        {shops ? (
          <ShopsContext.Provider value={shops}>{children}</ShopsContext.Provider>
        ) : (
          <div className="skeleton" style={{ height: 220 }} aria-busy="true" />
        )}
      </main>
    </div>
  );
}
