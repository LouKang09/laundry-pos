import { z } from "zod";
export { z };

export const text = z.string().trim().min(1).max(160);

export const pageNumber = z.coerce
  .number()
  .int()
  .min(1)
  .max(1000000)
  .default(1);

export const decimal = (places = 2, zero = false) =>
  z
    .union([z.string(), z.number()])
    .transform(String)
    .refine(
      (v) =>
        new RegExp("^\\d{1,7}(\\.\\d{1," + places + "})?$").test(v) &&
        (zero ? Number(v) >= 0 : Number(v) > 0),
      "Enter a valid positive number",
    );

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/)
  .transform((v) => v.replace(/[ ()-]/g, ""))
  .refine((v) => /^\+?\d{7,15}$/.test(v), "Enter 7–15 phone digits");

export const customerSchema = z
  .object({
    name: text,
    phone: z.union([phone, z.literal("")]).optional().transform((v) => v || ""),
    roomUnit: z.string().trim().max(80).optional().transform((v) => v || null),
  })
  .strict();

export const serviceSchema = z
  .object({
    name: text,
    unit: z.string().trim().min(1).max(30).regex(/^[A-Za-z][A-Za-z0-9 _/-]*$/, "Enter a valid measurement unit"),
    regularFullPrice: decimal(),
    regularFullQuantity: decimal(3),
    regularHalfPrice: decimal(),
    regularHalfQuantity: decimal(3),
    expressFullPrice: decimal(),
    expressFullQuantity: decimal(3),
    expressHalfPrice: decimal(),
    expressHalfQuantity: decimal(3),
    pricingTiers: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      quantity: decimal(3),
      regularPrice: decimal(),
      expressPrice: decimal(),
    }).strict()).min(1).max(20).optional(),
    active: z.boolean().default(true),
  })
  .strict()
  .refine(
    (v) => Number(v.regularHalfQuantity) <= Number(v.regularFullQuantity),
    {
      message: "Regular half-load quantity cannot exceed the full-load quantity",
      path: ["regularHalfQuantity"],
    },
  )
  .refine(
    (v) => Number(v.expressHalfQuantity) <= Number(v.expressFullQuantity),
    {
      message: "Express half-load quantity cannot exceed the full-load quantity",
      path: ["expressHalfQuantity"],
    },
  )
  .refine(
    (v) =>
      !["PIECE", "PCS", "CAPS"].includes(v.unit.toUpperCase()) ||
      [
        v.regularFullQuantity,
        v.regularHalfQuantity,
        v.expressFullQuantity,
        v.expressHalfQuantity,
      ].every((quantity) => Number.isInteger(Number(quantity))),
    { message: "Count-based load quantities must be whole numbers" },
  )
  .refine((v) => !v.pricingTiers ||
    new Set(v.pricingTiers.map((t) => Number(t.quantity))).size === v.pricingTiers.length,
    { message: "Pricing tiers must have unique capacities", path: ["pricingTiers"] })
  .refine((v) => !v.pricingTiers || !["PIECE", "PCS", "CAPS"].includes(v.unit.toUpperCase()) ||
    v.pricingTiers.every((t) => Number.isInteger(Number(t.quantity))),
    { message: "Count-based pricing tiers need whole-number capacities", path: ["pricingTiers"] });

export const addonSchema = z.array(z.object({
  inventoryItemId: text,
  quantity: decimal(3),
}).strict()).max(30).default([]);

export const paymentSchema = z
  .object({
    method: z.enum(["CASH", "GCASH", "OTHERS"]),
    provider: z.enum(["MAYA", "MARIBANK", "GOTYME", "BPI"]).optional(),
    reference: z.string().trim().min(3).max(100).optional(),
    receiptDataUrl: z.string().max(3500000).optional(),
  })
  .strict()
  .refine(v => v.method === "CASH" || !!v.reference, {
    message: "A digital payment reference number (at least 3 characters) is required",
    path: ["reference"],
  })
  .refine(v => (v.method === "OTHERS") === !!v.provider, {
    message: "Select Maya, MariBank, GoTyme, or BPI for Others payments",
    path: ["provider"],
  })
  .refine(v => v.method !== "CASH" || (!v.reference && !v.receiptDataUrl), {
    message: "Cash payments cannot include a digital reference or receipt",
  });

export const orderSchema = z
  .object({
    requestKey: z.string().uuid(),
    customerId: text,
    washingMachine: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((v) => v || null),
    items: z
      .array(
        z
          .object({
            serviceId: text,
            actualQuantity: decimal(3),
            express: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    addons: addonSchema,
    payment: paymentSchema.optional(),
    estimatedFrom: z.iso.datetime().optional(),
    estimatedTo: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (v) =>
      (!v.estimatedFrom && !v.estimatedTo) ||
      (v.estimatedFrom && v.estimatedTo && v.estimatedFrom < v.estimatedTo),
    { message: "Set a valid pickup window with both start and end" },
  );
