import React, { useState } from "react";
import { ArrowRight, Plus, Shirt, Trash2, Waves, Wind } from "lucide-react";
import Decimal from "decimal.js";
import { post } from "./api";
import { CustomerForm } from "./operations";
import { customerDisplayName } from "./customer-display";
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
import { AddonsPicker } from "./addons-picker";
import { PaymentDialog, paymentPayload, paymentLabel } from "./payment-flow";
import { PosReceiptPrint } from "./pos-receipt-print";

export function PosOrder() {
  const { notify } = useApp();
  const { data: services, error: serviceError } = useData("/services");
  const { data: addonCatalog, error: addonError } = useData("/addons");
  const [q, setQ] = useState(""),
    [customer, setCustomer] = useState(null),
    [newCustomer, setNewCustomer] = useState(false),
    [lines, setLines] = useState([]),
    [addons, setAddons] = useState([]),
    [express, setExpress] = useState(false),
    [payment, setPayment] = useState("UNPAID"),
    [reference, setReference] = useState(""),
    [provider, setProvider] = useState("MAYA"),
    [receiptDataUrl, setReceiptDataUrl] = useState(""),
    [paymentOpen, setPaymentOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [printJob, setPrintJob] = useState(null),
    [printFailure, setPrintFailure] = useState(null),
    [printBusy, setPrintBusy] = useState(false),
    [requestKey, setRequestKey] = useState(crypto.randomUUID()),
    [washingMachine, setWashingMachine] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
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
  ).add(addons.reduce((sum,row)=>{
    const item=addonCatalog?.find(x=>x.id===row.inventoryItemId);
    return sum.add(new Decimal(item?.salePrice||0).mul(row.quantity||0));
  },new Decimal(0)));

  async function preparePrint(order) {
    setPrintBusy(true);
    try {
      const receipt = await post("/orders/" + order.id + "/staff-receipt");
      setPrintFailure(null);
      setPrintJob(receipt);
    } catch (err) {
      setPrintFailure({ order, message: err.message });
    } finally {
      setPrintBusy(false);
    }
  }

  // One service may have multiple independent loads; never merge them silently.
  function addService(service, selectedExpress = express) {
    setLines((current) =>
      current.length >= 30
        ? current
        : [...current, {
            localId: crypto.randomUUID(),
            serviceId: service.id,
            actualQuantity: "1",
            express: selectedExpress,
          }],
    );
  }

  function addAnotherLoad(line) {
    const service = services?.find((item) => item.id === line.serviceId);
    if (service) addService(service, line.express);
  }

  function updateLine(index, field, value) {
    setLines((current) =>
      current.map((line, i) => i === index ? { ...line, [field]: value } : line),
    );
  }

  return (
    <>
      <PageHead title="New order" eyebrow="POINT OF SALE · LOAD PRICING">
        <span className="muted">Each load is saved and priced separately. Tap a service again or use Add another load.</span>
      </PageHead>
      <ErrorBox message={error || serviceError || addonError || customerError} />
      <div className="pos-grid live-pos-grid">
        <div className="pos-left">
          <section className="panel">
            <div className="section-title">
              <h2><span className="step">1</span> Customer</h2>
              <button className="text-button" onClick={() => setNewCustomer(true)}>
                <Plus size={16} /> New customer
              </button>
            </div>
            {customer ? (
              <div className="selected-customer">
                <span className="avatar">{customer.name[0]}</span>
                <div>
                  <strong>{customerDisplayName(customer)}</strong>
                  <small>{customer.phone}{customer.roomUnit ? " · " + customer.roomUnit : ""}</small>
                </div>
                <button className="secondary" onClick={() => setCustomer(null)}>Change</button>
              </div>
            ) : (
              <>
                <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, room or unit" />
                <div className="customer-results">
                  {customers?.rows.slice(0, 5).map((item) => (
                    <button key={item.id} onClick={() => setCustomer(item)}>
                      <span><strong>{customerDisplayName(item)}</strong><small>{item.phone || "No phone number"}{item.roomUnit ? " · " + item.roomUnit : ""}</small></span>
                      <Plus size={17} />
                    </button>
                  ))}
                  {customers && !customers.rows.length && <Empty>No customers found. Register a new customer.</Empty>}
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <div className="section-title">
              <h2><span className="step">2</span> Services</h2>
              <div className="segmented">
                <button className={!express ? "selected" : ""} onClick={() => setExpress(false)}>Regular</button>
                <button className={express ? "selected" : ""} onClick={() => setExpress(true)}><Wind size={15} /> Express</button>
              </div>
            </div>
            <div className="service-grid">
              {services?.map((service) => (
                <button className="service-card" key={service.id} disabled={lines.length >= 30} onClick={() => addService(service)}>
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
            {!services ? <Loading /> : !services.length && <Empty>Ask Admin to activate a service.</Empty>}
          </section>
        </div>

        <section className="panel order-summary">
          <div className="section-title">
            <h2>Order summary</h2>
            <span className="count">{lines.length} loads</span>
          </div>
          <div className="order-lines">
            {priced.length ? (
              priced.map((line, index) => (
                <div className="order-line" key={line.localId}>
                  <div className="line-top">
                    <strong>Load {index + 1} · {line.service?.name}</strong>
                    <button className="icon" aria-label="Remove service" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="line-inputs">
                    <Field label={"Actual " + (line.service?.unit === "KG" ? "kg" : (line.service?.unit?.toLowerCase() || "units"))}>
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
                      {line.pricing.billable.gt(0) && (
                        <> · Charged capacity {line.pricing.billable.toString()} {line.service?.unit?.toLowerCase()}</>
                      )}
                    </small>
                    <strong>{cash(line.pricing.total)}</strong>
                  </div>
                  <button type="button" className="secondary" disabled={lines.length >= 30} onClick={() => addAnotherLoad(line)}>
                    <Plus size={15} /> Add another load
                  </button>
                </div>
              ))
            ) : (
              <Empty>Select a service to start the order.</Empty>
            )}
          </div>

          <AddonsPicker catalog={addonCatalog || []} value={addons} onChange={setAddons}/>

          <Field label="Washing machine / machine number (optional)">
            <input
              value={washingMachine}
              onChange={(event) => setWashingMachine(event.target.value)}
              placeholder="e.g. Washer 1 · 12 kg"
              maxLength={80}
              list="laundry-washing-machines"
            />
            <datalist id="laundry-washing-machines">
              <option value="Washer 1" />
              <option value="Washer 2" />
              <option value="Washer 3" />
              <option value="Washer 4" />
              <option value="Washer 5" />
              <option value="Washer 6" />
            </datalist>
          </Field>
          <p className="small muted">If no machine is assigned yet, staff will be asked to record it when moving the order to Washing.</p>

          <details>
            <summary>Approximate pickup window (optional)</summary>
            <Field label="From"><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <small className="muted">Leave blank to use the shop&apos;s turnaround estimate.</small>
          </details>

          <div className="total"><span>Total due</span><strong>{cash(total)}</strong></div>
          <div className="water-payment-summary">
            <span>Payment</span>
            <strong>
              {paymentLabel(payment, provider)}
            </strong>
          </div>
          <button
            className="primary full"
            disabled={
              busy ||
              !customer ||
              !lines.length ||
              priced.some((line) => line.pricing.total.lte(0))
            }
            onClick={() => setPaymentOpen(true)}
          >
            Payment <ArrowRight size={18} />
          </button>
          <p className="small muted center">New orders begin at Received. Server pricing verifies the same load calculation before saving.</p>
        </section>
      </div>

      <PaymentDialog
        open={paymentOpen}
        onClose={() => !busy && setPaymentOpen(false)}
        total={total}
        method={payment}
        setMethod={setPayment}
        reference={reference}
        setReference={setReference}
        provider={provider}
        setProvider={setProvider}
        receiptDataUrl={receiptDataUrl}
        setReceiptDataUrl={setReceiptDataUrl}
        busy={busy}
        onConfirm={async () => {
          setBusy(true);
          setError("");
          try {
            const selectedPayment = paymentPayload(
              payment,
              reference,
              receiptDataUrl,
              provider,
            );
            const order = await post("/orders", {
              requestKey,
              customerId: customer.id,
              items: lines.map(({ serviceId, actualQuantity, express }) => ({ serviceId, actualQuantity, express })),
              addons: addons.map(({inventoryItemId,quantity})=>({inventoryItemId,quantity})),
              washingMachine: washingMachine.trim() || undefined,
              ...(selectedPayment ? { payment: selectedPayment } : {}),
              ...(from ? { estimatedFrom: new Date(from).toISOString() } : {}),
              ...(to ? { estimatedTo: new Date(to).toISOString() } : {}),
            });
            setPaymentOpen(false);
            setLines([]);
            setAddons([]);
            setCustomer(null);
            setPayment("UNPAID");
            setReference("");
            setProvider("MAYA");
            setReceiptDataUrl("");
            setWashingMachine("");
            setFrom("");
            setTo("");
            setRequestKey(crypto.randomUUID());
            notify(`Order ${order.orderNumber} received. Preparing two receipt copies.`);
            await preparePrint(order);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      />

      {newCustomer && (
        <CustomerForm
          onClose={() => setNewCustomer(false)}
          onSaved={(created) => {
            setCustomer(created);
            setNewCustomer(false);
          }}
        />
      )}
      {printJob && (
        <PosReceiptPrint
          data={printJob}
          onClose={() => {
            const orderNumber = printJob.orderNumber;
            setPrintJob(null);
            notify(`Two-copy receipt print confirmed for ${orderNumber}`);
          }}
        />
      )}
      {printFailure && (
        <Modal title="Order saved — receipt printing needs attention" onClose={() => setPrintFailure(null)}>
          <ErrorBox message={printFailure.message} />
          <p>
            Order <strong>{printFailure.order.orderNumber}</strong> was saved successfully.
            Retrying here will only prepare the receipt; it will not create another order.
          </p>
          <p className="muted">
            Check that the printer is connected, powered on, online, has paper, and is selected in the print dialog.
          </p>
          <div className="actions">
            <button className="secondary" onClick={() => setPrintFailure(null)}>Close for now</button>
            <button className="primary" disabled={printBusy} onClick={() => preparePrint(printFailure.order)}>
              {printBusy ? "Preparing…" : "Try again"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
