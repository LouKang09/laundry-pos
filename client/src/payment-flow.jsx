import React, { useState, useRef, useEffect } from "react";
import { scanPaymentReference } from "./receipt-ocr";
import { Camera, ImagePlus } from "lucide-react";
import { cash } from "./ui";

const noop = () => {};

const METHODS = [
  { value: "CASH", icon: "₱", title: "Cash", note: "Pay in cash" },
  { value: "GCASH", icon: "G", title: "GCash", note: "QR or transfer" },
  { value: "OTHERS", icon: "▦", title: "Others", note: "Maya or bank transfer" },
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

export const OTHER_PROVIDERS = [
  { value: "MAYA", label: "Maya" },
  { value: "MARIBANK", label: "MariBank" },
  { value: "GOTYME", label: "GoTyme" },
  { value: "BPI", label: "BPI" },
];
export function paymentLabel(method, provider) {
  if (method === "OTHERS") return OTHER_PROVIDERS.find(p=>p.value===provider)?.label || "Others";
  return method === "GCASH" ? "GCash" : method === "UNPAID" ? "Pay at Pickup" : "Cash";
}
export function validPaymentSelection(method, reference, provider) {
  return method === "UNPAID" || method === "CASH" ||
    ((method === "GCASH" || (method === "OTHERS" && OTHER_PROVIDERS.some(p=>p.value===provider))) &&
      String(reference || "").trim().length >= 3);
}
export function paymentPayload(method, reference, receiptDataUrl, provider = "MAYA") {
  if (method === "UNPAID") return undefined;
  return {
    method,
    ...(method === "OTHERS" ? { provider } : {}),
    ...(method !== "CASH" ? { reference: reference.trim() } : {}),
    ...(method !== "CASH" && receiptDataUrl ? { receiptDataUrl } : {}),
  };
}

export function PaymentMethodPicker({
  method,
  setMethod,
  reference,
  setReference,
  provider = "MAYA",
  setProvider = () => {},
  receiptDataUrl,
  setReceiptDataUrl,
  allowUnpaid = true,
  isCorrection = false,
  onScanChange = noop,
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [scanStatus, setScanStatus] = useState("");
  const [scanResult, setScanResult] = useState("");
  const jobToken = useRef(0);

  useEffect(() => () => {
    jobToken.current += 1;
    onScanChange(false);
  }, [onScanChange]);

  async function selectReceipt(file) {
    if (!file) return;
    const job=++jobToken.current;
    setImageBusy(true);
    onScanChange(true);
    setImageError("");
    setScanResult("");
    setScanStatus("Preparing receipt image…");
    // Never combine an old reference with a new photo.
    setReference("");
    setReceiptDataUrl("");
    try {
      const image=await prepareReceipt(file);
      if(jobToken.current!==job) return;
      // Save proof in the draft before scanning. Failed OCR must not discard it.
      setReceiptDataUrl(image);
      setScanStatus("Opening receipt scanner…");
      try {
        const detected=await scanPaymentReference(image,method,provider,(message)=>{
          if(jobToken.current===job) setScanStatus(message);
        });
        if(jobToken.current!==job) return;
        if(detected){
          setReference(detected);
          setScanResult("detected");
          setScanStatus("Reference detected and filled automatically. Review it, then confirm to save the reference and receipt.");
        } else {
          setScanResult("unreadable");
          setScanStatus("Receipt attached, but the reference could not be read reliably. Enter it manually before saving.");
        }
      } catch {
        if(jobToken.current!==job) return;
        setScanResult("unreadable");
        setScanStatus("Receipt attached. Scanner unavailable; enter the reference manually before saving.");
      }
    } catch (error) {
      if(jobToken.current!==job) return;
      setImageError(error.message);
      setScanStatus("");
    } finally {
      if(jobToken.current===job){
        setImageBusy(false);
        onScanChange(false);
      }
    }
  }

  function selectMethod(next){
    if(method===next) return;
    jobToken.current++;
    onScanChange(false);
    setImageBusy(false);
    setScanResult("");
    setScanStatus("");
    setReference("");
    setReceiptDataUrl("");
    setMethod(next);
  }
  function selectProvider(next){
    if(provider===next) return;
    jobToken.current++;
    onScanChange(false);
    setImageBusy(false);
    setScanResult("");
    setScanStatus("");
    setReference("");
    setReceiptDataUrl("");
    setProvider(next);
  }

  return (
    <>
      <div className={"water-payment-methods " + (!allowUnpaid ? "three" : "")}>
        {METHODS.filter((item) => allowUnpaid || item.value !== "UNPAID").map(
          (item) => (
            <button
              type="button"
              key={item.value}
              className={
                "water-payment-method " +
                (method === item.value ? "active" : "")
              }
              onClick={() => selectMethod(item.value)}
            >
              <span className="water-payment-icon">{item.icon}</span>
              <span className="water-payment-copy">
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
            {isCorrection
              ? "Correct the recorded method to Cash. This does not collect a second payment or change the order total."
              : "Confirm the cash payment after receiving the full amount from the customer."}
          </p>
        )}

        {method === "UNPAID" && (
          <p className="water-payment-info water-payment-info-unpaid">
            The order will be saved as unpaid and can be settled later from
            Pickup or Order Details before it is claimed.
          </p>
        )}

        {(method === "GCASH" || method === "OTHERS") && (
          <>
            {method === "OTHERS" && <label className="water-payment-field">
              <span>Payment provider</span>
              <select aria-label="Payment provider" value={provider} onChange={e=>selectProvider(e.target.value)}>
                {OTHER_PROVIDERS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>}
            <div
              className={
                "water-receipt-upload " +
                (receiptDataUrl ? "has-file" : "")
              }
            >
              <div className="water-receipt-upload-head">
                <strong>Add {paymentLabel(method, provider)} receipt proof</strong>
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
                    disabled={imageBusy}
                    onChange={(event) => {
                      const photo=event.target.files?.[0];
                      event.target.value="";
                      selectReceipt(photo);
                    }}
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
                    disabled={imageBusy}
                    onChange={(event) => {
                      const photo=event.target.files?.[0];
                      event.target.value="";
                      selectReceipt(photo);
                    }}
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

            {(imageBusy || scanStatus) && (
              <p className={"water-payment-info water-scan-message " + (scanResult==="detected"?"water-scan-success":scanResult==="unreadable"?"water-scan-warning":"")} role="status" aria-live="polite">
                {imageBusy && <span className="water-scan-spinner" aria-hidden="true" />}
                {scanStatus || "Preparing receipt image…"}
              </p>
            )}
            {imageError && (
              <p className="water-payment-error">{imageError}</p>
            )}

            {receiptDataUrl && (
              <div className="water-receipt-preview-wrap">
                <img
                  className="water-receipt-preview"
                  src={receiptDataUrl}
                  alt={paymentLabel(method, provider) + " receipt preview"}
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                     jobToken.current++;
                     onScanChange(false);
                     setImageBusy(false);
                     setReceiptDataUrl("");
                     setScanStatus("");
                     setScanResult("");
                     setReference("");
                   }}
                >
                  Remove receipt
                </button>
              </div>
            )}

            <label className="water-payment-field">
              <span>{paymentLabel(method, provider)} reference number</span>
              <input
                autoComplete="off"
                inputMode={method === "GCASH" ? "numeric" : "text"}
                placeholder={"Enter the " + paymentLabel(method, provider) + " reference"}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
              <small>
                {imageBusy ? "Reading the receipt now; payment is temporarily locked." : "The scanner fills the reference automatically. Check or correct the number before saving."}
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
  provider = "MAYA",
  setProvider = () => {},
  receiptDataUrl,
  setReceiptDataUrl,
  allowUnpaid = true,
  isCorrection = false,
  busy = false,
  title = "Complete transaction",
  onConfirm,
}) {
  if (!open) return null;
  const [scanBusy, setScanBusy] = useState(false);
  const invalidPayment = !validPaymentSelection(method, reference, provider);
  const confirmLabel = isCorrection
    ? "Save payment correction"
    : method === "UNPAID"
      ? "Save as Unpaid"
      : "Confirm " + paymentLabel(method, provider) + " Payment";

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
          provider={provider}
          setProvider={setProvider}
          receiptDataUrl={receiptDataUrl}
          setReceiptDataUrl={setReceiptDataUrl}
          allowUnpaid={allowUnpaid}
          isCorrection={isCorrection}
          onScanChange={setScanBusy}
        />

        <div className="water-payment-actions">
          <div className="water-dialog-total">
            <span>{isCorrection ? "Recorded payment" : "Amount due"}</span>
            <strong>{cash(total)}</strong>
          </div>
          <button
            type="button"
            className="primary full"
            disabled={busy || scanBusy || invalidPayment}
            onClick={onConfirm}
          >
            {busy ? "Processing…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
