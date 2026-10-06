import React, { useState } from "react";
import { ArrowRight, Plus, Shirt, Trash2, Waves, Wind } from "lucide-react";
import Decimal from "decimal.js";
import { post } from "./api";
import { CustomerForm } from "./operations";
import { useApp } from "./context";
import {
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageHead,
  SearchBox,
  cash,
  useData,
} from "./ui";
import { calculateLoadPricing, servicePlanText } from "./load-pricing";

const previousBusinessDay = () =>
  new Date(Date.now() - 86400000).toLocaleDateString("en-CA", {
    timeZone: window.businessZone || "Asia/Manila",
  });

const stages = ["RECEIVED", "WASHING", "DRYING", "FOLDING", "READY", "CLAIMED"];

export function AdminHistoricalOrder() {
  const { notify } = useApp();
  const { data: services, error: serviceError } = useData("/services");
  const [q, setQ] = useState(""),
    [customer, setCustomer] = useState(null),
    [newCustomer, setNewCustomer] = useState(false),
    [lines, setLines] = useState([]),
    [express, setExpress] = useState(false),
    [historicalDate, setHistoricalDate] = useState(previousBusinessDay()),
    [status, setStatus] = useState("CLAIMED"),
    [payment, setPayment] = useState("CASH"),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(null),
    [requestKey, setRequestKey] = useState(crypto.randomUUID());
  const { data: customers, error: customerError } = useData(
    "/customers?q=" + encodeURIComponent(q),
  );

  const priced = lines.map((line) => {
    const service = services?.find((item) => item.id === line.serviceId);
    return {
      ...line,
      service,
      pricing: calculateLoadPricing(service, line.actualQuantity, line.express),
    };
  });
  const total = priced.reduce(
    (sum, line) => sum.add(line.pricing.total),
    new Decimal(0),
  );
  const claimedWithoutPayment = status === "CLAIMED" && payment === "UNPAID";

  function addService(service) {
    setLines((current) => {
      const index = current.findIndex(
        (line) => line.serviceId === service.id && line.express === express,
      );
      if (index < 0)
        return [
          ...current,
          { serviceId: service.id, actualQuantity: "1", express },
        ];
      return current.map((line, i) =>
        i === index
          ? {
              ...line,
              actualQuantity: new Decimal(line.actualQuantity || 0)
                .add(1)
                .toString(),
            }
          : line,
      );
    });
  }

  function updateLine(index, field, value) {
    const changed = lines.map((line, i) =>
      i === index ? { ...line, [field]: value } : line,
    );
    if (field !== "express") {
      setLines(changed);
      return;
    }
    const merged = [];
    for (const line of changed) {
      const existing = merged.find(
        (item) =>
          item.serviceId === line.serviceId && item.express === line.express,
      );
      if (existing)
        existing.actualQuantity = new Decimal(existing.actualQuantity || 0)
          .add(line.actualQuantity || 0)
          .toString();
      else merged.push({ ...line });
    }
    setLines(merged);
  }

  return (
    <>
      <PageHead title="Manual add" eyebrow="ADMIN · HISTORICAL LOAD PRICING">
        <span className="muted">Add a missed transaction from a past date.</span>
      </PageHead>
      <section className="panel" style={{ marginBottom: 16 }}>
        <strong>Past dates only</strong>
        <p className="muted" style={{ marginBottom: 0 }}>
          Historical entries use the same full-load and half-load pricing as the live POS.
          They do not deduct today&apos;s inventory.
        </p>
      </section>
      <ErrorBox message={error || serviceError || customerError} />

      <div className="pos-grid">
        <div className="pos-left">
          <section className="panel">
            <div className="section-title"><h2><span className="step">1</span> Historical record</h2></div>
            <Field label="Transaction date">
              <input type="date" value={historicalDate} max={previousBusinessDay()} required onChange={(e) => setHistoricalDate(e.target.value)} />
            </Field>
            <Field label="Current / final stage">
              <select
                value={status}
                onChange={(e) => {
                  const next = e.target.value;
                  setStatus(next);
                  if (next === "CLAIMED" && payment === "UNPAID") setPayment("CASH");
                }}
              >
                {stages.map((stage) => <option key={stage} value={stage}>{stage.charAt(0) + stage.slice(1).toLowerCase()}</option>)}
              </select>
            </Field>
          </section>

          <section className="panel">
            <div className="section-title">
              <h2><span className="step">2</span> Customer</h2>
              <button className="text-button" onClick={() => setNewCustomer(true)}><Plus size={16} /> New customer</button>
            </div>
            {customer ? (
              <div className="selected-customer">
                <span className="avatar">{customer.name[0]}</span>
                <div><strong>{customer.name}</strong><small>{customer.phone}</small></div>
                <button className="secondary" onClick={() => setCustomer(null)}>Change</button>
              </div>
            ) : (
              <>
                <SearchBox value={q} onChange={setQ} placeholder="Search customer name or phone" />
                <div className="customer-results">
                  {customers?.rows.slice(0, 5).map((item) => (
                    <button key={item.id} onClick={() => setCustomer(item)}>
                      <span><strong>{item.name}</strong><small>{item.phone}</small></span><Plus size={17} />
                    </button>
                  ))}
                  {customers && !customers.rows.length && <Empty>No customers found. Register a new customer.</Empty>}
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <div className="section-title">
              <h2><span className="step">3</span> Services</h2>
              <div className="segmented">
                <button className={!express ? "selected" : ""} onClick={() => setExpress(false)}>Regular</button>
                <button className={express ? "selected" : ""} onClick={() => setExpress(true)}><Wind size={15} /> Express</button>
              </div>
            </div>
            <div className="service-grid">
              {services?.map((service) => (
                <button className="service-card" key={service.id} onClick={() => addService(service)}>
                  <span className={"service-icon " + (service.unit === "KG" ? "blue" : "amber")}>
                    {service.unit === "KG" ? <Waves /> : <Shirt />}
                  </span>
                  <strong>{service.name}</strong>
                  <span className="service-price">{express ? "Express" : "Regular"}</span>
                  <small className="muted">{servicePlanText(service, express)}</small>
                  <span className="card-plus"><Plus size={17} /></span>
                </button>
              ))}
            </div>
            {!services ? <Loading /> : !services.length && <Empty>No active services.</Empty>}
          </section>
        </div>

        <section className="panel order-summary">
          <div className="section-title"><h2>Historical transaction</h2><span className="count">{lines.length} services</span></div>
          <div className="order-lines">
            {priced.length ? (
              priced.map((line, index) => (
                <div className="order-line" key={line.serviceId + line.express}>
                  <div className="line-top">
                    <strong>{line.service?.name}</strong>
                    <button className="icon" aria-label="Remove service" onClick={() => setLines(lines.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
                  </div>
                  <div className="line-inputs">
                    <Field label={"Actual " + (line.service?.unit === "KG" ? "kg" : "pieces")}>
                      <input
                        type="number"
                        min={line.service?.unit === "KG" ? "0.001" : "1"}
                        step={line.service?.unit === "KG" ? "0.001" : "1"}
                        value={line.actualQuantity}
                        onChange={(e) => updateLine(index, "actualQuantity", e.target.value)}
                      />
                    </Field>
                    <Field label="Speed">
                      <select value={line.express ? "EXPRESS" : "REGULAR"} onChange={(e) => updateLine(index, "express", e.target.value === "EXPRESS")}>
                        <option value="REGULAR">Regular</option>
                        <option value="EXPRESS">Express</option>
                      </select>
                    </Field>
                  </div>
                  <div className="line-bottom">
                    <small>
                      {line.pricing.breakdown || "Enter an actual quantity"}
                      {line.pricing.billable.gt(0) && <> · Charged capacity {line.pricing.billable.toString()} {line.service?.unit?.toLowerCase()}</>}
                    </small>
                    <strong>{cash(line.pricing.total)}</strong>
                  </div>
                </div>
              ))
            ) : <Empty>Select services for the historical transaction.</Empty>}
          </div>

          <div className="total"><span>Total</span><strong>{cash(total)}</strong></div>
          <Field label="Payment">
            <select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="UNPAID">Unpaid</option>
              <option value="CASH">Paid · Cash</option>
              <option value="GCASH">Paid · GCash</option>
            </select>
          </Field>
          {payment === "GCASH" && <Field label="GCash reference"><input value={reference} onChange={(e) => setReference(e.target.value)} required /></Field>}
          {claimedWithoutPayment && <ErrorBox message="Claimed historical transactions must be marked paid." />}

          <button
            className="primary full"
            disabled={busy || !historicalDate || !customer || !lines.length || claimedWithoutPayment || priced.some((line) => line.pricing.total.lte(0)) || (payment === "GCASH" && reference.trim().length < 4)}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const order = await post("/orders/historical", {
                  requestKey,
                  historicalDate,
                  customerId: customer.id,
                  status,
                  items: lines,
                  ...(payment !== "UNPAID" ? { payment: { method: payment, ...(payment === "GCASH" ? { reference } : {}) } } : {}),
                });
                setSaved(order);
                setLines([]);
                setCustomer(null);
                setStatus("CLAIMED");
                setPayment("CASH");
                setReference("");
                setRequestKey(crypto.randomUUID());
                notify(`Historical transaction ${order.orderNumber} added`);
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving historical transaction…" : "Add historical transaction"}<ArrowRight size={18} />
          </button>
        </section>
      </div>

      {newCustomer && (
        <CustomerForm onClose={() => setNewCustomer(false)} onSaved={(created) => { setCustomer(created); setNewCustomer(false); }} />
      )}
      {saved && (
        <Modal title="Historical transaction added" onClose={() => setSaved(null)}>
          <h2>{saved.orderNumber}</h2>
          <p>{saved.customerName}</p>
          <div className="total"><span>Total</span><strong>{cash(saved.total)}</strong></div>
          <p className="muted">Saved under {historicalDate} using the load-pricing model.</p>
          <button className="primary" onClick={() => setSaved(null)}>Close</button>
        </Modal>
      )}
    </>
  );
}
