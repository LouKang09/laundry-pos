import Decimal from "decimal.js";

const money = (value) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP",
}).format(Number(value || 0));
const qty = (value) => new Decimal(value || 0).toDecimalPlaces(3).toString();

export function loadTiers(service, express = false) {
  if (!service) return [];
  const tiers = Array.isArray(service.pricingTiers) && service.pricingTiers.length
    ? service.pricingTiers
    : [
      { label: "Full", quantity: service.regularFullQuantity, regularPrice: service.regularFullPrice, expressPrice: service.expressFullPrice },
      { label: "Half", quantity: service.regularHalfQuantity, regularPrice: service.regularHalfPrice, expressPrice: service.expressHalfPrice },
    ];
  return tiers.map(t => ({
    label: t.label,
    quantity: new Decimal(t.quantity || 0),
    price: new Decimal((express ? t.expressPrice : t.regularPrice) || 0),
  })).sort((a,b) => b.quantity.comparedTo(a.quantity));
}

export function loadPlan(service, express = false) {
  const tiers = loadTiers(service, express);
  return tiers.length ? {
    fullPrice: tiers[0].price, fullQuantity: tiers[0].quantity,
    halfPrice: (tiers[1] || tiers[0]).price,
    halfQuantity: (tiers[1] || tiers[0]).quantity,
  } : null;
}

export function servicePlanText(service, express = false) {
  return loadTiers(service, express)
    .map(t => `${t.label} ${money(t.price)} / ${qty(t.quantity)} ${service.unit}`)
    .join(" · ");
}

export function calculateLoadPricing(service, actualQuantity, express = false) {
  const actual = new Decimal(actualQuantity || 0), tiers = loadTiers(service, express);
  const empty = { actual, fullLoads: 0, halfLoads: 0, billable: new Decimal(0), total: new Decimal(0), breakdown: "" };
  if (!tiers.length || actual.lte(0) || tiers.some(t => t.quantity.lte(0) || t.price.lte(0))) return empty;
  const largest = tiers[0];
  const fullLoads = actual.div(largest.quantity).floor();
  const remainder = actual.minus(fullLoads.mul(largest.quantity));
  const portions = [];
  if (fullLoads.gt(0)) portions.push({ tier: largest, count: fullLoads });
  if (remainder.gt(0)) {
    const matching = [...tiers].reverse().find(t => t.quantity.gte(remainder)) || largest;
    const existing = portions.find(row => row.tier === matching);
    if (existing) existing.count = existing.count.add(1);
    else portions.push({ tier: matching, count: new Decimal(1) });
  }
  const billable = portions.reduce((sum,row) => sum.add(row.tier.quantity.mul(row.count)), new Decimal(0));
  const total = portions.reduce((sum,row) => sum.add(row.tier.price.mul(row.count)), new Decimal(0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const breakdown = portions.map(({tier,count}) =>
    `${count.toString()} ${tier.label} (${qty(tier.quantity)} ${service.unit}) × ${money(tier.price)}`).join(" + ");
  return { actual, fullLoads: fullLoads.toNumber(),
    halfLoads: portions.filter(row => row.tier !== largest).reduce((sum,row) => sum + row.count.toNumber(),0),
    billable, total, breakdown };
}
