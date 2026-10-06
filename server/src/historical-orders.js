import crypto from "node:crypto";
import { Router } from "express";
import { DateTime } from "luxon";
import { atomic, audit, db, D, fail, money } from "./db.js";
import { admin } from "./auth.js";
import { business, orderInclude } from "./orders.js";
import { priceItem, workflow } from "./pricing.js";
import { z, decimal, paymentSchema, text } from "./validation.js";

export const historicalOrders = Router();

const historicalOrderSchema = z
  .object({
    requestKey: z.string().uuid(),
    historicalDate: z.iso.date(),
    customerId: text,
    status: z.enum(workflow),
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
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.items.map((i) => i.serviceId + ":" + i.express)).size ===
      v.items.length,
    { message: "Combine duplicate service/speed lines before saving" },
  )
  .refine((v) => v.status !== "CLAIMED" || !!v.payment, {
    message: "A claimed historical transaction must include payment",
    path: ["payment"],
  });

historicalOrders.post("/historical", admin, async (req, res) => {
  const data = historicalOrderSchema.parse(req.body);
  const result = await atomic(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { requestKey: data.requestKey },
      include: orderInclude,
    });
    if (existing) return existing;

    const cfg = await business(tx);
    const today = DateTime.now().setZone(cfg.timezone).startOf("day");
    const selectedDay = DateTime.fromISO(data.historicalDate, {
      zone: cfg.timezone,
    }).startOf("day");
    if (!selectedDay.isValid) fail(400, "Invalid historical transaction date");
    if (selectedDay >= today)
      fail(400, "Admin manual entries are only allowed for past dates");

    const customer = await tx.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) fail(404, "Customer not found");

    const lines = [];
    for (const item of data.items) {
      const service = await tx.service.findUnique({
        where: { id: item.serviceId },
      });
      lines.push(priceItem(service, item));
    }
    const total = money(lines.reduce((sum, l) => sum.add(l.total), new D(0)));
    if (total.gt("9999999999.99"))
      fail(400, "Order total exceeds the supported limit");

    // Noon avoids a date rolling backward or forward when displayed in the shop zone.
    const historicalAt = selectedDay.plus({ hours: 12 });
    const turnaroundHours = lines.every((l) => l.express)
      ? cfg.expressHours
      : cfg.regularHours;
    const estimatedFrom = historicalAt.plus({ hours: turnaroundHours });
    const estimatedTo = estimatedFrom.plus({ hours: cfg.windowHours });
    const stageIndex = workflow.indexOf(data.status);
    const history = workflow.slice(0, stageIndex + 1).map((newStatus, index) => ({
      oldStatus: index ? workflow[index - 1] : null,
      newStatus,
      userId: req.user.id,
      createdAt: historicalAt.plus({ minutes: index }).toJSDate(),
    }));

    const number =
      await tx.$queryRaw`SELECT nextval(pg_get_serial_sequence('"Order"', 'number'))::int AS n`;
    const orderNumber = `L-${selectedDay.toFormat("yyyyLLdd")}-${String(number[0].n).padStart(5, "0")}`;

    const order = await tx.order.create({
      data: {
        number: number[0].n,
        orderNumber,
        requestKey: data.requestKey,
        trackingToken: crypto.randomBytes(24).toString("hex"),
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        userId: req.user.id,
        status: data.status,
        paymentStatus: data.payment ? "PAID" : "UNPAID",
        total,
        estimatedFrom: estimatedFrom.toJSDate(),
        estimatedTo: estimatedTo.toJSDate(),
        claimedAt:
          data.status === "CLAIMED"
            ? historicalAt.plus({ minutes: stageIndex }).toJSDate()
            : null,
        createdAt: historicalAt.toJSDate(),
        items: { create: lines },
        statusHistory: { create: history },
        ...(data.payment
          ? {
              payment: {
                create: {
                  userId: req.user.id,
                  method: data.payment.method,
                  reference:
                    data.payment.method === "GCASH"
                      ? data.payment.reference
                      : null,
                  amount: total,
                  createdAt: historicalAt.toJSDate(),
                },
              },
            }
          : {}),
      },
      include: orderInclude,
    });

    await audit(tx, req.user.id, "HISTORICAL_ORDER_CREATED", "Order", order.id, {
      orderNumber,
      historicalDate: data.historicalDate,
      status: data.status,
      paymentMethod: data.payment?.method || "UNPAID",
      total: total.toString(),
      inventoryAdjusted: false,
    });

    return order;
  });
  res.status(201).json(result);
});
