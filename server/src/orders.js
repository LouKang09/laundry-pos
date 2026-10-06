import crypto from "node:crypto";
import QRCode from "qrcode";
import { Router } from "express";
import { db, atomic, D, money, audit, fail } from "./db.js";
import {
  z,
  text,
  pageNumber,
  orderSchema,
  paymentSchema,
} from "./validation.js";
import { priceItem, workflow } from "./pricing.js";
import { admin } from "./auth.js";
import { DateTime } from "luxon";
export const orders = Router();
export const orderInclude = {
  items: true,
  payment: true,
  user: { select: { id: true, name: true } },
};
export const business = async (tx = db) =>
  (await tx.setting.findUnique({ where: { key: "business" } }))?.value || {
    name: "Laundry POS",
    timezone: "Asia/Manila",
    regularHours: 24,
    expressHours: 6,
    windowHours: 4,
  };
async function getOrder(tx, id) {
  const o = await tx.order.findUnique({ where: { id }, include: orderInclude });
  if (!o) fail(404, "Order not found");
  return o;
}
async function receive(tx, order, userId, payment) {
  if (order.status === "CANCELLED")
    fail(409, "Cancelled orders cannot receive payment");
  if (order.paymentStatus === "PAID") fail(409, "This order is already paid");
  await tx.payment.create({
    data: {
      orderId: order.id,
      userId,
      method: payment.method,
      reference: payment.method === "GCASH" ? payment.reference : null,
      amount: order.total,
    },
  });
  await tx.order.update({
    where: { id: order.id },
    data: { paymentStatus: "PAID" },
  });
  await audit(tx, userId, "PAYMENT_RECEIVED", "Order", order.id, {
    method: payment.method,
    amount: order.total.toString(),
  });
}
async function consume(tx, order, userId) {
  for (const line of order.items) {
    const usages = await tx.serviceInventoryUsage.findMany({
      where: { serviceId: line.serviceId },
    });
    for (const usage of usages) {
      const qty = new D(usage.quantityPerUnit)
        .mul(line.actualQuantity)
        .toDecimalPlaces(3, D.ROUND_HALF_UP);
      if (qty.isZero()) continue;
      const item = await tx.inventoryItem.findUnique({
        where: { id: usage.inventoryItemId },
      });
      if (!item.active || item.stock.lt(qty))
        fail(
          409,
          `Insufficient ${item.name}. Replenish inventory before washing.`,
        );
      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { stock: { decrement: qty } },
      });
      await tx.inventoryTransaction.create({
        data: {
          itemId: item.id,
          type: "CONSUMPTION",
          quantity: qty.negated(),
          stockAfter: updated.stock,
          reason: `Service use: ${order.orderNumber}`,
          userId,
          orderId: order.id,
        },
      });
      await audit(tx, userId, "INVENTORY_CHANGED", "InventoryItem", item.id, {
        orderId: order.id,
        quantity: qty.negated().toString(),
      });
    }
  }
}
orders.post("/", async (req, res) => {
  if (req.user.role !== "LAUNDRY_STAFF")
    fail(403, "Only Laundry Staff can create and save new orders");
  const data = orderSchema.parse(req.body);
  const result = await atomic(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { requestKey: data.requestKey },
      include: orderInclude,
    });
    if (existing) {
      if (existing.userId !== req.user.id) fail(409, "Duplicate request key");
      return existing;
    }
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId },
    });
    if (!customer) fail(404, "Customer not found");
    const lines = [];
    for (const item of data.items)
      lines.push(
        priceItem(
          await tx.service.findUnique({ where: { id: item.serviceId } }),
          item,
        ),
      );
    const total = money(lines.reduce((sum, l) => sum.add(l.total), new D(0)));
    if (total.gt("9999999999.99"))
      fail(400, "Order total exceeds the supported limit");
    const config = await business(tx),
      now = new Date();
    const hours = lines.every((l) => l.express)
      ? config.expressHours
      : config.regularHours;
    const from = data.estimatedFrom
      ? new Date(data.estimatedFrom)
      : new Date(now.getTime() + hours * 3600000);
    const to = data.estimatedTo
      ? new Date(data.estimatedTo)
      : new Date(from.getTime() + config.windowHours * 3600000);
    if (from < now) fail(400, "Pickup estimate cannot be in the past");
    const number =
      await tx.$queryRaw`SELECT nextval(pg_get_serial_sequence('"Order"', 'number'))::int AS n`;
    const orderNumber = `L-${DateTime.now().setZone(config.timezone).toFormat("yyyyLLdd")}-${String(number[0].n).padStart(5, "0")}`;
    const o = await tx.order.create({
      data: {
        number: number[0].n,
        orderNumber,
        requestKey: data.requestKey,
        trackingToken: crypto.randomBytes(24).toString("hex"),
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        userId: req.user.id,
        total,
        estimatedFrom: from,
        estimatedTo: to,
        items: { create: lines },
        statusHistory: {
          create: { newStatus: "RECEIVED", userId: req.user.id },
        },
      },
      include: orderInclude,
    });
    await audit(tx, req.user.id, "ORDER_CREATED", "Order", o.id, {
      orderNumber,
      total: total.toString(),
    });
    if (data.payment) await receive(tx, o, req.user.id, data.payment);
    return getOrder(tx, o.id);
  });
  res.status(201).json(result);
});
orders.get("/", async (req, res) => {
  const q = z
      .string()
      .max(200)
      .parse(req.query.q || ""),
    page = pageNumber.parse(req.query.page),
    view = z
      .enum(["orders", "pickup", "transactions", "customer"])
      .parse(req.query.view || "orders");
  const requestedStatus = req.query.status
    ? z.enum([...workflow, "CANCELLED"]).parse(req.query.status)
    : undefined;
  const cfg = await business(),
    from = DateTime.now().setZone(cfg.timezone).startOf("day"),
    to = from.plus({ days: 1 }),
    today = { gte: from.toJSDate(), lt: to.toJSDate() },
    staffToday = req.user.role === "LAUNDRY_STAFF";
  let scope = {};
  if (view === "orders") {
    const active = ["RECEIVED", "WASHING", "DRYING", "FOLDING"];
    if (requestedStatus && !active.includes(requestedStatus))
      fail(400, "That status is not shown in Orders");
    scope = {
      status: requestedStatus || { in: active },
      ...(staffToday ? { createdAt: today } : {}),
    };
  } else if (view === "pickup") {
    if (requestedStatus && requestedStatus !== "READY")
      fail(400, "Pickup only shows Ready orders");
    scope = { status: "READY" };
  } else if (view === "transactions") {
    if (requestedStatus && requestedStatus !== "CLAIMED")
      fail(400, "Transactions only shows Claimed orders");
    scope = {
      status: "CLAIMED",
      ...(staffToday ? { claimedAt: today } : {}),
    };
  } else {
    scope = {
      ...(requestedStatus ? { status: requestedStatus } : {}),
      ...(staffToday ? { createdAt: today } : {}),
    };
  }
  const where = {
    ...scope,
    ...(req.query.customerId
      ? { customerId: String(req.query.customerId) }
      : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q.replace(/[ ()-]/g, "") || q } },
            { trackingToken: q.replace(/^.*\/track\//, "").toLowerCase() },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      include: orderInclude,
      orderBy:
        view === "transactions"
          ? [{ claimedAt: "desc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
      take: 30,
      skip: (page - 1) * 30,
    }),
    db.order.count({ where }),
  ]);
  await audit(
    db,
    req.user.id,
    view === "transactions" ? "TRANSACTION_VIEWED" : "ORDER_LIST_VIEWED",
    "Order",
    undefined,
    { page, filtered: !!q, view },
  );
  res.json({ rows, total, page, view });
});
orders.get("/scan/:token", async (req, res) => {
  const token = z
    .string()
    .regex(/^[a-f0-9]{48}$/i)
    .transform((v) => v.toLowerCase())
    .parse(req.params.token);
  const o = await db.order.findUnique({
    where: { trackingToken: token },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      status: true,
      paymentStatus: true,
    },
  });
  if (!o) fail(404, "Order QR was not found");
  const index = workflow.indexOf(o.status),
    nextStatus = index >= 0 && index < workflow.length - 1 ? workflow[index + 1] : null;
  res.json({
    ...o,
    nextStatus,
    blockedReason:
      nextStatus === "CLAIMED" && o.paymentStatus !== "PAID"
        ? "Receive full payment before claiming this order."
        : null,
  });
});
orders.get("/:id", async (req, res) => {
  const o = await getOrder(db, req.params.id);
  const [statusHistory, notifications] = await Promise.all([
    db.orderStatusHistory.findMany({
      where: { orderId: o.id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.notification.findMany({
      where: { orderId: o.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  await audit(db, req.user.id, "ORDER_VIEWED", "Order", o.id);
  res.json({ ...o, statusHistory, notifications });
});
orders.post("/:id/payment", async (req, res) => {
  const payment = paymentSchema.parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const o = await getOrder(tx, req.params.id);
      await receive(tx, o, req.user.id, payment);
      return getOrder(tx, o.id);
    }),
  );
});
orders.post("/:id/status", async (req, res) => {
  const { status, reason } = z
    .object({
      status: z.enum([...workflow, "CANCELLED"]),
      reason: z.string().trim().min(3).max(500).optional(),
    })
    .strict()
    .parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const o = await getOrder(tx, req.params.id);
      if (status === "CANCELLED") {
        if (req.user.role !== "ADMIN")
          fail(403, "Only Admin can cancel orders");
        if (o.status !== "RECEIVED" || o.paymentStatus !== "UNPAID")
          fail(409, "Only unpaid, received orders can be cancelled");
        if (!reason) fail(400, "Cancellation reason is required");
      } else {
        if (
          workflow[workflow.indexOf(o.status) + 1] !== status ||
          o.status === "CANCELLED"
        )
          fail(409, "Follow the next laundry workflow stage");
        if (status === "CLAIMED" && o.paymentStatus !== "PAID")
          fail(409, "Receive full payment before claiming");
      }
      if (status === "WASHING") await consume(tx, o, req.user.id);
      await tx.order.update({
        where: { id: o.id },
        data: {
          status,
          claimedAt: status === "CLAIMED" ? new Date() : undefined,
          cancellationReason: status === "CANCELLED" ? reason : undefined,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: o.id,
          oldStatus: o.status,
          newStatus: status,
          userId: req.user.id,
        },
      });
      const messages = {
        DRYING: "Your laundry is now in the drying stage.",
        FOLDING: "Your laundry is now being folded and will be ready soon.",
        READY: "Your laundry is ready for pickup.",
      };
      if (messages[status]) {
        const cfg = await business(tx);
        const window =
          o.estimatedFrom && o.estimatedTo && status !== "READY"
            ? ` Approximate pickup: ${DateTime.fromJSDate(o.estimatedFrom).setZone(cfg.timezone).toFormat("LLL d, h:mm a")} – ${DateTime.fromJSDate(o.estimatedTo).setZone(cfg.timezone).toFormat("LLL d, h:mm a")}. Timing may change.`
            : "";
        await tx.notification.create({
          data: {
            orderId: o.id,
            stage: status,
            phone: o.customerPhone,
            message: `${cfg.name} · ${o.orderNumber}: ${messages[status]}${window}`,
          },
        });
      }
      await audit(
        tx,
        req.user.id,
        status === "CANCELLED" ? "CANCELLATION" : "STATUS_UPDATED",
        "Order",
        o.id,
        {
          oldStatus: o.status,
          newStatus: status,
          ...(reason ? { reason } : {}),
        },
      );
      return getOrder(tx, o.id);
    }),
  );
});
orders.post("/:id/receipt", admin, async (req, res) => {
  const result = await atomic(async (tx) => {
    const o = await getOrder(tx, req.params.id);
    await tx.order.update({
      where: { id: o.id },
      data: { printCount: { increment: 1 } },
    });
    await audit(
      tx,
      req.user.id,
      o.printCount ? "TRANSACTION_REPRINTED" : "TRANSACTION_PRINTED",
      "Order",
      o.id,
      { copy: o.printCount + 1 },
    );
    return { ...o, business: await business(tx), copy: o.printCount + 1 };
  });
  const base = process.env.APP_URL || "http://localhost:5173";
  res.json({
    ...result,
    qr: await QRCode.toDataURL(`${base}/track/${result.trackingToken}`, {
      width: 220,
      margin: 1,
    }),
    trackingUrl: `${base}/track/${result.trackingToken}`,
  });
});
export async function publicTracking(req, res) {
  const token = z
    .string()
    .regex(/^[a-f0-9]{48}$/)
    .parse(req.params.token);
  const o = await db.order.findUnique({
    where: { trackingToken: token },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      estimatedFrom: true,
      estimatedTo: true,
    },
  });
  if (!o) fail(404, "Tracking record not found");
  const cfg = await business();
  res
    .set("Cache-Control", "no-store")
    .json({ ...o, businessName: cfg.name, timezone: cfg.timezone });
}
