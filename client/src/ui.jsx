import React, { useEffect, useState, useRef } from "react";
import {
  X,
  LoaderCircle,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "./api";
export const cash = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    v || 0,
  );
export const date = (v) =>
  v
    ? new Date(v).toLocaleString("en-PH", {
        timeZone: window.businessZone || "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export const label = (v) =>
  v
    ?.replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
export const stages = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "FOLDING",
  "READY",
  "CLAIMED",
];
export function Badge({ value }) {
  return (
    <span className={"badge " + value?.toLowerCase()}>{label(value)}</span>
  );
}
export function useData(path, revision = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(path)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, setData };
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" size={25} /> Loading…
    </div>
  );
}
export function ErrorBox({ message }) {
  return message ? (
    <div role="alert" className="error">
      {message}
    </div>
  ) : null;
}
export function Empty({ children = "No records yet." }) {
  return <div className="empty">{children}</div>;
}
function ServicePriceField({ caption, child }) {
  const rootRef = useRef(null),
    totalRef = useRef("");
  const [total, setTotal] = useState(""),
    [unitPrice, setUnitPrice] = useState(
      child.props.defaultValue == null ? "" : String(child.props.defaultValue),
    );
  const regular = child.props.name === "regularPrice";
  const recalculate = (totalValue, quantityValue) => {
    totalRef.current = totalValue;
    setTotal(totalValue);
    const amount = Number(totalValue),
      quantity = Number(quantityValue);
    if (amount > 0 && quantity > 0) {
      setUnitPrice((amount / quantity).toFixed(2));
    } else if (!totalValue) {
      setUnitPrice("");
    }
  };
  useEffect(() => {
    const form = rootRef.current?.closest("form"),
      minimum = form?.elements?.namedItem("minimumQuantity"),
      currentUnit = Number(child.props.defaultValue || 0),
      quantity = Number(minimum?.value || 1);
    if (currentUnit > 0 && quantity > 0) {
      const initialTotal = (currentUnit * quantity).toFixed(2);
      totalRef.current = initialTotal;
      setTotal(initialTotal);
    }
    const handleMinimumChange = (event) => {
      if (event.target?.name !== "minimumQuantity" || !totalRef.current) return;
      recalculate(totalRef.current, event.target.value);
    };
    form?.addEventListener("input", handleMinimumChange);
    return () => form?.removeEventListener("input", handleMinimumChange);
  }, []);
  return (
    <label className="field" ref={rootRef}>
      <span>{regular ? "Regular price" : "Express price"}</span>
      <small className="muted">
        Enter the total charge for the minimum billable quantity. The per-unit
        price is calculated automatically.
      </small>
      <input
        aria-label={`${regular ? "Regular" : "Express"} total for minimum quantity`}
        type="number"
        min="0.01"
        step="0.01"
        value={total}
        placeholder="e.g. 220"
        onChange={(event) => {
          const form = event.currentTarget.closest("form"),
            minimum = form?.elements?.namedItem("minimumQuantity");
          recalculate(event.target.value, minimum?.value || 1);
        }}
        required
      />
      <small className="muted">Calculated {caption.toLowerCase()}</small>
      {React.cloneElement(child, {
        value: unitPrice,
        readOnly: true,
        tabIndex: -1,
        title: "Calculated automatically from the total price and minimum quantity",
      })}
    </label>
  );
}
export function Field({ label: caption, children, ...props }) {
  const priceField =
    React.isValidElement(children) &&
    ["regularPrice", "expressPrice"].includes(children.props?.name);
  if (priceField) return <ServicePriceField caption={caption} child={children} />;
  return (
    <label className="field">
      <span>{caption}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const getFocusable = () =>
      [
        ...dialogRef.current.querySelectorAll(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ),
      ].filter((el) => el.offsetParent !== null);
    getFocusable()[0]?.focus();
    const handler = (e) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = getFocusable(),
          first = items[0],
          last = items[items.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="icon"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="search">
      <Search size={19} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Pager({ page, total, size = 30, onChange }) {
  return (
    <div className="pager">
      <span>
        {total} records · Page {page} of {Math.max(1, Math.ceil(total / size))}
      </span>
      <button
        className="secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        className="secondary"
        disabled={page * size >= total}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
export function Table({ headers, children }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function PageHead({ eyebrow, title, children }) {
  return (
    <div className="pagehead">
      <div>
        <p className="eyebrow">{eyebrow || "LAUNDRY OPERATIONS"}</p>
        <h1>{title}</h1>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function SaveButton({ busy, children = "Save changes" }) {
  return (
    <button className="primary" disabled={busy}>
      {busy ? (
        <>
          <LoaderCircle size={18} className="spin" /> Saving…
        </>
      ) : (
        children
      )}
    </button>
  );
}