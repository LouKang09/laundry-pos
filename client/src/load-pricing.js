import Decimal from "decimal.js";

const money = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));

const qty = (value) =>
  new Decimal(value || 0).toDecimalPlaces(3).toString();

export function loadPlan(service, express = false) {
  if (!service) return null;
  return express
    ? {
        fullPrice: new Decimal(service.expressFullPrice || 0),
        fullQuantity: new Decimal(service.expressFullQuantity || 0),
        halfPrice: new Decimal(service.expressHalfPrice || 0),
        halfQuantity: new Decimal(service.expressHalfQuantity || 0),
      }
    : {
        fullPrice: new Decimal(service.regularFullPrice || 0),
        fullQuantity: new Decimal(service.regularFullQuantity || 0),
        halfPrice: new Decimal(service.regularHalfPrice || 0),
        halfQuantity: new Decimal(service.regularHalfQuantity || 0),
      };
}

export function servicePlanText(service, express = false) {
  const plan = loadPlan(service, express);
  if (!plan) return "";
  const unit = service.unit === "KG" ? "kg" : "pc";
  return `Full ${money(plan.fullPrice)} / ${qty(plan.fullQuantity)} ${unit} · Half ${money(plan.halfPrice)} / ${qty(plan.halfQuantity)} ${unit}`;
}

export function calculateLoadPricing(service, actualQuantity, express = false) {
  const actual = new Decimal(actualQuantity || 0),
    plan = loadPlan(service, express);
  if (!service || !plan || actual.lte(0) || plan.fullQuantity.lte(0)) {
    return {
      actual,
      fullLoads: 0,
      halfLoads: 0,
      billable: new Decimal(0),
      total: new Decimal(0),
      breakdown: "",
    };
  }

  let fullLoads = actual.div(plan.fullQuantity).floor().toNumber();
  const remainder = actual.minus(plan.fullQuantity.mul(fullLoads));
  let halfLoads = 0;
  if (remainder.gt(0)) {
    if (remainder.lte(plan.halfQuantity)) halfLoads = 1;
    else fullLoads += 1;
  }

  const billable = plan.fullQuantity
    .mul(fullLoads)
    .add(plan.halfQuantity.mul(halfLoads));
  const total = plan.fullPrice
    .mul(fullLoads)
    .add(plan.halfPrice.mul(halfLoads))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const unit = service.unit === "KG" ? "kg" : "pc";
  const parts = [];
  if (fullLoads)
    parts.push(
      `${fullLoads} Full (${qty(plan.fullQuantity)} ${unit}) × ${money(plan.fullPrice)}`,
    );
  if (halfLoads)
    parts.push(
      `1 Half (${qty(plan.halfQuantity)} ${unit}) × ${money(plan.halfPrice)}`,
    );

  return {
    actual,
    fullLoads,
    halfLoads,
    billable,
    total,
    breakdown: parts.join(" + "),
  };
}
