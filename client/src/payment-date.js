// Show date/time in the configured shop timezone (Asia/Manila by default).
// Submit the literal wall-clock value to the API; the server resolves its
// timezone so a laptop with different timezone settings cannot shift the date.
export function shopPaymentDateTime(instant = new Date()) {
  if (!instant) return "";
  const time = new Date(instant);
  if (Number.isNaN(time.getTime())) return "";
  const zone = (typeof window !== "undefined" && window.businessZone) || "Asia/Manila";
  const fields = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(time);
  const values = Object.fromEntries(fields.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
