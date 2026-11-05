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
  assert.equal(rows[0].expectedTotal, 274.5);
  assert.equal(rows[0].variance, 80);
  assert.equal(rows[0].bankPetty, 1100);
  assert.equal(rows[0].runningBankTotal, 1250);
  assert.equal(rows[1].dailyIncome, 170);
  assert.equal(rows[1].gcashTxns, 1);
  assert.equal(rows[1].otherTxns, 1);
  assert.equal(rows[1].bankPetty, 400);
  assert.equal(rows[1].runningBankTotal, 410);
});
