import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import type { SuperShop } from "../../../shared/types";
import { type Tab, TabBar } from "../../components/TabBar";
import { useToast } from "../../components/Toast";
import { api, errorMessage } from "../../lib/api";
import { navigate } from "../../lib/router";
import { useApi } from "../../lib/useApi";

const ShopsContext = createContext<SuperShop[] | null>(null);

/** Every shop, loaded once by SuperLayout and shared by its pages. */
export function useShops(): SuperShop[] {
  const shops = useContext(ShopsContext);
  if (!shops) throw new Error("useShops must be used inside SuperLayout");
  return shops;
}

const TABS: Tab[] = [
  { to: "/super", label: "Shops", icon: "store" },
  { to: "/super/transactions", label: "Transactions", icon: "receipt" },
  { to: "/super/usage", label: "Usage", icon: "chart" },
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
      <TabBar tabs={TABS} path={path} label="Super admin" />
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
