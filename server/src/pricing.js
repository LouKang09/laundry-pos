import { D, money, fail } from "./db.js";

function availableTiers(service, express) {
  const configured = Array.isArray(service.pricingTiers) && service.pricingTiers.length
    ? service.pricingTiers
    : [
      { label: "Full", quantity: service.regularFullQuantity, regularPrice: service.regularFullPrice, expressPrice: service.expressFullPrice },
      { label: "Half", quantity: service.regularHalfQuantity, regularPrice: service.regularHalfPrice, expressPrice: service.expressHalfPrice },
    ];
  return configured.map(t => ({ label: t.label, quantity: new D(t.quantity), price: new D(express ? t.expressPrice : t.regularPrice) }))
    .sort((a,b) => b.quantity.comparedTo(a.quantity));
}

export function priceItem(service, item) {
  if (!service?.active) fail(400, "A selected service is unavailable");
  const actual = new D(item.actualQuantity);
  if (["PIECE", "PCS", "CAPS"].includes(service.unit.toUpperCase()) && !actual.isInteger())
    fail(400, "Count-based quantities must be whole numbers");
  const tiers = availableTiers(service, item.express);
  if (!tiers.length || tiers.some(t => t.quantity.lte(0) || t.price.lte(0)))
    fail(400, "This service has an invalid pricing setup");
  const largest = tiers[0];
  const fullLoads = actual.div(largest.quantity).floor();
  const remainder = actual.minus(fullLoads.mul(largest.quantity));
  const portions = [];
  if (fullLoads.gt(0)) portions.push({ tier: largest, count: fullLoads });
  if (remainder.gt(0)) {
    const matching = [...tiers].reverse().find(t => t.quantity.gte(remainder)) || largest;
    const existing = portions.find(row => row.tier === matching);
    if (existing) existing.count = existing.count.add(1);
    else portions.push({ tier: matching, count: new D(1) });
  }
  const billable = portions.reduce((sum,row) => sum.add(row.tier.quantity.mul(row.count)),new D(0));
  const total = money(portions.reduce((sum,row) => sum.add(row.tier.price.mul(row.count)),new D(0)));
  if (total.gt("9999999999.99")) fail(400, "Line total exceeds the supported limit");
  if (total.lte(0)) fail(400, "Line total must be at least 0.01");
  const label = portions.map(({tier,count}) =>
    `${count.toString()} ${tier.label} (${tier.quantity.toString()} ${service.unit}) × ₱${tier.price.toFixed(2)}`).join(" + ");
  return {
    serviceId: service.id, serviceName: service.name, unit: service.unit,
    express: item.express, actualQuantity: actual, billableQuantity: billable,
    unitPrice: money(total.div(billable)), pricingLabel: label, total,
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
