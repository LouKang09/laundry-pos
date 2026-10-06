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
  Printer,
  Boxes,
  Wallet,
  ChartNoAxesCombined,
  Tags,
  UserRoundCog,
  ScrollText,
  Settings,
  LogOut,
  Waves,
  Menu,
} from "lucide-react";
import { api, post, setCsrf } from "./api";
import { Field, ErrorBox, Loading, SaveButton } from "./ui";
import { Customers, Tracking } from "./operations";
import { Dashboard, NewOrder, OrderList } from "./workflow";
import {
  Inventory,
  Expenses,
  Services,
  BusinessSettings,
} from "./management";
import { Reports } from "./reporting-page";
import { UserManagement, Logs } from "./admin-pages";
import { ReceiptCenter } from "./receipt-center";
import "./styles.css";
import { Context } from "./context";

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/new", "New Order", Plus],
  ["/orders", "Orders", Shirt],
  ["/customers", "Customers", Users],
  ["/pickup", "Pickup", PackageCheck],
  ["/transactions", "Transactions", ReceiptText],
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
        <div className="brand-symbol">
          <Waves size={40} />
        </div>
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
          <Waves size={120} />
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
    [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const onLogin = (data) => {
    setCsrf(data.csrfToken);
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
            <span className="brand-symbol">
              <Waves size={26} />
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
                  {i === 7 && <p className="navlabel">MANAGEMENT</p>}
                  <NavLink
                    to={to}
                    end={to === "/"}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={19} />
                    <span>{title}</span>
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
              <Route path="/new" element={<NewOrder />} />
              <Route path="/orders" element={<OrderList />} />
              <Route path="/pickup" element={<OrderList mode="pickup" />} />
              <Route
                path="/transactions"
                element={<OrderList mode="transactions" />}
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
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/track/:token" element={<Tracking />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  </BrowserRouter>,
);
