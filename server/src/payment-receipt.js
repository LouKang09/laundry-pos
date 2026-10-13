import { fail } from "./db.js";

export function decodePaymentReceipt(dataUrl) {
  if (!dataUrl) return {};
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    dataUrl,
  );
  if (!match)
    fail(400, "Payment receipt must be a JPG, PNG, or WebP image");
  const receiptImage = Buffer.from(match[2], "base64");
  if (!receiptImage.length || receiptImage.length > 2700000)
    fail(400, "Payment receipt image is too large");
  return { receiptMime: match[1].toLowerCase(), receiptImage };
}
