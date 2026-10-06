import { D, money, fail } from "./db.js";

function loadConfig(service, express) {
  return express
    ? {
        fullPrice: new D(service.expressFullPrice),
        fullQuantity: new D(service.expressFullQuantity),
        halfPrice: new D(service.expressHalfPrice),
        halfQuantity: new D(service.expressHalfQuantity),
      }
    : {
        fullPrice: new D(service.regularFullPrice),
        fullQuantity: new D(service.regularFullQuantity),
        halfPrice: new D(service.regularHalfPrice),
        halfQuantity: new D(service.regularHalfQuantity),
      };
}

function quantityText(value) {
  return new D(value).toDecimalPlaces(3).toString();
}

export function priceItem(service, item) {
  if (!service?.active) fail(400, "A selected service is unavailable");
  const actual = new D(item.actualQuantity);
  if (service.unit === "PIECE" && !actual.isInteger())
    fail(400, "Piece quantity must be a whole number");

  const { fullPrice, fullQuantity, halfPrice, halfQuantity } = loadConfig(
    service,
    item.express,
  );
  if (
    fullPrice.lte(0) ||
    halfPrice.lte(0) ||
    fullQuantity.lte(0) ||
    halfQuantity.lte(0) ||
    halfQuantity.gt(fullQuantity)
  )
    fail(400, "This service has an invalid load-pricing setup");

  let fullLoads = actual.div(fullQuantity).floor();
  const remainder = actual.minus(fullLoads.mul(fullQuantity));
  let halfLoads = new D(0);
  if (remainder.gt(0)) {
    if (remainder.lte(halfQuantity)) halfLoads = new D(1);
    else fullLoads = fullLoads.add(1);
  }

  const billable = fullLoads
    .mul(fullQuantity)
    .add(halfLoads.mul(halfQuantity));
  const total = money(
    fullLoads.mul(fullPrice).add(halfLoads.mul(halfPrice)),
  );
  if (total.gt("9999999999.99"))
    fail(400, "Line total exceeds the supported limit");
  if (total.lte(0)) fail(400, "Line total must be at least 0.01");

  const unit = service.unit === "KG" ? "kg" : "pc";
  const parts = [];
  if (fullLoads.gt(0))
    parts.push(
      `${fullLoads.toString()} Full (${quantityText(fullQuantity)} ${unit}) × ₱${fullPrice.toFixed(2)}`,
    );
  if (halfLoads.gt(0))
    parts.push(
      `1 Half (${quantityText(halfQuantity)} ${unit}) × ₱${halfPrice.toFixed(2)}`,
    );

  // unitPrice remains as a legacy snapshot field for older screens/reports.
  // New load-priced transactions use pricingLabel as the authoritative display.
  const effectiveUnitPrice = money(total.div(billable));

  return {
    serviceId: service.id,
    serviceName: service.name,
    unit: service.unit,
    express: item.express,
    actualQuantity: actual,
    billableQuantity: billable,
    unitPrice: effectiveUnitPrice,
    pricingLabel: parts.join(" + "),
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
