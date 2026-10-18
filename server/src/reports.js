import { Router } from "express";
import { DateTime } from "luxon";
import { db, D, audit, fail } from "./db.js";
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
function customRange(fromDate, toDate, zone) {
  const from = DateTime.fromISO(fromDate, { zone }).startOf("day"),
    inclusiveTo = DateTime.fromISO(toDate, { zone }).startOf("day");
  if (!from.isValid || !inclusiveTo.isValid) fail(400, "Invalid custom report range");
  if (inclusiveTo < from) fail(400, "Custom range end date must be on or after the start date");
  return { from, to: inclusiveTo.plus({ days: 1 }) };
}
async function report(from, to) {
  const date = { gte: from.toJSDate(), lt: to.toJSDate() };
  const [orders, payments, expenses, completed] = await Promise.all([
    db.order.findMany({
      where: { createdAt: date, status: { not: "CANCELLED" }, deletedAt: null },
      include: { items: true, user: { select: { name: true, id: true } } },
    }),
    db.payment.findMany({ where: { createdAt: date, order: { deletedAt: null } } }),
    db.expense.findMany({
      where: {
        date: {
          gte: new Date(from.toISODate() + "T00:00:00Z"),
          lt: new Date(to.toISODate() + "T00:00:00Z"),
        },
      },
    }),
    db.orderStatusHistory.findMany({
      where: { newStatus: "READY", createdAt: date, order: { deletedAt: null } },
      include: { order: { include: { items: true } } },
    }),
  ]);
  const services = {},
    staff = {},
    trend = {};
  let cursor = from.startOf("day");
  while (cursor < to) {
    const key = cursor.toISODate();
    trend[key] = { date: key, sales: new D(0), orders: 0 };
    cursor = cursor.plus({ days: 1 });
  }
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
  for (const event of completed)
    for (const item of event.order.items) {
      if (item.unit === "KG") kg = kg.add(item.actualQuantity);
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
      .enum(["Daily", "Weekly", "Monthly", "Yearly", "Custom"])
      .parse(req.query.period || "Daily"),
    cfg = await business();
  let from, to, date, customFrom, customTo;
  if (period === "Custom") {
    customFrom = z.iso.date().parse(req.query.from);
    customTo = z.iso.date().parse(req.query.to);
    ({ from, to } = customRange(customFrom, customTo, cfg.timezone));
  } else {
    date = z.iso
      .date()
      .parse(req.query.date || DateTime.now().setZone(cfg.timezone).toISODate());
    ({ from, to } = periodRange(period, date, cfg.timezone));
  }
  const data = await report(from, to);
  await audit(db, req.user.id, "REPORT_VIEWED", "Report", undefined, {
    period,
    ...(date ? { date } : { from: customFrom, to: customTo }),
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
    now = DateTime.now().setZone(cfg.timezone),
    currentDate = now.toISODate(),
    hasRange = req.query.from != null || req.query.to != null;

  let selectedFrom, selectedTo, from, to, selectedDate;
  if (hasRange) {
    selectedFrom = z.iso.date().parse(req.query.from);
    selectedTo = z.iso.date().parse(req.query.to);
    ({ from, to } = customRange(selectedFrom, selectedTo, cfg.timezone));
  } else {
    selectedDate = z.iso.date().parse(req.query.date || currentDate);
    from = DateTime.fromISO(selectedDate, { zone: cfg.timezone }).startOf("day");
    to = from.plus({ days: 1 });
    selectedFrom = selectedDate;
    selectedTo = selectedDate;
  }

  if (from > now.startOf("day") || to > now.startOf("day").plus({ days: 1 }))
    fail(400, "Dashboard date range cannot include a future date");

  const selectedRange = { gte: from.toJSDate(), lt: to.toJSDate() },
    staff = req.user.role === "LAUNDRY_STAFF",
    isToday = !hasRange && selectedDate === currentDate,
    currentAdminOperations = req.user.role === "ADMIN" && isToday,
    statusWhere = { deletedAt: null, ...(currentAdminOperations ? {} : { createdAt: selectedRange }) },
    unpaidWhere = {
      deletedAt: null,
      paymentStatus: "UNPAID",
      status: { not: "CANCELLED" },
      ...(currentAdminOperations ? {} : { createdAt: selectedRange }),
    },
    trendFrom =
      req.user.role === "ADMIN" && !hasRange ? from.minus({ days: 6 }) : from;

  const [
    selected,
    groups,
    claimedSelected,
    currentUnpaid,
    inventory,
    trendData,
    cohortOrders,
  ] = await Promise.all([
    db.order.aggregate({
      where: {
        createdAt: selectedRange,
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
      _sum: { total: true },
      _count: true,
    }),
    currentAdminOperations
      ? db.order.groupBy({ by: ["status"], where: statusWhere, _count: true })
      : Promise.resolve([]),
    db.order.count({ where: { claimedAt: selectedRange, deletedAt: null } }),
    currentAdminOperations
      ? db.order.count({ where: unpaidWhere })
      : Promise.resolve(0),
    req.user.role === "ADMIN"
      ? db.inventoryItem.findMany({ where: { active: true } })
      : Promise.resolve([]),
    report(trendFrom, to),
    currentAdminOperations
      ? Promise.resolve([])
      : db.order.findMany({
          where: { createdAt: selectedRange, deletedAt: null },
          select: { id: true },
        }),
  ]);

  let statuses = Object.fromEntries(groups.map((group) => [group.status, group._count])),
    unpaidOrders = currentUnpaid;

  if (!currentAdminOperations && cohortOrders.length) {
    const ids = cohortOrders.map((order) => order.id),
      [history, payments] = await Promise.all([
        db.orderStatusHistory.findMany({
          where: {
            orderId: { in: ids },
            createdAt: { lt: to.toJSDate() },
          },
          orderBy: [{ orderId: "asc" }, { createdAt: "asc" }],
          select: { orderId: true, newStatus: true },
        }),
        db.payment.findMany({
          where: {
            orderId: { in: ids },
            createdAt: { lt: to.toJSDate() },
          },
          select: { orderId: true },
        }),
      ]);

    const lastStatus = new Map();
    for (const event of history) lastStatus.set(event.orderId, event.newStatus);

    statuses = {};
    for (const order of cohortOrders) {
      const status = lastStatus.get(order.id) || "RECEIVED";
      statuses[status] = (statuses[status] || 0) + 1;
    }

    const paid = new Set(payments.map((payment) => payment.orderId));
    unpaidOrders = cohortOrders.filter((order) => {
      const status = lastStatus.get(order.id) || "RECEIVED";
      return status !== "CANCELLED" && !paid.has(order.id);
    }).length;
  }

  res.json({
    todaySales: selected._sum.total || "0",
    todayOrders: selected._count,
    activeOrders: ["RECEIVED", "WASHING", "DRYING", "FOLDING"].reduce(
      (sum, status) => sum + (statuses[status] || 0),
      0,
    ),
    statuses,
    claimedToday: claimedSelected,
    unpaidOrders,
    lowInventory:
      req.user.role === "ADMIN"
        ? inventory.filter((item) => item.stock.lte(item.lowStockThreshold)).length
        : null,
    trend: trendData.trend,
    dashboardScope: hasRange
      ? "CUSTOM_RANGE"
      : isToday
        ? staff
          ? "TODAY"
          : "BUSINESS"
        : "BACKDATE",
    viewDate: selectedDate || null,
    from: selectedFrom,
    to: selectedTo,
    isRange: hasRange,
    isToday,
    timezone: cfg.timezone,
  });
});

