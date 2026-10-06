import QRCode from "qrcode";
import { Router } from "express";
import { atomic, audit, fail } from "./db.js";
import { business, orderInclude } from "./orders.js";

export const staffReceipts = Router();

staffReceipts.post("/:id/staff-receipt", async (req, res) => {
  if (req.user.role !== "LAUNDRY_STAFF")
    fail(403, "This receipt route is for Laundry Staff");

  const result = await atomic(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: req.params.id },
      include: orderInclude,
    });
    if (!order) fail(404, "Order not found");

    await tx.order.update({
      where: { id: order.id },
      data: { printCount: { increment: 1 } },
    });
    await audit(
      tx,
      req.user.id,
      order.printCount ? "TRANSACTION_REPRINTED" : "TRANSACTION_PRINTED",
      "Order",
      order.id,
      { copy: order.printCount + 1 },
    );

    return {
      ...order,
      business: await business(tx),
      copy: order.printCount + 1,
    };
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
