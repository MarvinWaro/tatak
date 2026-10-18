import type { JSX } from "react";
import { InkFilter } from "./components/StampCard";
import { ToastProvider } from "./components/Toast";
import { Link, matchPath, usePath } from "./lib/router";
import { Register, Login } from "./pages/Auth";
import { CustomerPage } from "./pages/CustomerPage";
import { Landing } from "./pages/Landing";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { Customers } from "./pages/admin/Customers";
import { Menu } from "./pages/admin/Menu";
import { Orders } from "./pages/admin/Orders";
import { Poster } from "./pages/admin/Poster";
import { Sales } from "./pages/admin/Sales";
import { Settings } from "./pages/admin/Settings";
import { Shops } from "./pages/super/Shops";
import { SuperLayout } from "./pages/super/SuperLayout";
import { SuperLogin } from "./pages/super/SuperLogin";
import { Transactions } from "./pages/super/Transactions";
import { Usage } from "./pages/super/Usage";

const ADMIN_PAGES: Record<string, () => JSX.Element> = {
  "/admin": Sales,
  "/admin/orders": Orders,
  "/admin/menu": Menu,
  "/admin/customers": Customers,
  "/admin/settings": Settings,
};

const SUPER_PAGES: Record<string, () => JSX.Element> = {
  "/super": Shops,
  "/super/transactions": Transactions,
  "/super/usage": Usage,
};

function Routes() {
  const path = usePath().replace(/\/+$/, "") || "/";

  if (path === "/") return <Landing />;
  if (path === "/login") return <Login />;
  if (path === "/register") return <Register />;
  if (path === "/admin/poster") return <Poster />;
  if (path === "/super/login") return <SuperLogin />;

  const AdminPage = ADMIN_PAGES[path];
  if (AdminPage) {
    return (
      <AdminLayout path={path}>
        <AdminPage />
      </AdminLayout>
    );
  }

  const SuperPage = SUPER_PAGES[path];
  if (SuperPage) {
    return (
      <SuperLayout path={path}>
        <SuperPage />
      </SuperLayout>
    );
  }

  const customer = matchPath("/s/:slug", path);
  if (customer) return <CustomerPage key={customer.slug} slug={customer.slug} />;

  return (
    <main className="auth">
      <div className="panel empty" style={{ marginTop: 40 }}>
        <h1 className="page-title">This page doesn't exist</h1>
        <p>If you scanned a QR code, ask the shop for their link.</p>
        <Link to="/" className="btn">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}

export function App() {
  return (
    <ToastProvider>
      <InkFilter />
      <Routes />
    </ToastProvider>
  );
}
