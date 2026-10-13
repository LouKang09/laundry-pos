import React, { useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { cash } from "./ui";

const METHODS = [
  { value: "CASH", icon: "₱", title: "Cash", note: "Paid in cash" },
  { value: "GCASH", icon: "G", title: "GCash", note: "Reference + optional proof" },
  { value: "UNPAID", icon: "⌛", title: "Pay at Pickup", note: "Save as unpaid" },
];

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the receipt image"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The selected file is not a readable image"));
    image.src = src;
  });
}

async function prepareReceipt(file) {
  if (!file) return "";
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type))
    throw new Error("Use a JPG, PNG, or WebP payment receipt");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Receipt image is too large. Use an image under 8 MB.");

  const source = await readFile(file);
  const image = await loadImage(source);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL("image/jpeg", 0.82);
  if (result.length > 3500000)
    throw new Error(
      "Receipt is still too large after compression. Try another photo.",
    );
  return result;
}

export function paymentPayload(method, reference, receiptDataUrl) {
  if (method === "UNPAID") return undefined;
  return {
    method,
    ...(method === "GCASH" ? { reference: reference.trim() } : {}),
    ...(method === "GCASH" && receiptDataUrl ? { receiptDataUrl } : {}),
  };
}

export function PaymentMethodPicker({
  method,
  setMethod,
  reference,
  setReference,
  receiptDataUrl,
  setReceiptDataUrl,
  allowUnpaid = true,
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");

  async function selectReceipt(file) {
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      setReceiptDataUrl(await prepareReceipt(file));
    } catch (error) {
      setImageError(error.message);
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <>
      <div className={"water-payment-methods " + (!allowUnpaid ? "two" : "")}>
        {METHODS.filter((item) => allowUnpaid || item.value !== "UNPAID").map(
          (item) => (
            <button
              type="button"
              key={item.value}
              className={
                "water-payment-method " +
                (method === item.value ? "active" : "")
              }
              onClick={() => setMethod(item.value)}
            >
              <span className="water-payment-icon">{item.icon}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </span>
            </button>
          ),
        )}
      </div>

      <div className="water-payment-panel">
        {method === "CASH" && (
          <p className="water-payment-info">
            Confirm the cash payment after receiving the full amount from the
            customer.
          </p>
        )}

        {method === "UNPAID" && (
          <p className="water-payment-info water-payment-info-unpaid">
            The order will be saved as unpaid and can be settled later from
            Pickup or Order Details before it is claimed.
          </p>
        )}

        {method === "GCASH" && (
          <>
            <div
              className={
                "water-receipt-upload " +
                (receiptDataUrl ? "has-file" : "")
              }
            >
              <div className="water-receipt-upload-head">
                <strong>Add GCash receipt proof</strong>
                <small>
                  Optional. Take a photo of the customer&apos;s phone or upload
                  a screenshot for transaction reference.
                </small>
              </div>
              <div className="water-receipt-actions">
                <label className="water-receipt-action primary-receipt-action">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) =>
                      selectReceipt(event.target.files?.[0])
                    }
                  />
                  <span className="water-upload-icon">
                    <Camera size={17} />
                  </span>
                  <span>
                    <strong>Take Photo</strong>
                    <small>Rear camera</small>
                  </span>
                </label>
                <label className="water-receipt-action">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      selectReceipt(event.target.files?.[0])
                    }
                  />
                  <span className="water-upload-icon">
                    <ImagePlus size={17} />
                  </span>
                  <span>
                    <strong>Upload Image</strong>
                    <small>Gallery / screenshot</small>
                  </span>
                </label>
              </div>
            </div>

            {imageBusy && (
              <p className="water-payment-info">Preparing receipt image…</p>
            )}
            {imageError && (
              <p className="water-payment-error">{imageError}</p>
            )}

            {receiptDataUrl && (
              <div className="water-receipt-preview-wrap">
                <img
                  className="water-receipt-preview"
                  src={receiptDataUrl}
                  alt="GCash receipt preview"
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setReceiptDataUrl("")}
                >
                  Remove receipt
                </button>
              </div>
            )}

            <label className="water-payment-field">
              <span>GCash reference number</span>
              <input
                autoComplete="off"
                inputMode="numeric"
                placeholder="Enter the GCash reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
              <small>
                Required. The receipt photo is optional supporting proof.
              </small>
            </label>
          </>
        )}
      </div>
    </>
  );
}

export function PaymentDialog({
  open,
  onClose,
  total,
  method,
  setMethod,
  reference,
  setReference,
  receiptDataUrl,
  setReceiptDataUrl,
  allowUnpaid = true,
  busy = false,
  title = "Complete transaction",
  onConfirm,
}) {
  if (!open) return null;
  const invalidGcash =
    method === "GCASH" && String(reference || "").trim().length < 4;
  const confirmLabel =
    method === "UNPAID"
      ? "Save as Unpaid"
      : method === "GCASH"
        ? "Confirm GCash Payment"
        : "Confirm Cash Payment";

  return (
    <div className="water-payment-overlay" role="presentation">
      <section
        className="water-payment-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Payment"
      >
        <div className="water-payment-header">
          <div>
            <p className="eyebrow">PAYMENT</p>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="water-payment-close"
            aria-label="Close payment"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <PaymentMethodPicker
          method={method}
          setMethod={setMethod}
          reference={reference}
          setReference={setReference}
          receiptDataUrl={receiptDataUrl}
          setReceiptDataUrl={setReceiptDataUrl}
          allowUnpaid={allowUnpaid}
        />

        <div className="water-payment-actions">
          <div className="water-dialog-total">
            <span>Amount due</span>
            <strong>{cash(total)}</strong>
          </div>
          <button
            type="button"
            className="primary full"
            disabled={busy || invalidGcash}
            onClick={onConfirm}
          >
            {busy ? "Processing…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
