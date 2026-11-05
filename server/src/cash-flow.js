import { Router } from "express";
import { DateTime } from "luxon";
import { db, atomic, audit, fail } from "./db.js";
import { admin } from "./auth.js";
import { business } from "./orders.js";
import { calculateCashFlow } from "./cash-flow-math.js";

export const cashFlow = Router();
cashFlow.use(admin);

const dateString = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, "Enter a valid date.");
  const date = DateTime.fromISO(value, { zone: "utc" });
  if (!date.isValid || date.toISODate() !== value) fail(400, "Enter a valid date.");
  return value;
};
const utcDate = (value) => new Date(value + "T00:00:00.000Z");
const money = (value, nullable = false) => {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value === "boolean" || value === null || value === undefined || value === "") fail(400, "Enter a valid amount.");
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000000 || Math.round(number * 100) / 100 !== number)
    fail(400, "Enter a non-negative amount with at most two decimal places.");
  return number;
};
const defaults = (value) => ({
  defaultPettyCash: Number(value?.defaultPettyCash || 0),
  defaultBankPetty: Number(value?.defaultBankPetty || 0),
});
const entryResponse = (date, entry) => ({
  date,
  pettyCashOverride: entry?.pettyCashOverride == null ? null : Number(entry.pettyCashOverride),
  bankPettyOverride: entry?.bankPettyOverride == null ? null : Number(entry.bankPettyOverride),
  actual: entry?.actual == null ? null : Number(entry.actual),
  creditToBank: Number(entry?.creditToBank || 0),
  debitFromBank: Number(entry?.debitFromBank || 0),
  note: entry?.note || "",
});
cashFlow.get("/", async (req, res) => {
  const cfg = await business();
  const zone = cfg.timezone || "Asia/Manila";
  const today = DateTime.now().setZone(zone).toISODate();
  const from = dateString(String(req.query.from || today.slice(0, 8) + "01"));
  const to = dateString(String(req.query.to || today));
  if (from > to) fail(400, "From date cannot be after To date.");
  if (DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days > 3660)
    fail(400, "Choose a range of 10 years or less.");
  const start = DateTime.fromISO(from, { zone }).startOf("day").toJSDate();
  const end = DateTime.fromISO(to, { zone }).plus({ days: 1 }).startOf("day").toJSDate();
  const [stored, payments, expenses, entries] = await Promise.all([
    db.setting.findUnique({ where: { key: "cashFlow" } }),
    db.payment.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        order: { paymentStatus: "PAID", status: { not: "CANCELLED" }, deletedAt: null },
      },
      select: { createdAt: true, amount: true, method: true },
    }),
    db.expense.findMany({
      where: { date: { gte: utcDate(from), lte: utcDate(to) } },
      select: { date: true, amount: true },
    }),
    db.cashFlowEntry.findMany({
      where: { date: { lte: utcDate(to) } },
      orderBy: { date: "asc" },
    }),
  ]);
  const settings = defaults(stored?.value);
  res.json({
    from, to, ...settings,
    rows: calculateCashFlow({ from, to, zone, payments, expenses, entries, ...settings }),
  });
});

cashFlow.get("/entry/:date", async (req, res) => {
  const date = dateString(req.params.date);
  const entry = await db.cashFlowEntry.findUnique({ where: { date: utcDate(date) } });
  res.json(entryResponse(date, entry));
});

cashFlow.put("/settings", async (req, res) => {
  const settings = {
    defaultPettyCash: money(req.body?.defaultPettyCash),
    defaultBankPetty: money(req.body?.defaultBankPetty),
  };
  await atomic(async (tx) => {
    const previous = await tx.setting.findUnique({ where: { key: "cashFlow" } });
    await tx.setting.upsert({
      where: { key: "cashFlow" }, create: { key: "cashFlow", value: settings },
      update: { value: settings },
    });
    await audit(tx, req.user.id, "CASH_FLOW_SETTINGS_UPDATED", "CashFlow", "settings", {
      before: defaults(previous?.value), after: settings,
    });
  });
  res.json(settings);
});

cashFlow.put("/entry/:date", async (req, res) => {
  const date = dateString(req.params.date);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (note.length > 500) fail(400, "Note must be 500 characters or fewer.");
  const values = {
    pettyCashOverride: money(req.body?.pettyCashOverride, true),
    bankPettyOverride: money(req.body?.bankPettyOverride, true),
    actual: money(req.body?.actual, true),
    creditToBank: money(req.body?.creditToBank ?? 0),
    debitFromBank: money(req.body?.debitFromBank ?? 0),
    note,
  };
  const entry = await atomic(async (tx) => {
    const dateValue = utcDate(date);
    const previous = await tx.cashFlowEntry.findUnique({ where: { date: dateValue } });
    const saved = await tx.cashFlowEntry.upsert({
      where: { date: dateValue },
      create: { date: dateValue, ...values },
      update: values,
    });
    await audit(tx, req.user.id, "CASH_FLOW_ENTRY_SAVED", "CashFlowEntry", date, {
      before: entryResponse(date, previous), after: entryResponse(date, saved),
    });
    return saved;
  });
  res.json(entryResponse(date, entry));
});
