import { DateTime } from "luxon";
import { fail } from "./db.js";

// datetime-local is submitted as a shop-local wall-clock value (no browser
// timezone conversion). This keeps Manila timestamps correct on any device.
export async function resolvePaymentTime(tx, paidAtLocal, earliestOrderAt = null) {
  if (!paidAtLocal) return null;

  const business = await tx.setting.findUnique({ where: { key: "business" } });
  const timezone = business?.value?.timezone || "Asia/Manila";
  const when = DateTime.fromISO(paidAtLocal, { zone: timezone });
  if (!when.isValid || when.toFormat("yyyy-MM-dd'T'HH:mm") !== paidAtLocal)
    fail(400, "Enter a valid actual payment date and time");

  if (when.toMillis() > Date.now() + 60000)
    fail(400, "Actual payment date and time cannot be in the future");

  if (earliestOrderAt) {
    const orderDate = DateTime.fromJSDate(earliestOrderAt).setZone(timezone).toISODate();
    if (when.toISODate() < orderDate)
      fail(400, "Payment date cannot be earlier than the transaction date");
  }
  return when.toJSDate();
}
