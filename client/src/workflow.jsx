import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Plus,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { api, post } from "./api";
import { useApp } from "./context";
import {
  Badge,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHead,
  Pager,
  SearchBox,
  Table,
  cash,
  date,
  label,
  useData,
} from "./ui";
import {
  NewOrder as BaseNewOrder,
  OrderDetail,
} from "./operations";
import { printReport } from "./report-print";

const activeStages = ["RECEIVED", "WASHING", "DRYING", "FOLDING"];
const today = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: window.businessZone || "Asia/Manila",
  });
const prettyDay = (value) =>
  new Date(value + "T12:00:00").toLocaleDateString("en-PH", {
    timeZone: window.businessZone || "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Stat({ title, value, accent }) {
  return (
    <div className={"stat " + (accent ? "accent-stat" : "")}>
      <span>{title}</span>
      <h2>{value}</h2>
    </div>
  );
}

function LineSalesChart({ rows = [] }) {
  if (!rows.length) return <Empty>Sales will appear as orders are received.</Empty>;
  const width = 720,
    height = 230,
    left = 28,
    top = 18,
    bottom = 36,
    usableWidth = width - left * 2,
    usableHeight = height - top - bottom,
    max = Math.max(...rows.map((r) => Number(r.sales || 0)), 1),
    step = rows.length > 1 ? usableWidth / (rows.length - 1) : 0,
    points = rows.map((r, i) => ({
      ...r,
      x: left + i * step,
      y: top + usableHeight - (Number(r.sales || 0) / max) * usableHeight,
    }));
  const showEvery = Math.max(1, Math.ceil(rows.length / 8));
  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Sales trend line graph"
        style={{ width: "100%", minWidth: 560, height: 250 }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + usableHeight - ratio * usableHeight;
          return (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - left}
                y1={y}
                y2={y}
                stroke="currentColor"
                opacity="0.08"
              />
              <text x="2" y={y + 4} fontSize="10" fill="currentColor" opacity="0.6">
                {Math.round(max * ratio)}
              </text>
            </g>
          );
        })}
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={p.x} cy={p.y} r="5" fill="currentColor" />
            <title>{`${p.date}: ${cash(p.sales)} · ${p.orders} order${p.orders === 1 ? "" : "s"}`}</title>
            {(i % showEvery === 0 || i === points.length - 1) && (
              <text
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                opacity="0.75"
              >
                {p.date.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ReportPrintControls() {
  const { settings, notify } = useApp();
  const [period, setPeriod] = useState("Daily"),
    [day, setDay] = useState(today()),
    [from, setFrom] = useState(today()),
    [to, setTo] = useState(today()),
    [busy, setBusy] = useState(false);
  return (
    <div className="filters" style={{ marginTop: 12 }}>
      <select
        aria-label="Dashboard report period"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      >
        {["Daily", "Weekly", "Monthly", "Custom"].map((p) => (
          <option key={p} value={p}>
            {p === "Custom" ? "Custom range" : p}
          </option>
        ))}
      </select>
      {period === "Custom" ? (
        <>
          <input
            aria-label="Custom report start"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            aria-label="Custom report end"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </>
      ) : (
        <input
          aria-label="Dashboard report date"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await printReport(
              api,
              { period, date: day, from, to },
              settings.name,
            );
          } catch (error) {
            notify(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing…" : "Print report"}
      </button>
    </div>
  );
}

export function Dashboard() {
  const [rev, setRev] = useState(0),
    [viewMode, setViewMode] = useState("single"),
    [viewDate, setViewDate] = useState(today()),
    [rangeFrom, setRangeFrom] = useState(today()),
    [rangeTo, setRangeTo] = useState(today());

  const path =
    viewMode === "range"
      ? "/dashboard?from=" +
        encodeURIComponent(rangeFrom) +
        "&to=" +
        encodeURIComponent(rangeTo)
      : "/dashboard?date=" + encodeURIComponent(viewDate);
  const { data: d, error, loading } = useData(path, rev);
  const { user, admin } = useApp();

  const isTodayView = viewMode === "single" && viewDate === today(),
    isRangeView = viewMode === "range",
    viewLabel = isRangeView
      ? rangeFrom === rangeTo
        ? prettyDay(rangeFrom)
        : `${prettyDay(rangeFrom)} – ${prettyDay(rangeTo)}`
      : isTodayView
        ? "Today"
        : prettyDay(viewDate),
    endLabel = isRangeView ? prettyDay(rangeTo) : viewLabel;

  useEffect(() => {
    const id = setInterval(() => {
      if (isTodayView) setRev((v) => v + 1);
    }, 30000);
    return () => clearInterval(id);
  }, [isTodayView]);

  const goToday = () => {
    const current = today();
    setViewMode("single");
    setViewDate(current);
    setRangeFrom(current);
    setRangeTo(current);
  };

  const stageCard = (status) => {
    const content = (
      <>
        <Badge value={status} />
        <strong>{d.statuses[status] || 0}</strong>
        <span>orders</span>
      </>
    );
    return isTodayView ? (
      <Link
        to={"/orders?status=" + status}
        className={"stage-card " + status.toLowerCase()}
        key={status}
      >
        {content}
      </Link>
    ) : (
      <div
        className={"stage-card " + status.toLowerCase()}
        key={status}
        title={
          isRangeView
            ? "End-of-range snapshot as of " + endLabel
            : "Historical end-of-day snapshot for " + viewLabel
        }
      >
        {content}
      </div>
    );
  };

  return (
    <>
      <PageHead
        title={`Good ${new Date().getHours() < 12 ? "morning" : "day"}, ${user.name.split(" ")[0]}`}
      >
        <div className="filters" style={{ margin: 0 }}>
          <span
            className="muted"
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <CalendarDays size={16} /> Dashboard view
          </span>
          <select
            aria-label="Dashboard date mode"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="single">Single date</option>
            <option value="range">Custom range</option>
          </select>
          {isRangeView ? (
            <>
              <input
                aria-label="Dashboard range start"
                type="date"
                value={rangeFrom}
                max={today()}
                onChange={(e) => {
                  const next = e.target.value || today();
                  setRangeFrom(next);
                  if (rangeTo < next) setRangeTo(next);
                }}
              />
              <span className="muted">to</span>
              <input
                aria-label="Dashboard range end"
                type="date"
                value={rangeTo}
                min={rangeFrom}
                max={today()}
                onChange={(e) => setRangeTo(e.target.value || rangeFrom)}
              />
            </>
          ) : (
            <input
              aria-label="Dashboard view date"
              type="date"
              value={viewDate}
              max={today()}
              onChange={(e) => setViewDate(e.target.value || today())}
            />
          )}
          {!isTodayView && (
            <button className="secondary" onClick={goToday}>
              Today
            </button>
          )}
        </div>
        <button className="secondary" onClick={() => setRev((v) => v + 1)}>
          <RefreshCw size={17} /> Refresh
        </button>
        <Link className="primary" to="/new">
          <Plus size={19} /> {admin ? "Manual add" : "New order"}
        </Link>
      </PageHead>

      {!isTodayView && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <strong>
            {isRangeView ? "Custom range" : "Backdate view"} · {viewLabel}
          </strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            {isRangeView
              ? `Sales, orders, and claims are totaled across this range. Workflow stages and unpaid orders show the snapshot at the end of ${endLabel}.`
              : "Sales, orders, claims, and workflow stages below are reconstructed for this date. Stage cards show the end-of-day snapshot and do not open the current Orders queue."}
          </p>
        </section>
      )}

      {!admin && isTodayView && (
        <p className="muted">
          Dashboard defaults to today. Use Dashboard view above for a previous
          date or a custom date range. Pickup continues to show all Ready and
          unclaimed orders.
        </p>
      )}

      <ErrorBox message={error} />
      {loading && !d ? (
        <Loading />
      ) : (
        d && (
          <>
            <div className="summary-grid">
              <div className="stat hero-stat">
                <span>
                  {isTodayView
                    ? "Today's sales"
                    : isRangeView
                      ? `Sales · ${viewLabel}`
                      : `Sales · ${viewLabel}`}
                </span>
                <h2>{cash(d.todaySales)}</h2>
                <small>
                  {isTodayView
                    ? "Orders received today · excludes cancellations"
                    : isRangeView
                      ? `Orders received across ${viewLabel} · excludes cancellations`
                      : `Orders received ${viewLabel} · excludes cancellations`}
                </small>
              </div>
              <Stat
                title={
                  isTodayView
                    ? "Today's orders"
                    : isRangeView
                      ? "Orders in range"
                      : `Orders · ${viewLabel}`
                }
                value={d.todayOrders}
              />
              <Stat
                title={
                  isTodayView
                    ? admin
                      ? "Active orders"
                      : "Today's active orders"
                    : isRangeView
                      ? "Active at range end"
                      : "Active at day end"
                }
                value={d.activeOrders}
              />
              <Stat
                title={
                  isTodayView
                    ? admin
                      ? "Ready for pickup"
                      : "Ready today"
                    : isRangeView
                      ? "Ready at range end"
                      : "Ready at day end"
                }
                value={d.statuses.READY || 0}
                accent
              />
            </div>

            <div className="section-title">
              <div>
                <h2>
                  {isTodayView
                    ? admin
                      ? "On the floor"
                      : "Today's work"
                    : isRangeView
                      ? `End-of-range stage · ${endLabel}`
                      : `End-of-day stage · ${viewLabel}`}
                </h2>
                {!isTodayView && (
                  <span className="muted">
                    {isRangeView
                      ? `Orders received in the selected range, as of ${endLabel}`
                      : "Historical workflow snapshot"}
                  </span>
                )}
              </div>
              {isTodayView && (
                <Link to="/orders">
                  View orders <ArrowRight size={16} />
                </Link>
              )}
            </div>

            <div className="stage-cards">{activeStages.map(stageCard)}</div>

            {admin && (
              <section className="panel" style={{ marginTop: 18 }}>
                <div className="section-title">
                  <div>
                    <h2>Sales trend</h2>
                    <span className="muted">
                      {isTodayView
                        ? "Connected daily graph · last 7 days"
                        : isRangeView
                          ? `Selected range · ${viewLabel}`
                          : `7-day trend ending ${viewLabel}`}
                    </span>
                  </div>
                </div>
                <LineSalesChart rows={d.trend} />
                <div className="section-title" style={{ marginTop: 14 }}>
                  <div>
                    <h3>Print business report</h3>
                    <span className="muted">
                      Daily, weekly, monthly, or custom range
                    </span>
                  </div>
                </div>
                <ReportPrintControls />
              </section>
            )}

            <div className="quick-stats">
              <Stat
                title={
                  isTodayView
                    ? "Claimed today"
                    : isRangeView
                      ? "Claimed in range"
                      : `Claimed · ${viewLabel}`
                }
                value={d.claimedToday}
              />
              <Stat
                title={
                  isTodayView
                    ? admin
                      ? "Unpaid orders"
                      : "Today's unpaid orders"
                    : isRangeView
                      ? "Unpaid at range end"
                      : "Unpaid at day end"
                }
                value={d.unpaidOrders}
              />
              {admin && (
                <Stat
                  title={isTodayView ? "Low inventory" : "Low inventory now"}
                  value={d.lowInventory}
                />
              )}
            </div>
          </>
        )
      )}
    </>
  );
}

export function NewOrder() {
  const { admin, notify } = useApp();
  const blockSave = (event) => {
    if (!admin) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".order-summary button.primary.full")) {
      event.preventDefault();
      event.stopPropagation();
      notify("Admin can review New Order, but only Laundry Staff can save an order.");
    }
  };
  return (
    <div
      className={admin ? "admin-order-readonly" : ""}
      onClickCapture={blockSave}
      onKeyDownCapture={(event) => {
        if ((event.key === "Enter" || event.key === " ") && admin) blockSave(event);
      }}
    >
      {admin && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <strong>Admin view only</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            New Order stays visible for reference, but only Laundry Staff can save
            an order.
          </p>
        </section>
      )}
      {admin && (
        <style>{`.admin-order-readonly .order-summary button.primary.full{opacity:.45;filter:grayscale(1);cursor:not-allowed}`}</style>
      )}
      <BaseNewOrder />
    </div>
  );
}

function extractToken(value) {
  const match = String(value || "").match(/[a-f0-9]{48}/i);
  return match?.[0]?.toLowerCase() || "";
}

function QrScanner({ onClose, onDetected }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  useEffect(() => {
    let stream,
      frame,
      stopped = false;
    async function start() {
      if (!("BarcodeDetector" in window)) {
        setError(
          "Camera QR scanning is not available in this browser. Paste the QR tracking link below instead.",
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access is not available. Paste the QR tracking link below.");
        return;
      }
      try {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        const scan = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const raw = codes?.[0]?.rawValue;
              if (raw) {
                const token = extractToken(raw);
                if (token) {
                  stopped = true;
                  onDetected(token);
                  return;
                }
              }
            }
          } catch {
            // Keep scanning; a single unreadable frame is normal.
          }
          frame = requestAnimationFrame(scan);
        };
        scan();
      } catch (e) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission was not granted. You can paste the QR tracking link below."
            : "Unable to start the QR camera. You can paste the QR tracking link below.",
        );
      }
    }
    start();
    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);
  return (
    <Modal title="Scan order QR" onClose={onClose}>
      <p className="muted">
        Scan the STAFF COPY QR to open the order workflow. The customer-copy QR is only for status lookup. The next phase is confirmed before anything changes.
      </p>
      <ErrorBox message={error} />
      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          background: "#111",
          minHeight: 220,
          display: "grid",
          placeItems: "center",
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: "100%", maxHeight: 360, objectFit: "cover" }}
        />
      </div>
      <form
        style={{ marginTop: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          const token = extractToken(manual);
          if (!token) {
            setError("Paste a valid Laundry POS staff workflow QR link or token.");
            return;
          }
          onDetected(token);
        }}
      >
        <label className="field">
          <span>Or paste staff workflow QR link</span>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="https://…/scan/…"
          />
        </label>
        <button className="secondary" type="submit">
          <QrCode size={18} /> Use staff QR link
        </button>
      </form>
    </Modal>
  );
}

