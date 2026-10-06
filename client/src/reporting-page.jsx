import React, { useState } from "react";
import { Printer } from "lucide-react";
import { api } from "./api";
import { useApp } from "./context";
import { SalesChart } from "./operations";
import {
  Empty,
  ErrorBox,
  Loading,
  PageHead,
  Table,
  cash,
  date,
  label,
  useData,
} from "./ui";
import { printReport, reportQuery } from "./report-print";

const localDay = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: window.businessZone || "Asia/Manila",
  });

export function Reports() {
  const [period, setPeriod] = useState("Daily"),
    [day, setDay] = useState(localDay()),
    [from, setFrom] = useState(localDay()),
    [to, setTo] = useState(localDay()),
    [printing, setPrinting] = useState(false);
  const { settings, notify } = useApp();
  const filters = { period, date: day, from, to };
  const path = reportQuery(filters);
  const { data: d, error, loading } = useData(path);
  return (
    <>
      <PageHead title="Reports" eyebrow="BUSINESS PERFORMANCE">
        <select
          aria-label="Report period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {["Daily", "Weekly", "Monthly", "Yearly", "Custom"].map((p) => (
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
            aria-label="Report date"
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        )}
        <button
          className="secondary"
          disabled={printing}
          onClick={async () => {
            setPrinting(true);
            try {
              await printReport(api, filters, settings.name);
            } catch (e) {
              notify(e.message);
            } finally {
              setPrinting(false);
            }
          }}
        >
          <Printer size={18} /> {printing ? "Preparing…" : "Print report"}
        </button>
      </PageHead>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : (
        d && (
          <>
            <p className="muted">
              {date(d.from)} – {date(d.to)} (end exclusive) · {d.timezone}
            </p>
            <div className="report-stats">
              {[
                ["Gross sales", cash(d.grossSales)],
                ["Orders", d.orders],
                ["Kilograms processed", d.kilograms],
                ["Pieces processed", d.pieces],
                ["Expenses", cash(d.expenses)],
                ["Estimated profit", cash(d.estimatedProfit)],
              ].map(([k, v]) => (
                <div className="stat" key={k}>
                  <span>{k}</span>
                  <h2>{v}</h2>
                </div>
              ))}
            </div>
            <p className="muted small">
              Sales use order-received dates, excluding cancelled orders.
              Estimated profit = sales − recorded expenses. Payment collections
              use payment dates. Processed quantities use the date laundry became
              Ready. Weekly reports start Monday.
            </p>
            <div className="dashboard-panels">
              <section className="panel">
                <h2>Sales by day</h2>
                <SalesChart rows={d.trend} />
              </section>
              <section className="panel">
                <h2>Payments collected</h2>
                <h2 className="large-number">{cash(d.paymentsReceived)}</h2>
                {d.paymentMethods.map((p) => (
                  <div className="payment-row" key={p.method}>
                    <span>{label(p.method)}</span>
                    <strong>{cash(p.amount)}</strong>
                  </div>
                ))}
              </section>
            </div>
            <section className="panel">
              <h2>Services sold</h2>
              <Table
                headers={[
                  "Service",
                  "Unit",
                  "Actual ordered",
                  "Billable",
                  "Sales",
                ]}
              >
                {d.services.map((s) => (
                  <tr key={s.name + s.unit}>
                    <td>{s.name}</td>
                    <td>{s.unit}</td>
                    <td>{s.actual}</td>
                    <td>{s.billable}</td>
                    <td>{cash(s.sales)}</td>
                  </tr>
                ))}
              </Table>
              {!d.services.length && <Empty>No services in this period.</Empty>}
            </section>
            <section className="panel">
              <h2>Staff performance</h2>
              <Table headers={["Staff", "Orders created", "Sales"]}>
                {d.staff.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td>{s.orders}</td>
                    <td>{cash(s.sales)}</td>
                  </tr>
                ))}
              </Table>
              {!d.staff.length && <Empty>No orders in this period.</Empty>}
            </section>
          </>
        )
      )}
    </>
  );
}
