import test from "node:test";
import assert from "node:assert/strict";
import { calculateCashFlow } from "../src/cash-flow-math.js";

const day = (text) => new Date(text + "T00:00:00.000Z");
test("cash flow uses payment dates and excludes no-day transaction duplicates", () => {
  const rows = calculateCashFlow({
    from: "2026-11-01", to: "2026-11-02", zone: "Asia/Manila",
    defaultPettyCash: 100, defaultBankPetty: 500,
    payments: [
      { createdAt: new Date("2026-11-01T10:00:00Z"), amount: "220", method: "CASH" },
      { createdAt: new Date("2026-11-01T16:30:00Z"), amount: "80", method: "GCASH" },
      { createdAt: new Date("2026-11-02T11:00:00Z"), amount: "90", method: "OTHERS" },
    ],
    expenses: [{ date: day("2026-11-01"), amount: "45.50" }],
    entries: [
      { date: day("2026-10-31"), bankPettyOverride: 1000, creditToBank: 100, debitFromBank: 0 },
      { date: day("2026-11-01"), actual: 354.5, creditToBank: 200, debitFromBank: 50 },
      { date: day("2026-11-02"), pettyCashOverride: 150, bankPettyOverride: 400, creditToBank: 15, debitFromBank: 5 },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dailyIncome, 220); // 00:30 PH Nov 2 GCash shifts to next day
  assert.equal(rows[0].expenses, 45.5);
  assert.equal(rows[0].cashTxns, 1);
  assert.equal(rows[0].expectedTotal, 274.5);
  assert.equal(rows[0].variance, 80);
  assert.equal(rows[0].bankPetty, 1100);
  assert.equal(rows[0].runningBankTotal, 1250);
  assert.equal(rows[1].dailyIncome, 170);
  assert.equal(rows[1].cashTxns, 0);
  assert.equal(rows[1].expectedTotal, 150); // No cash sales: GCash and banks do not raise expected cash.
  assert.equal(rows[1].gcashTxns, 1);
  assert.equal(rows[1].otherTxns, 1);
  assert.equal(rows[1].bankPetty, 400);
  assert.equal(rows[1].runningBankTotal, 410);
});

test("expected cash only includes cash receipts even when digital payments occur the same day", () => {
  const rows = calculateCashFlow({
    from: "2026-11-03", to: "2026-11-03", zone: "Asia/Manila",
    defaultPettyCash: 100, defaultBankPetty: 0,
    payments: [
      { createdAt: new Date("2026-11-03T04:00:00Z"), amount: "35", method: "CASH" },
      { createdAt: new Date("2026-11-03T05:00:00Z"), amount: "20", method: "GCASH" },
      { createdAt: new Date("2026-11-03T06:00:00Z"), amount: "7.50", method: "OTHERS" },
    ],
    expenses: [{ date: day("2026-11-03"), amount: "15" }],
    entries: [{ date: day("2026-11-03"), actual: "120" }],
  });
  assert.equal(rows[0].dailyIncome, 62.5);
  assert.equal(rows[0].cash, 35);
  assert.equal(rows[0].cashTxns, 1);
  assert.equal(rows[0].transactionCount, 3);
  assert.equal(rows[0].expectedTotal, 120); // 100 petty + 35 cash - 15 expenses
  assert.equal(rows[0].variance, 0);
});

test("petty cash uses previous calendar day's Actual across date filters and preserves overrides", () => {
  const rows = calculateCashFlow({
    from: "2026-11-02", to: "2026-11-06", zone: "Asia/Manila",
    defaultPettyCash: 100, defaultBankPetty: 900,
    payments: [{ createdAt: new Date("2026-11-02T09:00:00Z"), amount: 15, method: "CASH" }],
    expenses: [{ date: day("2026-11-02"), amount: 2 }],
    entries: [
      { date: day("2026-11-01"), actual: 354.5, creditToBank: 30, debitFromBank: 0 },
      { date: day("2026-11-02"), actual: 0 },
      { date: day("2026-11-04"), pettyCashOverride: 40, actual: 45 },
      { date: day("2026-11-05"), pettyCashOverride: 60, actual: 0 },
    ],
  });
  assert.deepEqual(rows.map(r => r.pettyCash), [354.5, 0, 40, 60, 0]);
  assert.deepEqual(rows.map(r => r.pettyCashSource),
    ["previous_actual", "previous_actual", "override", "override", "previous_actual"]);
  assert.deepEqual(rows.map(r => r.pettyCashPreviousDate),
    ["2026-11-01", "2026-11-02", null, null, "2026-11-05"]);
  assert.equal(rows[0].expectedTotal, 367.5); // Previous Actual + today's cash - expenses
  assert.equal(rows[0].variance, -367.5); // Zero Actual is a counted amount
  assert.equal(rows[1].pettyCash, 0);
  assert.equal(rows[2].pettyCashOverride, 40);
  assert.equal(rows[3].pettyCashOverride, 60);
  assert.equal(rows[0].bankPetty, 930); // Pre-range bank movements still carry
  assert.equal(rows[0].runningBankTotal, 930);
});

test("petty cash falls back to default when yesterday has no Actual, not to an older actual", () => {
  const rows = calculateCashFlow({
    from: "2026-12-01", to: "2026-12-03", zone: "Asia/Manila",
    defaultPettyCash: 75, defaultBankPetty: 0,
    payments: [], expenses: [],
    entries: [
      { date: day("2026-11-29"), actual: 500 },
      { date: day("2026-12-02"), actual: 125 },
    ],
  });
  assert.deepEqual(rows.map(r => r.pettyCash), [75, 75, 125]);
  assert.deepEqual(rows.map(r => r.pettyCashSource), ["default", "default", "previous_actual"]);
  assert.equal(rows[2].pettyCashPreviousDate, "2026-12-02");
});
