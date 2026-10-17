import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Printer, RotateCcw } from "lucide-react";
import { OFFICIAL_LOGO } from "./brand";
import { cash, date } from "./ui";

function ReceiptCopy({ data: order, copy }) {
  const customerCopy = copy === 1;
  return (
    <article className="pos-receipt-copy">
      <div className="pos-receipt-brand">
        <img src={OFFICIAL_LOGO} alt="" />
        <div>
          <h2>{order.business?.name || "Laundry POS"}</h2>
          <p>ORDER / CLAIM RECEIPT</p>
        </div>
      </div>
      <p className="pos-copy-label">
        {customerCopy ? "CUSTOMER COPY" : "STAFF COPY"} · COPY {copy} OF 2
      </p>
      <h3>{order.orderNumber}</h3>
      <p className="pos-receipt-centered">
        <strong>{order.customerName}</strong>
        <br />
        {order.customerPhone}
        {order.customerRoomUnit && <><br />Room / Unit: {order.customerRoomUnit}</>}
        <br />
        {date(order.createdAt)}
      </p>
      <hr />
      {order.items.map((item) => (
        <div className="pos-receipt-line" key={item.id}>
          <strong>{item.serviceName} · {item.express ? "Express" : "Regular"}</strong>
          <p>
            Actual: {item.actualQuantity} {item.unit}
            <br />
            {item.pricingLabel ? (
              <>
                Pricing: {item.pricingLabel}
                <br />
                Charged capacity: {item.billableQuantity} {item.unit}
              </>
            ) : (
              <>Billable: {item.billableQuantity} {item.unit} × {cash(item.unitPrice)}</>
            )}
            <b className="pos-receipt-amount">{cash(item.total)}</b>
          </p>
        </div>
      ))}
      <hr />
      <h3 className="pos-receipt-total">
        <span>Total due</span><span>{cash(order.total)}</span>
      </h3>
      <p>
        Payment: {order.paymentStatus === "PAID"
          ? order.payment?.method || "PAID"
          : "PAY AT PICKUP"}
      </p>
      <p>Washing machine: {order.washingMachine || "To be assigned when washing starts"}</p>
      <p>
        Approximate pickup
        <br />
        {date(order.estimatedFrom)} – {date(order.estimatedTo)}
        <br />
        <small>Timing may change. Scan the QR to check the current status.</small>
      </p>
      <img className="pos-receipt-qr" src={order.qr} alt="Scan to track and update this order" />
      <p className="pos-receipt-centered">
        {customerCopy
          ? "Customer copy — keep this receipt for pickup."
          : "Staff copy — scan this QR to advance the laundry phase."}
      </p>
    </article>
  );
}

export function PosReceiptPrint({ data, onClose }) {
  const [phase, setPhase] = useState("printing");
  const [printError, setPrintError] = useState("");

  useEffect(() => {
    if (phase !== "printing") return undefined;
    let timer;
    const afterPrint = () => setPhase("confirm");
    window.addEventListener("afterprint", afterPrint);
    timer = window.setTimeout(() => {
      if (typeof window.print !== "function") {
        setPrintError("This browser does not support printing. Open Laundry POS in a browser with print support.");
        setPhase("error");
        return;
      }
      try {
        window.print();
      } catch {
        setPrintError("The print dialog could not be opened. Check your browser's print permission and try again.");
        setPhase("error");
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [phase]);

  return (
    <div className="pos-print-overlay">
      <div className="pos-print-controls">
        <div className="pos-print-instructions">
          <Printer size={20} />
          <div>
            <strong>Print 2 receipt copies</strong>
            <small>{data.orderNumber} · one Customer Copy and one Staff Copy</small>
          </div>
        </div>
        {phase === "printing" && (
          <div className="pos-print-feedback">
            <p>The print dialog should open automatically. Select your receipt printer and print both pages.</p>
            <button className="secondary" onClick={() => setPhase("confirm")}>I closed the print dialog</button>
          </div>
        )}
        {phase === "confirm" && (
          <div className="pos-print-feedback">
            <p>Did both receipt copies print successfully?</p>
            <div className="actions">
              <button className="secondary" onClick={() => {
                setPrintError("Printing was not completed. Check that the printer is connected, powered on, online, has paper, and is selected in the print dialog.");
                setPhase("error");
              }}>
                No — printer failed
              </button>
              <button className="primary" onClick={onClose}>
                <CheckCircle2 size={17} /> Yes, both printed
              </button>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="pos-print-feedback pos-print-error" role="alert">
            <p><AlertTriangle size={18} /> {printError}</p>
            <div className="actions">
              <button className="secondary" onClick={onClose}>Close for now</button>
              <button className="primary" onClick={() => {
                setPrintError("");
                setPhase("printing");
              }}>
                <RotateCcw size={17} /> Try again
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="pos-print-pages">
        <ReceiptCopy data={data} copy={1} />
        <ReceiptCopy data={data} copy={2} />
      </div>
    </div>
  );
}
