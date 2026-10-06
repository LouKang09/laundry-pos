import React, { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { post } from "./api";
import { useApp } from "./context";
import {
  Badge,
  Empty,
  ErrorBox,
  Loading,
  PageHead,
  Pager,
  SearchBox,
  Table,
  cash,
  date,
  useData,
} from "./ui";

function Receipt({ data: o, onClose }) {
  return (
    <div className="receipt-overlay">
      <div className="receipt-controls">
        <button className="primary" onClick={() => window.print()}>
          <Printer size={18} /> Print
        </button>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <article className="receipt">
        <h2>{o.business.name}</h2>
        <p>ORDER / CLAIM RECEIPT · COPY {o.copy}</p>
        <h3>{o.orderNumber}</h3>
        <p>
          {o.customerName}
          <br />
          {o.customerPhone}
        </p>
        <p>{date(o.createdAt)}</p>
        <hr />
        {o.items.map((i) => (
          <div key={i.id}>
            <strong>
              {i.serviceName} · {i.express ? "Express" : "Regular"}
            </strong>
            <p>
              Actual: {i.actualQuantity} {i.unit}
              <br />
              {i.pricingLabel ? (
                <>
                  Pricing: {i.pricingLabel}
                  <br />
                  Charged capacity: {i.billableQuantity} {i.unit}
                </>
              ) : (
                <>Billable: {i.billableQuantity} {i.unit} × {cash(i.unitPrice)}</>
              )}
              <b className="right">{cash(i.total)}</b>
            </p>
          </div>
        ))}
        <hr />
        <h3>
          Total <span className="right">{cash(o.total)}</span>
        </h3>
        <p>
          {o.paymentStatus}
          {o.payment ? " · " + o.payment.method : ""}
        </p>
        <p>
          Approximate pickup
          <br />
          {date(o.estimatedFrom)} – {date(o.estimatedTo)}
          <br />
          <small>Timing may change. Check tracking for updates.</small>
        </p>
        <img src={o.qr} alt="Scan to track and update this order" />
        <p>
          Scan for laundry progress.
          <br />
          Keep this receipt for pickup.
        </p>
      </article>
    </div>
  );
}

export function ReceiptCenter() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState(null);
  const { admin, notify } = useApp();
  const { data, error: loadError, loading } = useData(
    "/orders?view=customer&q=" + encodeURIComponent(q) + "&page=" + page,
    rev,
  );
  useEffect(() => setPage(1), [q]);

  async function printOrder(order) {
    setBusy(order.id);
    setError("");
    try {
      const path = admin
        ? `/orders/${order.id}/receipt`
        : `/orders/${order.id}/staff-receipt`;
      const result = await post(path);
      setReceipt(result);
      setRev((v) => v + 1);
    } catch (e) {
      setError(e.message);
      notify(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHead title="Receipt Center" eyebrow="PRINT & REPRINT">
        <button className="secondary" onClick={() => setRev((v) => v + 1)}>
          <RefreshCw size={18} /> Refresh
        </button>
      </PageHead>
      <p className="muted">
        {admin
          ? "Print or reprint a QR receipt for any transaction."
          : "Print or reprint today's transaction receipts. The QR is used to move laundry through each phase."}
      </p>
      <section className="panel">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search order #, customer, phone, or QR tracking link"
        />
        <ErrorBox message={error || loadError} />
        {loading ? (
          <Loading />
        ) : data?.rows.length ? (
          <>
            <Table
              headers={[
                "Order / received",
                "Customer",
                "Total",
                "Payment",
                "Status",
                "Printed",
                "",
              ]}
            >
              {data.rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.orderNumber}</strong>
                    <small>{date(o.createdAt)}</small>
                  </td>
                  <td>
                    {o.customerName}
                    <small>{o.customerPhone}</small>
                  </td>
                  <td className="money">{cash(o.total)}</td>
                  <td>
                    <Badge value={o.paymentStatus} />
                    <small>{o.payment?.method || "—"}</small>
                  </td>
                  <td>
                    <Badge value={o.status} />
                  </td>
                  <td>{o.printCount || 0}</td>
                  <td>
                    <button
                      className="primary"
                      disabled={busy === o.id}
                      onClick={() => printOrder(o)}
                    >
                      <Printer size={17} />
                      {busy === o.id
                        ? "Preparing…"
                        : o.printCount
                          ? "Reprint"
                          : "Print receipt"}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={data.total} onChange={setPage} />
          </>
        ) : (
          <Empty>No transactions found.</Empty>
        )}
      </section>
      {receipt && <Receipt data={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}
