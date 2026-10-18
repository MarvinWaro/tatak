import { type ReactNode, createContext, useContext, useEffect } from "react";
import type { ShopSettings } from "../../../shared/types";
import { Icon } from "../../components/Icon";
import { type Tab, TabBar } from "../../components/TabBar";
import { useApi } from "../../lib/useApi";

interface ShopContextValue {
  shop: ShopSettings;
  setShop: (s: ShopSettings) => void;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop(): ShopContextValue {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside AdminLayout");
  return value;
}

const TABS: Tab[] = [
  { to: "/admin", label: "Sales", icon: "chart" },
  { to: "/admin/orders", label: "Orders", icon: "receipt" },
  { to: "/admin/menu", label: "Menu", icon: "menu" },
  { to: "/admin/customers", label: "Customers", icon: "people" },
  { to: "/admin/settings", label: "Settings", icon: "gear" },
];

export function AdminLayout({ path, children }: { path: string; children: ReactNode }) {
  const { data: shop, setData, error } = useApi<ShopSettings>("/api/admin/me");

  useEffect(() => {
    const tab = TABS.find((t) => t.to === path);
    document.title = `${tab?.label ?? "Admin"} | ${shop?.name ?? "Tatak"}`;
  }, [path, shop]);

  if (error) {
    return (
      <main className="auth">
        <div className="panel empty" style={{ marginTop: 40 }}>
          <h1 className="page-title">Your shop didn't load</h1>
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
        <span className="admin-shop">
          {shop?.logoUrl && <img className="admin-logo" src={shop.logoUrl} alt="" />}
          {shop?.name ?? ""}
        </span>
        {shop && (
          <a
            className="btn btn--ghost btn--sm"
            href={`/s/${shop.slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open your customer page"
          >
            <Icon name="external" /> <span className="hide-sm">Customer page</span>
          </a>
        )}
      </header>
      <TabBar tabs={TABS} path={path} label="Admin" />
      <main className="admin-main">
        {shop ? (
          <ShopContext.Provider value={{ shop, setShop: setData }}>{children}</ShopContext.Provider>
        ) : (
          <div className="skeleton" style={{ height: 220 }} aria-busy="true" />
        )}
      </main>
    </div>
  );
}
