import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  Plus,
  Shirt,
  Users,
  PackageCheck,
  ReceiptText,
  Trash2,
  Printer,
  Boxes,
  Wallet,
  ChartNoAxesCombined,
  Tags,
  UserRoundCog,
  ScrollText,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { api, post, setCsrf } from "./api";
import { Field, ErrorBox, Loading, SaveButton } from "./ui";
import { Customers, Tracking } from "./operations";
import { Dashboard, OrderList, StaffQrWorkflow } from "./workflow";
import { PosOrder } from "./pos-order-loads";
import { AdminHistoricalOrder } from "./admin-historical-load-order";
import {
  Inventory,
  Expenses,
  BusinessSettings,
} from "./management";
import { Services } from "./services-load-pricing";
import { Reports } from "./reporting-page";
import { UserManagement, Logs } from "./admin-pages";
import { ReceiptCenter } from "./receipt-center";
import "./styles.css";
import { Context } from "./context";
import { OFFICIAL_LOGO, installBrandIcon } from "./brand";

installBrandIcon();

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/new", "New Order", Plus],
  ["/orders", "Orders", Shirt],
  ["/customers", "Customers", Users],
  ["/pickup", "Pickup", PackageCheck],
  ["/transactions", "Transactions", ReceiptText],
  ["/deleted-transactions", "Deleted Transactions", Trash2, true],
  ["/receipts", "Receipt Center", Printer],
  ["/inventory", "Inventory", Boxes, true],
  ["/expenses", "Expenses", Wallet, true],
  ["/reports", "Reports", ChartNoAxesCombined, true],
  ["/services", "Services", Tags, true],
  ["/users", "Users", UserRoundCog, true],
  ["/logs", "System Logs", ScrollText, true],
  ["/settings", "Settings", Settings, true],
];
function Login({ onLogin }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [setupAvailable, setSetupAvailable] = useState(false),
    [setup, setSetup] = useState(false),
    [created, setCreated] = useState(false);
  useEffect(() => {
    api("/auth/setup-status")
      .then((v) => setSetupAvailable(v.available))
      .catch(() => {});
  }, []);
  return (
    <div className="login">
      <section className="login-brand">
        <span className="brand-mark brand-mark-login">
          <img src={OFFICIAL_LOGO} alt="Laundry POS logo" />
        </span>
        <p className="eyebrow">LAUNDRY POS</p>
        <h1>
          A fresh start.
          <br />
          Every day.
        </h1>
        <p>
          Orders, laundry progress, and pickups.
          <br />
          One place to keep the day moving.
        </p>
        <div className="laundry-loop">
          <img src={OFFICIAL_LOGO} alt="" />
        </div>
      </section>
      <section className="login-panel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              if (setup) {
                await post("/auth/setup", Object.fromEntries(f));
                setSetup(false);
                setSetupAvailable(false);
                setCreated(true);
              } else onLogin(await post("/auth/login", Object.fromEntries(f)));
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="eyebrow">WELCOME BACK</p>
          <h2>
            {setup ? "Create your first Admin" : "Sign in to your workspace"}
          </h2>
          <p className="muted">
            {setup
              ? "Enter your private setup key and choose your sign-in details."
              : created
                ? "Admin created. Sign in with your new credentials."
                : "Use your Admin or Laundry Staff account."}
          </p>
          {setup && (
            <>
              <Field
                label="Setup key"
                type="password"
                name="setupKey"
                required
                autoComplete="off"
              />
              <Field label="Your name" name="name" required maxLength={160} />
            </>
          )}
          <ErrorBox message={error} />
          <Field
            label="Email address"
            type="email"
            name="email"
            autoComplete="username"
            required
            autoFocus
          />
          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete={setup ? "new-password" : "current-password"}
            minLength={setup ? 12 : undefined}
            required
          />
          <SaveButton busy={busy}>
            {setup ? "Create Admin" : "Sign in"}
          </SaveButton>
          {setupAvailable && (
            <button
              type="button"
              className="text-button full"
              onClick={() => {
                setSetup(!setup);
                setError("");
              }}
            >
              {setup ? "Back to sign in" : "First-time Admin setup"}
            </button>
          )}
          <p className="small muted">
            Need an account? Ask your administrator.
          </p>
        </form>
      </section>
    </div>
  );
}
function Shell() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [settings, setSettings] = useState({ name: "Laundry POS" }),
    [notice, setNotice] = useState(""),
    [open, setOpen] = useState(false),
    [updateAvailable, setUpdateAvailable] = useState(false);
  const navigate = useNavigate();
  // An open SPA tab retains the exact JS bundle loaded at the time it opened.
  // Poll the deployed bundle fingerprint and surface an explicit refresh option.
  // Never refresh silently: staff may have an unsaved order in progress.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const loadedEntry = new URL(import.meta.url).pathname;
    let active = true;
    const checkVersion = async () => {
      try {
        const response = await fetch("/api/app-version", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const { entry } = await response.json();
        if (active && entry && entry !== loadedEntry) setUpdateAvailable(true);
      } catch {
        // A transient loss of connectivity should not interrupt checkout.
      }
    };
    checkVersion();
    const interval = setInterval(checkVersion, 60000);
    window.addEventListener("focus", checkVersion);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", checkVersion);
    };
  }, []);
  const onLogin = (data) => {
    setCsrf(data.csrfToken, data.user.id);
    setUser(data.user);
  };
  useEffect(() => {
    api("/auth/me")
      .then(onLogin)
      .catch(() => {})
      .finally(() => setLoading(false));
    const expired = () => {
      setUser(null);
      setCsrf("");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (user)
      api("/settings")
        .then((v) => {
          setSettings(v);
          window.businessZone = v.timezone;
        })
        .catch(() => {});
  }, [user]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  if (loading) return <Loading />;
  if (!user) return <Login onLogin={onLogin} />;
  const admin = user.role === "ADMIN";
  const guarded = (element) => (admin ? element : <Navigate to="/" replace />);
  return (
    <Context.Provider
      value={{ user, admin, settings, setSettings, notify: setNotice }}
    >
      <div className="app">
        <aside className={open ? "open" : ""}>
          <NavLink to="/" className="brand">
            <span className="brand-mark">
              <img src={OFFICIAL_LOGO} alt="" />
            </span>
            <span>
              {settings.name}
              <small>WORKSPACE</small>
            </span>
          </NavLink>
          <p className="navlabel">WORKDAY</p>
          <nav>
            {nav
              .filter((n) => !n[3] || admin)
              .map(([to, title, Icon], i) => (
                <React.Fragment key={to}>
                  {i === 8 && <p className="navlabel">MANAGEMENT</p>}
                  <NavLink
                    to={to}
                    end={to === "/"}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={19} />
                    <span>{admin && to === "/new" ? "Manual Add" : title}</span>
                    {to === "/new" && <kbd>+</kbd>}
                  </NavLink>
                </React.Fragment>
              ))}
          </nav>
          <div className="account">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{admin ? "Admin" : "Laundry Staff"}</small>
            </div>
            <button
              className="icon"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await post("/auth/logout");
                  setUser(null);
                  setCsrf("");
                  navigate("/");
                } catch (e) {
                  setNotice(e.message);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <div className="workspace">
          {updateAvailable && (
            <div className="app-update-notice" role="status">
              <div>
                <strong>Updated Laundry POS is ready</strong>
                <span>Finish or save your current work, then refresh to load the newest order and payment features.</span>
              </div>
              <button
                type="button"
                className="app-update-button"
                onClick={() => {
                  if (window.confirm("Refresh Laundry POS now? Unsaved form changes will be lost."))
                    window.location.reload();
                }}
              >Refresh app</button>
            </div>
          )}
          <header className="topbar">
            <button
              className="icon mobile-menu"
              aria-label="Open navigation"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <span>YOUR DAILY WORKSPACE</span>
            <span>
              {new Date().toLocaleDateString("en-PH", {
                timeZone: settings.timezone || "Asia/Manila",
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </header>
          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route
                path="/new"
                element={admin ? <AdminHistoricalOrder /> : <PosOrder />}
              />
              <Route path="/orders" element={<OrderList />} />
              <Route path="/scan/:token" element={<StaffQrWorkflow />} />
              <Route path="/pickup" element={<OrderList mode="pickup" />} />
              <Route
                path="/transactions"
                element={<OrderList mode="transactions" />}
              />
              <Route
                path="/deleted-transactions"
                element={guarded(<OrderList mode="transactions" deletedOnly />)}
              />
              <Route path="/receipts" element={<ReceiptCenter />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/inventory" element={guarded(<Inventory />)} />
              <Route path="/expenses" element={guarded(<Expenses />)} />
              <Route path="/reports" element={guarded(<Reports />)} />
              <Route path="/services" element={guarded(<Services />)} />
              <Route path="/users" element={guarded(<UserManagement />)} />
              <Route path="/logs" element={guarded(<Logs />)} />
              <Route path="/settings" element={guarded(<BusinessSettings />)} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        {notice && (
          <div role="status" className="toast">
            {notice}
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("Laundry POS page failed to render", error, info);
    const path = window.location.pathname;
    const route = path.startsWith("/scan/")
      ? "staff-scan"
      : path.startsWith("/track/")
        ? "customer-track"
        : "other";
    try {
      fetch("/api/client-errors", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route,
          message: String(error?.message || "Unknown React render error").slice(0, 300),
          componentStack: String(info?.componentStack || "").slice(0, 2000),
        }),
      }).catch(() => {});
    } catch {
      // Error reporting must never prevent the fallback screen from rendering.
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="tracking">
          <section className="tracking-card">
            <span className="brand-mark brand-mark-tracking">
              <img src={OFFICIAL_LOGO} alt="Laundry POS logo" />
            </span>
            <p className="eyebrow">LAUNDRY POS</p>
            <h1>We couldn’t open this page.</h1>
            <p className="muted">
              Refresh the page to try again. If this continues, return to Laundry POS
              and reopen the QR code.
            </p>
            <button className="primary" onClick={() => window.location.reload()}>
              Refresh page
            </button>
            <p><a href="/">Return to Laundry POS</a></p>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/track/:token" element={<Tracking />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </BrowserRouter>
  </AppErrorBoundary>,
);
