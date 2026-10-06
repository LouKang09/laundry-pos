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
        new RegExp("^\\d{1,7}(\\.\\d{1," + places + "})?$",).test(v) &&
        (zero ? Number(v) >= 0 : Number(v) > 0),
      "Enter a valid positive number",
    );
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/)
  .transform((v) => v.replace(/[ ()-]/g, ""))
  .refine((v) => /^\+?\d{7,15}$/.test(v)), "Enter 7–15 phone digits");
export const customerSchema = z.object({ name: text, phone }).strict();
export const serviceSchema = z 
  .object({
    name: text,
    unit: z.enum(["KG", "PIECE"]),
    regularFullPrice: decimal(),
    regularFullQuantity: decimal(3),
    regularHalfPrice: decimal(),
    regularHalfQuantity: decimal(3),
    expressFullPrice: decimal(),
    expressFullQuantity: decimal(3),
    expressHalfPrice: decimal(),
    expressHalfQuantity: decimal(3),
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
      v.unit !== "PIECE" ||
      [
        v.regularFullQuantity,
        v.regularHalfQuantity,
        v.expressFullQuantity,
        v.expressHalfQuantity,
      ].every((quantity) => Number.isInteger(Number(quantity))),
    { message: "Piece load quantities must be whole numbers" },
  );
export const paymentSchema = z 
  .object({
    method: z.enum(["CASH", "GCASH"]),
    reference: z.string().trim().min(4).max(100).optional(),
  })
  .strict()
  .refine((v) => v.method !== "GCASH" || !!v.reference, {
    message: "GCash reference is required",
  });
export const orderSchema = z 
  .object({
    requestKey: z.string().uuid(),
    customerId: text,
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
    payment: paymentSchema.optional(),
    estimatedFrom: z.iso.datetime().optional(),
    estimatedTo: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.items.map((i) => i.serviceId + ":" + i.express)).size ===
      v.items.length,
    { message: "Combine duplicate service/speed lines before saving" },
  )
  .refine(
    (v) =>
      (!v.estimatedFrom && !v4.estimatedTo) ||
      (v.estimatedFrom && v.estimatedTo && v.estimatedFrom < v.estimatedTo),
    { message: "Set a valid pickup window with both start and end" },
  );
