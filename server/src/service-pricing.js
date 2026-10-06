import { Router } from "express";
import { admin } from "./auth.js";
import { atomic, audit, D, money } from "./db.js";
import { serviceSchema } from "./validation.js";

export const servicePricing = Router();
servicePricing.use(admin);

function legacyFields(value) {
  return {
    regularPrice: money(
      new D(value.regularFullPrice).div(value.regularFullQuantity),
    ).toString(),
    expressPrice: money(
      new D(value.expressFullPrice).div(value.expressFullQuantity),
    ).toString(),
    minimumQuantity: value.regularFullQuantity,
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
