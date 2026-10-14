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

const ADMIN_PAGES: Record<string, () => JSX.Element> = {
  "/admin": Sales,
  "/admin/orders": Orders,
  "/admin/menu": Menu,
  "/admin/customers": Customers,
  "/admin/settings": Settings,
};

function Routes() {
  const path = usePath().replace(/\/+$/, "") || "/";

  if (path === "/") return <Landing />;
  if (path === "/login") return <Login />;
  if (path === "/register") return <Register />;
  if (path === "/admin/poster") return <Poster />;

  const AdminPage = ADMIN_PAGES[path];
  if (AdminPage) {
    return (
      <AdminLayout path={path}>
        <AdminPage />
      </AdminLayout>
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