export function StaffQrWorkflow() {
  const { token = "" } = useParams();
  const { notify } = useApp();
  const [order, setOrder] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [machine, setMachine] = useState(""),
    [busy, setBusy] = useState(false),
    [stepSaved, setStepSaved] = useState(false),
    [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSuccess("");
    setStepSaved(false);
    api("/orders/scan/" + token)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
        setMachine(result.washingMachine || "");
      })
      .catch((err) => {
        if (cancelled) return;
        setOrder(null);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function advancePhase() {
    if (!order?.nextStatus || stepSaved) return;
    const targetStatus = order.nextStatus;
    setBusy(true);
    setError("");
    try {
      await post("/orders/" + order.id + "/status", {
        status: targetStatus,
        ...(targetStatus === "WASHING" ? { washingMachine: machine.trim() } : {}),
      });
      setStepSaved(true);
      setSuccess(`${order.orderNumber}: ${label(order.status)} → ${label(targetStatus)} saved.`);
      notify(`${order.orderNumber} moved to ${label(targetStatus)}.`);
      try {
        const updated = await api("/orders/scan/" + token);
        setOrder(updated);
        setMachine(updated.washingMachine || "");
      } catch {
        // The phase update is already saved; the next scan will reload the latest status.
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Staff QR workflow" eyebrow="SCAN RECEIPT · UPDATE PHASE">
        <Link className="secondary" to="/orders">Back to Orders</Link>
      </PageHead>
      <section className="panel">
        <p className="muted">
          Staff-only workflow. Each phase change is saved with the signed-in staff account and timestamp. Scan the staff QR again when the next phase is ready.
        </p>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : order ? (
          <>
            <div className="detail-heading">
              <div>
                <h2>{order.orderNumber}</h2>
                <p>
                  {order.customerName}
                  {order.customerRoomUnit ? " · Room / Unit: " + order.customerRoomUnit : ""}
                </p>
              </div>
              <div className="actions">
                <Badge value={order.status} />
                <Badge value={order.paymentStatus} />
              </div>
            </div>
            {order.washingMachine && <p>Washing machine: <strong>{order.washingMachine}</strong></p>}
            {success && <p role="status" className="muted">{success}</p>}
            {order.nextStatus ? (
              <div style={{ marginTop: 18 }}>
                <h3>Next phase: {label(order.nextStatus)}</h3>
                {order.blockedReason && <ErrorBox message={order.blockedReason} />}
                {order.nextStatus === "WASHING" && (
                  <Field label="Washing machine / machine number">
                    <input
                      value={machine}
                      onChange={(event) => setMachine(event.target.value)}
                      placeholder="e.g. Washer 1 · 12 kg"
                      maxLength={80}
                      required
                    />
                  </Field>
                )}
                {stepSaved ? (
                  <p className="muted">This phase is saved. Scan the Staff Copy QR again to record the next phase when it is ready.</p>
                ) : order.blockedReason ? (
                  <Link className="secondary" to="/pickup">Open Pickup queue</Link>
                ) : (
                  <button
                    className="primary"
                    disabled={busy || (order.nextStatus === "WASHING" && !machine.trim())}
                    onClick={advancePhase}
                  >
                    {busy ? "Saving phase…" : `Confirm ${label(order.nextStatus)}`}
                    <ArrowRight size={18} />
                  </button>
                )}
              </div>
            ) : (
              <p className="muted">This order has completed the laundry workflow. Current status: {label(order.status)}.</p>
            )}
          </>
        ) : null}
      </section>
    </>
  );
}
export function OrderList({ mode = "orders" }) {
  const initialStatus = new URLSearchParams(location.search).get("status") || "";
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(
      mode === "orders" && activeStages.includes(initialStatus) ? initialStatus : "",
    ),
    [page, setPage] = useState(1),
    [rev, setRev] = useState(0),
    [selected, setSelected] = useState(null),
    [scanner, setScanner] = useState(false),
    [scanResult, setScanResult] = useState(null),
    [scanMachine, setScanMachine] = useState(""),
    [scanError, setScanError] = useState(""),
    [scanBusy, setScanBusy] = useState(false);
  const { admin, notify } = useApp();
  const path =
    "/orders?q=" +
    encodeURIComponent(q) +
    "&page=" +
    page +
    "&view=" +
    mode +
    (mode === "orders" && status ? "&status=" + status : "");
  const { data, error, loading } = useData(path, rev);
  useEffect(() => setPage(1), [q, status, mode]);
  const title =
    mode === "pickup"
      ? "Pickup & claim"
      : mode === "transactions"
        ? "Transactions"
        : "Orders";
  async function resolveScan(token) {
    setScanner(false);
    setScanError("");
    try {
      const result = await api("/orders/scan/" + token);
      setScanMachine(result.washingMachine || "");
      setScanResult(result);
    } catch (e) {
      setScanError(e.message);
    }
  }
  return (
    <>
      <PageHead title={title}>
        <button className="secondary" onClick={() => setScanner(true)}>
          <Camera size={18} /> Scan QR
        </button>
        <Link to="/new" className="primary">
          <Plus size={18} /> New order
        </Link>
      </PageHead>
      {!admin && mode !== "pickup" && (
        <p className="muted">
          {mode === "orders"
            ? "Laundry Staff Orders shows today's Received, Washing, Drying, and Folding work only."
            : "Laundry Staff Transactions shows today's claimed transactions only."}
        </p>
      )}
      <section className="panel">
        <div className="filters">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search order #, customer, phone, or QR tracking link"
          />
          {mode === "orders" && (
            <select
              aria-label="Laundry status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All active phases</option>
              {activeStages.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          )}
          <button
            className="secondary"
            onClick={() => setRev((v) => v + 1)}
            aria-label="Refresh orders"
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {mode === "orders" && (
          <p className="muted">
            Orders contains only Received, Washing, Drying, and Folding. Ready
            orders move to Pickup automatically.
          </p>
        )}
        {mode === "pickup" && (
          <p className="muted">
            Pickup contains every Ready and unclaimed order, whether paid or
            unpaid. Claimed orders move to Transactions automatically.
          </p>
        )}
        {mode === "transactions" && (
          <p className="muted">
            Transactions contains claimed orders. Admin sees the full history;
            Laundry Staff sees today's claimed transactions.
          </p>
        )}
        <ErrorBox message={scanError || error} />
        {loading ? (
          <Loading />
        ) : data?.rows.length ? (
          <>
            <Table
              headers={[
                "Order / received",
                "Customer",
                "Services · actual → billable",
                "Total",
                "Payment",
                "Status",
                "Staff / claimed",
                "",
              ]}
            >
              {data.rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button className="text-button" onClick={() => setSelected(o.id)}>
                      {o.orderNumber}
                    </button>
                    <small>{date(o.createdAt)}</small>
                  </td>
                  <td>
                    <strong>{o.customerName}</strong>
                    <small>{o.customerPhone}{o.customerRoomUnit ? " · " + o.customerRoomUnit : ""}</small>
                    {o.washingMachine && <small>Machine: {o.washingMachine}</small>}
                  </td>
                  <td>
                    {o.items.map((i) => (
                      <div key={i.id}>
                        {i.serviceName}
                        <small>
                          {i.actualQuantity} → {i.billableQuantity} {i.unit} · {i.express ? "Express" : "Regular"}
                        </small>
                      </div>
                    ))}
                  </td>
                  <td className="money">{cash(o.total)}</td>
                  <td>
                    <Badge value={o.paymentStatus} />
                    <small>{o.payment?.method || "—"}</small>
                  </td>
                  <td><Badge value={o.status} /></td>
                  <td>
                    {o.user.name}
                    <small>{o.claimedAt ? date(o.claimedAt) : "Not claimed"}</small>
                  </td>
                  <td>
                    <button className="secondary" onClick={() => setSelected(o.id)}>
                      {mode === "pickup" ? "Process" : "Open"}
                      <ArrowRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={data.total} onChange={setPage} />
          </>
        ) : (
          <Empty>No matching orders.</Empty>
        )}
      </section>
      {selected && (
        <OrderDetail
          id={selected}
          onClose={() => {
            setSelected(null);
            setRev((v) => v + 1);
          }}
          onChanged={() => setRev((v) => v + 1)}
        />
      )}
      {scanner && (
        <QrScanner onClose={() => setScanner(false)} onDetected={resolveScan} />
      )}
      {scanResult && (
        <Modal title="QR status update" onClose={() => setScanResult(null)}>
          <div className="detail-heading">
            <div>
              <h2>{scanResult.orderNumber}</h2>
              <p>{scanResult.customerName}</p>
            </div>
            <div className="actions">
              <Badge value={scanResult.status} />
              <Badge value={scanResult.paymentStatus} />
            </div>
          </div>
          {scanResult.nextStatus ? (
            <>
              <p>
                Do you want to move this transaction from <strong>{label(scanResult.status)}</strong> to <strong>{label(scanResult.nextStatus)}</strong>?
              </p>
              {scanResult.blockedReason && (
                <ErrorBox message={scanResult.blockedReason} />
              )}
              {scanResult.nextStatus === "WASHING" && (
                <Field label="Washing machine / machine number">
                  <input
                    value={scanMachine}
                    onChange={(event) => setScanMachine(event.target.value)}
                    placeholder="e.g. Washer 1 · 12 kg"
                    maxLength={80}
                    required
                  />
                </Field>
              )}
              <div className="actions">
                <button className="secondary" onClick={() => setScanResult(null)}>
                  No
                </button>
                {scanResult.blockedReason ? (
                  <button
                    className="primary"
                    onClick={() => {
                      setSelected(scanResult.id);
                      setScanResult(null);
                    }}
                  >
                    Open order
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={scanBusy || (scanResult.nextStatus === "WASHING" && !scanMachine.trim())}
                    onClick={async () => {
                      setScanBusy(true);
                      try {
                        await post("/orders/" + scanResult.id + "/status", {
                          status: scanResult.nextStatus,
                          ...(scanResult.nextStatus === "WASHING"
                            ? { washingMachine: scanMachine.trim() }
                            : {}),
                        });
                        notify(
                          `${scanResult.orderNumber} moved to ${label(scanResult.nextStatus)}`,
                        );
                        setScanResult(null);
                        setRev((v) => v + 1);
                      } catch (e) {
                        setScanError(e.message);
                        setScanResult(null);
                      } finally {
                        setScanBusy(false);
                      }
                    }}
                  >
                    {scanBusy ? "Updating…" : `Yes, move to ${label(scanResult.nextStatus)}`}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                This transaction is already {label(scanResult.status)} and has no next workflow phase.
              </p>
              <button className="secondary" onClick={() => setScanResult(null)}>
                Close
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
