import { Router } from "express";
import { admin } from "./auth.js";
import { atomic, audit, D, money } from "./db.js";
import { serviceSchema } from "./validation.js";

export const servicePricing = Router();
servicePricing.use(admin);

function legacyFields(value) {
  const tiers = value.pricingTiers?.length
    ? [...value.pricingTiers].sort((a,b) => Number(b.quantity) - Number(a.quantity)) : null;
  const full = tiers?.[0], half = tiers?.[1] || full;
  const legacy = full ? {
    regularFullPrice: full.regularPrice, regularFullQuantity: full.quantity,
    regularHalfPrice: half.regularPrice, regularHalfQuantity: half.quantity,
    expressFullPrice: full.expressPrice, expressFullQuantity: full.quantity,
    expressHalfPrice: half.expressPrice, expressHalfQuantity: half.quantity,
  } : value;
  return {
    ...(full ? legacy : {}),
    regularPrice: money(new D(legacy.regularFullPrice).div(legacy.regularFullQuantity)).toString(),
    expressPrice: money(new D(legacy.expressFullPrice).div(legacy.expressFullQuantity)).toString(),
    minimumQuantity: legacy.regularFullQuantity,
  };
}

servicePricing.post("/services", async (req, res) => {
  const value = serviceSchema.parse(req.body);
  res.status(201).json(
    await atomic(async (tx) => {
      const service = await tx.service.create({
        data: { ...value, ...legacyFields(value) },
      });
      await audit(
        tx,
        req.user.id,
        "SERVICE_PRICING_CHANGED",
        "Service",
        service.id,
        {
          operation: "created",
          pricingModel: "FULL_HALF_LOAD",
          ...value,
        },
      );
      return service;
    }),
  );
});

servicePricing.put("/services/:id", async (req, res) => {
  const value = serviceSchema.parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const service = await tx.service.update({
        where: { id: req.params.id },
        data: { ...value, ...legacyFields(value) },
      });
      await audit(
        tx,
        req.user.id,
        "SERVICE_PRICING_CHANGED",
        "Service",
        service.id,
        {
          operation: "updated",
          pricingModel: "FULL_HALF_LOAD",
          ...value,
        },
      );
      return service;
    }),
  );
});
