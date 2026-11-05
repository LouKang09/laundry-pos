import React, { useEffect, useMemo, useState } from "react";
import { Printer, Save, RefreshCw } from "lucide-react";
import { api, put } from "./api";
import { PageHead, ErrorBox, cash, Loading } from "./ui";
import "./cash-flow.css";

function localDay(zone = "Asia/Manila") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return p.year + "-" + p.month + "-" + p.day;
}
const initialDay = localDay();
const blank = { pettyCashOverride: "", bankPettyOverride: "", actual: "", creditToBank: "0", debitFromBank: "0", note: "" };
const numberInput = (value) => value === null || value === undefined ? "" : String(value);
const showMoney = (value) => value == null ? "—" : cash(value);
const columns = [
  "Date", "Petty Cash", "Daily Income", "Cash", "GCash", "GCash Txns",
  "Other Banks", "Cash + GCash", "Total Txns", "Expenses", "Expected Total",
  "Actual", "Variance", "Bank Petty", "Credit to Bank", "Debit from Bank",
  "Running Bank Total", "Note"
];

export function CashFlow() {
  const [from, setFrom] = useState(initialDay.slice(0, 8) + "01");
  const [to, setTo] = useState(initialDay);
  const [entryDate, setEntryDate] = useState(initialDay);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({ defaultPettyCash: "0", defaultBankPetty: "0" });
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [entryLoading, setEntryLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (from > to) { setError("From date cannot be after To date."); setLoading(false); return; }
    let active = true;
    setLoading(true); setError("");
    api("/admin/cash-flow?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to))
      .then((result) => {
        if (!active) return;
        setData(result);
        setSettings({ defaultPettyCash: numberInput(result.defaultPettyCash), defaultBankPetty: numberInput(result.defaultBankPetty) });
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, revision]);

  useEffect(() => {
    let active = true;
    setEntryLoading(true);
    api("/admin/cash-flow/entry/" + encodeURIComponent(entryDate))
      .then((entry) => {
        if (!active) return;
        setForm({
          pettyCashOverride: numberInput(entry.pettyCashOverride),
          bankPettyOverride: numberInput(entry.bankPettyOverride),
          actual: numberInput(entry.actual),
          creditToBank: numberInput(entry.creditToBank),
          debitFromBank: numberInput(entry.debitFromBank),
          note: entry.note || ""
        });
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setEntryLoading(false); });
    return () => { active = false; };
  }, [entryDate, revision]);

  const summary = useMemo(() => {
    const rows = data?.rows || [];
    const total = (field) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
    return {
      income: total("dailyIncome"), expenses: total("expenses"),
      variance: rows.reduce((sum, row) => sum + Number(row.variance || 0), 0),
      counted: rows.filter((row) => row.actual != null).length,
      bank: rows.length ? rows[rows.length - 1].runningBankTotal : 0
    };
  }, [data]);

  async function saveSettings(event) {
    event.preventDefault(); setBusy("settings"); setError(""); setMessage("");
    try {
      await put("/admin/cash-flow/settings", settings);
      setMessage("Petty cash and opening bank balance saved.");
      setRevision((value) => value + 1);
    } catch (err) { setError(err.message); }
    finally { setBusy(""); }
  }
  async function saveEntry(event) {
    event.preventDefault(); setBusy("entry"); setError(""); setMessage("");
    try {
      await put("/admin/cash-flow/entry/" + encodeURIComponent(entryDate), form);
      setMessage("Daily cash entry saved for " + entryDate + ".");
      setRevision((value) => value + 1);
    } catch (err) { setError(err.message); }
    finally { setBusy(""); }
  }
  function print() {
    document.body.classList.add("cashflow-printing");
    const cleanup = () => document.body.classList.remove("cashflow-printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  }
  const editField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const field = (title, key, hint, nullable = false) => (
    <label className="field" key={key}>
      <span>{title}</span>
      <input type="number" min="0" step="0.01" inputMode="decimal"
        aria-label={title} placeholder={hint} value={form[key]}
        disabled={!!busy || entryLoading}
        onChange={(event) => editField(key, event.target.value)} />
      {nullable && <small>Blank uses the default / carried balance.</small>}
    </label>
  );

  return (
    <div className="cashflow-page">
      <PageHead eyebrow="FINANCIAL RECONCILIATION" title="Cash Flow">
        <button type="button" className="secondary cashflow-no-print"
          onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw size={17} /> Refresh
        </button>
        <button type="button" className="primary cashflow-no-print" disabled={!data?.rows?.length} onClick={print}>
          <Printer size={17} /> Print Cash Flow
        </button>
      </PageHead>
      <p className="cashflow-intro cashflow-no-print">
        Daily cash movement, based on actual payments received and recorded expenses.
        Unpaid, cancelled and deleted orders are excluded. Balances are in Philippine pesos.
      </p>
      <ErrorBox message={error} />
      {message && <p className="cashflow-notice" role="status">{message}</p>}
      <div className="cashflow-summary cashflow-no-print">
        <div><span>Income in range</span><strong>{cash(summary.income)}</strong></div>
        <div><span>Expenses in range</span><strong>{cash(summary.expenses)}</strong></div>
        <div><span>Reconciliation variance</span><strong className={summary.variance < 0 ? "cashflow-negative" : ""}>{cash(summary.variance)}</strong><small>{summary.counted} day(s) counted</small></div>
        <div><span>Closing bank total</span><strong>{cash(summary.bank)}</strong></div>
      </div>
      <div className="cashflow-forms cashflow-no-print">
        <section className="panel">
          <h2>Opening balances</h2>
          <p className="muted small">Default petty cash applies to each day. The bank balance carries forward, including movements before the selected date range.</p>
          <form onSubmit={saveSettings} className="cashflow-settings-grid">
            <label className="field"><span>Default Petty Cash</span>
              <input type="number" min="0" step="0.01" value={settings.defaultPettyCash} required
                onChange={(event) => setSettings((previous) => ({ ...previous, defaultPettyCash: event.target.value }))} />
            </label>
            <label className="field"><span>Bank Petty / Opening Balance</span>
              <input type="number" min="0" step="0.01" value={settings.defaultBankPetty} required
                onChange={(event) => setSettings((previous) => ({ ...previous, defaultBankPetty: event.target.value }))} />
            </label>
            <button className="primary" disabled={!!busy}><Save size={16} /> {busy === "settings" ? "Saving…" : "Save Balances"}</button>
          </form>
        </section>
        <section className="panel">
          <h2>Daily Cash Entry</h2>
          <p className="muted small">Choose a date or select a row below to edit that day's count and bank movements. Leave overrides blank to use the defaults.</p>
          <form onSubmit={saveEntry}>
            <div className="cashflow-entry-grid">
              <label className="field"><span>Date</span><input type="date" value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)} required /></label>
              {field("Petty Cash Override", "pettyCashOverride", "Use default", true)}
              {field("Bank Petty Override", "bankPettyOverride", "Carry forward", true)}
              {field("Actual Cash Count", "actual", "Leave blank if not yet counted")}
              {field("Credit to Bank", "creditToBank", "0")}
              {field("Debit from Bank", "debitFromBank", "0")}
            </div>
            <label className="field"><span>Note</span><input type="text" maxLength={500}
              value={form.note} onChange={(event) => editField("note", event.target.value)}
              disabled={!!busy || entryLoading} placeholder="Optional reconciliation note" /></label>
            <button className="primary" disabled={!!busy || entryLoading}><Save size={16} /> {busy === "entry" ? "Saving…" : "Save Daily Entry"}</button>
          </form>
        </section>
      </div>
      <section className="panel cashflow-ledger-panel">
        <div className="cashflow-ledger-head">
          <div><h2>Cash Flow Ledger</h2><p className="muted small">Click any date to load its saved cash entry.</p></div>
          <div className="cashflow-date-range cashflow-no-print">
            <label>From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <div className="cashflow-print-title"><strong>Laundry POS | Cash Flow</strong><span>{from} to {to}</span></div>
        </div>
        {loading ? <Loading /> : (
          <div className="cashflow-table-scroll">
            <table className="cashflow-table">
              <thead><tr>{columns.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
              <tbody>
                {!data?.rows?.length && <tr><td colSpan={18} className="cashflow-empty">No cash flow records for this range.</td></tr>}
                {data?.rows?.map((row) => (
                  <tr key={row.date} className={row.date === entryDate ? "cashflow-selected" : ""}
                    onClick={() => setEntryDate(row.date)} title={"Edit cash entry for " + row.date}>
                    <td><strong>{row.date}</strong></td>
                    <td>{cash(row.pettyCash)}</td><td>{cash(row.dailyIncome)}</td>
                    <td>{cash(row.cash)}</td><td>{cash(row.gcash)}</td><td>{row.gcashTxns}</td>
                    <td>{cash(row.other)}</td><td>{cash(row.cashPlusGcash)}</td><td>{row.transactionCount}</td>
                    <td>{cash(row.expenses)}</td><td><strong>{cash(row.expectedTotal)}</strong></td>
                    <td>{showMoney(row.actual)}</td>
                    <td className={row.variance == null ? "" : row.variance < 0 ? "cashflow-negative" : row.variance > 0 ? "cashflow-positive" : ""}>{showMoney(row.variance)}</td>
                    <td><strong>{cash(row.bankPetty)}</strong>{row.bankPettyOverride != null && <small>Override</small>}</td>
                    <td>{cash(row.creditToBank)}</td><td>{cash(row.debitFromBank)}</td>
                    <td><strong>{cash(row.runningBankTotal)}</strong></td>
                    <td className="cashflow-note" title={row.note || ""}>{row.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small cashflow-no-print">
          Expected Total = Petty Cash + Daily Income − Expenses. Variance = Actual − Expected Total.
          Running Bank Total = Opening Bank Balance + Credits − Debits, including saved overrides.
        </p>
      </section>
    </div>
  );
}
