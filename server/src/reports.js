import { Router } from "express";
import { DateTime } from "luxon";
import { db, D, audit, fail } from "./db.js";
import { z } from "./validation.js";
import { admin } from "./auth.js";
import { business } from "./orders.js";
export const reporting = Router();
const sum = (rows, key) => rows.reduce((s, r) => s.add(r[key]), new D(0));

const PAYMENT_CHANNELS = ["CASH", "GCASH", "MAYA", "MARIBANK", "GOTYME", "BPI", "OTHER_BANKS"];
function channelFor(payment) {
  if (payment.method === "CASH") return "CASH";
  if (payment.method === "GCASH") return "GCASH";
  const provider = String(payment.provider || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PAYMENT_CHANNELS.includes(provider) && provider !== "CASH" && provider !== "GCASH"
    ? provider : "OTHER_BANKS";
}
function paymentBreakdown(payments) {
  const totals = new Map(PAYMENT_CHANNELS.map(method => [method, { method, count: 0, amount: new D(0) }]));
  for (const payment of payments) {
    const row = totals.get(channelFor(payment));
    row.count++;
    row.amount = row.amount.add(payment.amount);
  }
  return Array.from(totals.values(), p => ({ method: p.method, count: p.count, amount: p.amount.toFixed(2) }));
}

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
      where: { newStatus: "READY", oldStatus: { not: "CLAIMED" }, createdAt: date, order: { deletedAt: null } },
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
    paymentMethods: paymentBreakdown(payments),
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



/**
 * Customer activity ledger. Each category uses the date the action actually
 * occurred, rather than the date the order was first received.
 * Unclaimed/unpaid are current snapshots of orders received in the period.
 */
reporting.get("/reports/customer-activity", admin, async (req, res) => {
  const cfg = await business();
  const period = z.enum(["Daily", "Weekly", "Monthly", "Yearly", "Custom"])
    .parse(req.query.period || "Daily");
  let from, to;
  if (period === "Custom") {
    ({ from, to } = customRange(
      z.iso.date().parse(req.query.from),
      z.iso.date().parse(req.query.to),
      cfg.timezone,
    ));
  } else {
    const day = z.iso.date().parse(req.query.date || DateTime.now().setZone(cfg.timezone).toISODate());
    ({ from, to } = periodRange(period, day, cfg.timezone));
  }
  const range = { gte: from.toJSDate(), lt: to.toJSDate() };
  const base = { deletedAt: null, status: { not: "CANCELLED" } };
  const [received, paid, claimed, unclaimed, unpaid] = await Promise.all([
    db.order.findMany({ where: { ...base, createdAt: range }, select: {
      id: true, orderNumber: true, customerName: true, total: true, status: true,
      paymentStatus: true, createdAt: true, claimedAt: true,
    }, orderBy: { createdAt: "desc" } }),
    db.payment.findMany({ where: { createdAt: range, order: base }, select: {
      id: true, amount: true, method: true, provider: true, createdAt: true, order: { select: {
        orderNumber: true, customerName: true, status: true, paymentStatus: true,
      } },
    }, orderBy: { createdAt: "desc" } }),
    db.order.findMany({ where: { claimedAt: range, deletedAt: null, status: "CLAIMED" },
      select: { id: true, orderNumber: true, customerName: true, total: true,
        status: true, paymentStatus: true, claimedAt: true },
      orderBy: { claimedAt: "desc" } }),
    db.order.findMany({ where: { ...base, createdAt: range, status: { notIn: ["CLAIMED", "CANCELLED"] } },
      select: { id: true, orderNumber: true, customerName: true, total: true,
        status: true, paymentStatus: true, createdAt: true },
      orderBy: { createdAt: "desc" } }),
    db.order.findMany({ where: { ...base, createdAt: range, paymentStatus: "UNPAID" },
      select: { id: true, orderNumber: true, customerName: true, total: true,
        status: true, paymentStatus: true, createdAt: true },
      orderBy: { createdAt: "desc" } }),
  ]);
  const rows = [
    ...received.map(o => ({ ...o, category: "ORDERED", occurredAt: o.createdAt, amount: o.total })),
    ...paid.map(p => ({ id: p.id, ...p.order, category: "PAID", occurredAt: p.createdAt, amount: p.amount })),
    ...claimed.map(o => ({ ...o, category: "CLAIMED", occurredAt: o.claimedAt, amount: o.total })),
    ...unclaimed.map(o => ({ ...o, category: "UNCLAIMED", occurredAt: o.createdAt, amount: o.total })),
    ...unpaid.map(o => ({ ...o, category: "UNPAID", occurredAt: o.createdAt, amount: o.total })),
  ];
  const counts = { orders: received.length, paid: paid.length, claimed: claimed.length,
    unclaimed: unclaimed.length, unpaid: unpaid.length,
    paymentsAmount: sum(paid, "amount").toFixed(2) };
  res.json({ from: from.toISO(), to: to.toISO(), timezone: cfg.timezone, counts,
    paymentMethods: paymentBreakdown(paid),
    rows: rows.sort((a,b) => new Date(b.occurredAt) - new Date(a.occurredAt)) });
});
