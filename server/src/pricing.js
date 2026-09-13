import { D, money, fail } from "./db.js";
export function priceItem(service, item) {
  if (!service?.active) fail(400, "A selected service is unavailable");
  const actual = new D(item.actualQuantity);
  if (service.unit === "PIECE" && !actual.isInteger())
    fail(400, "Piece quantity must be a whole number");
  const billable = D.max(actual, service.minimumQuantity);
  const price = new D(
    item.express ? service.expressPrice : service.regularPrice,
  );
  if (billable.mul(price).gt("9999999999.99"))
    fail(400, "Line total exceeds the supported limit");
  const total = money(billable.mul(price));
  if (total.lte(0)) fail(400, "Line total must be at least 0.01");
  return {
    serviceId: service.id,
    serviceName: service.name,
    unit: service.unit,
    express: item.express,
    actualQuantity: actual,
    billableQuantity: billable,
    unitPrice: price,
    total,
  };
}
export const workflow = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "FOLDING",
  "READY",
  "CLAIMED",
];
