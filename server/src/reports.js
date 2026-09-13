import { Router } from "express";
import { DateTime } from "luxon";
import { db, D, audit } from "./db.js";
import { z } from "./validation.js";
import { admin } from "./auth.js";
import { business } from "./orders.js";
export const reporting = Router();
const sum = (rows, key) => rows.reduce((s, r) => s.add(r[key]), new D(0));
export function periodRange(period, date, zone) {
  const d = DateTime.fromISO(date, { zone });
  const unit = {
    Daily: "day",
    Weekly: "week",
    Monthly: "month",
    Yearly: "year",
  }[period];
  return {
    from: d.startOf(unit),
    to: d.startOf(unit).plus({ [unit + "s"]: 1 }),
  };
}
async function report(from, to) {
  const date = { gte: from.toJSDate(), lt: to.toJSDate() };
  const [orders, payments, expenses, completed] = await Promise.all([
    db.order.findMany({
      where: { createdAt: date, status: { not: "CANCELLED" } },
      include: { items: true, user: { select: { name: true, id: true } } },
    }),
    db.payment.findMany({ where: { createdAt: date } }),
    db.expense.findMany({
      where: {
        date: {
          gte: new Date(from.toISODate() + "T00:00:00Z"),
          lt: new Date(to.toISODate() + "T00:00:00Z"),
        },
      },
    }),
    db.orderStatusHistory.findMany({
      where:{newStatus:'READY',createdAt:date},
      include:{order:{include:{items:true}}},
    }),
  ]);
  const services = {},
    staff = {},
    trend = {};
  let kg = new D(0),
    pieces = new D(0);
  for (const o of orders) {
    const day = DateTime.fromJSDate(o.createdAt)
      .setZone(from.zoneName)
      .toISODate();
    trend[day] ??= { date: day, sales: new D(0), orders: 0 };
    trend[day].sales = trend[day].sales.add(o.total);
    trend[day].orders++;
    staff[o.userId] ??= { name: o.user.name, orders: 0, sales: new D(0) };
    staff[o.userId].orders++;
    staff[o.userId].sales = staff[o.userId].sales.add(o.total);
    for (const i of o.items) {
      const k = i.serviceName + "|" + i.unit;
      services[k] ??= {
        name: i.serviceName,
        unit: i.unit,
        actual: new D(0),
        billable: new D(0),
        sales: new D(0),
      };
      services[k].actual = services[k].actual.add(i.actualQuantity);
      services[k].billable = services[k].billable.add(i.billableQuantity);
      services[k].sales = services[k].sales.add(i.total);
    }
  }
  for (const event of completed) for (const item of event.order.items) {
    if (item.unit === 'KG') kg = kg.add(item.actualQuantity);
    else pieces = pieces.add(item.actualQuantity);
  }
  const gross = sum(orders, "total"),
    expense = sum(expenses, "amount");
  return {
    grossSales: gross.toFixed(2),
    orders: orders.length,
    kilograms: kg.toString(),
    pieces: pieces.toString(),
    expenses: expense.toFixed(2),
    estimatedProfit: gross.sub(expense).toFixed(2),
    paymentsReceived: sum(payments, "amount").toFixed(2),
    paymentMethods: ["CASH", "GCASH"].map((method) => ({
      method,
      amount: sum(
        payments.filter((p) => p.method === method),
        "amount",
      ).toFixed(2),
    })),
    services: Object.values(services),
    staff: Object.values(staff),
    trend: Object.values(trend).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
reporting.get("/reports", admin, async (req, res) => {
  const period = z
      .enum(["Daily", "Weekly", "Monthly", "Yearly"])
      .parse(req.query.period || "Daily"),
    cfg = await business();
  const date = z.iso
    .date()
    .parse(req.query.date || DateTime.now().setZone(cfg.timezone).toISODate());
  const { from, to } = periodRange(period, date, cfg.timezone);
  const data = await report(from, to);
  await audit(db, req.user.id, "REPORT_VIEWED", "Report", undefined, {
    period,
    date,
  });
  res.json({
    ...data,
    period,
    from: from.toISO(),
    to: to.toISO(),
    timezone: cfg.timezone,
  });
});
reporting.get("/dashboard", async (req, res) => {
  const cfg = await business(),
    from = DateTime.now().setZone(cfg.timezone).startOf("day"),
    to = from.plus({ days: 1 });
  const [today, groups, claimedToday, unpaidOrders, inventory, week] =
    await Promise.all([
      db.order.aggregate({
        where: {
          createdAt: { gte: from.toJSDate(), lt: to.toJSDate() },
          status: { not: "CANCELLED" },
        },
        _sum: { total: true },
        _count: true,
      }),
      db.order.groupBy({ by: ["status"], _count: true }),
      db.order.count({
        where: { claimedAt: { gte: from.toJSDate(), lt: to.toJSDate() } },
      }),
      db.order.count({
        where: { paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
      }),
      db.inventoryItem.findMany({ where: { active: true } }),
      report(from.minus({ days: 6 }), to),
    ]);
  const statuses = Object.fromEntries(groups.map((g) => [g.status, g._count]));
  res.json({
    todaySales: today._sum.total || "0",
    todayOrders: today._count,
    activeOrders: ["RECEIVED", "WASHING", "DRYING", "FOLDING", "READY"].reduce(
      (s, k) => s + (statuses[k] || 0),
      0,
    ),
    statuses,
    claimedToday,
    unpaidOrders,
    lowInventory: inventory.filter((i) => i.stock.lte(i.lowStockThreshold))
      .length,
    trend: week.trend,
    timezone: cfg.timezone,
  });
});
