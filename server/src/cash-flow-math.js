// A pure, cent-based reconciliation so reports do not accumulate float errors.
// Payment.createdAt is the actual settlement date; an order's createdAt is not.
const cents = (amount) => Math.round(Number(amount || 0) * 100);
const pesos = (value) => value / 100;
const ymd = (date) => date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);

export function calculateCashFlow({ from, to, zone, payments, expenses, entries, defaultPettyCash = 0, defaultBankPetty = 0 }) {
  const sales = new Map();
  const expenseByDay = new Map();
  const entryByDay = new Map();
  for (const payment of payments) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(payment.createdAt);
    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = p.year + "-" + p.month + "-" + p.day;
    const row = sales.get(date) || { income: 0, cash: 0, gcash: 0, other: 0, cashTxns: 0, gcashTxns: 0, otherTxns: 0, count: 0 };
    const amount = cents(payment.amount);
    row.income += amount;
    row.count++;
    if (payment.method === "CASH") { row.cash += amount; row.cashTxns++; }
    else if (payment.method === "GCASH") { row.gcash += amount; row.gcashTxns++; }
    else { row.other += amount; row.otherTxns++; }
    sales.set(date, row);
  }
  for (const expense of expenses) {
    const date = ymd(expense.date);
    expenseByDay.set(date, (expenseByDay.get(date) || 0) + cents(expense.amount));
  }
  for (const entry of entries) entryByDay.set(ymd(entry.date), entry);
  let bankBalance = cents(defaultBankPetty);
  // Consume all older bank adjustments so a mid-month filter never resets the balance.
  for (const entry of entries) {
    if (ymd(entry.date) >= from) break;
    if (entry.bankPettyOverride != null) bankBalance = cents(entry.bankPettyOverride);
    bankBalance += cents(entry.creditToBank) - cents(entry.debitFromBank);
  }
  const rows = [];
  for (let time = Date.parse(from + "T00:00:00Z"), end = Date.parse(to + "T00:00:00Z"); time <= end; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const s = sales.get(date) || { income: 0, cash: 0, gcash: 0, other: 0, cashTxns: 0, gcashTxns: 0, otherTxns: 0, count: 0 };
    const e = entryByDay.get(date);
    // An explicit daily override always wins. Otherwise use the Actual from the
    // preceding calendar day, falling back to the configured default when uncounted.
    const pettyOverride = e?.pettyCashOverride == null ? null : cents(e.pettyCashOverride);
    const previousDate = new Date(time - 86400000).toISOString().slice(0, 10);
    const previousActual = entryByDay.get(previousDate)?.actual;
    const pettySource = pettyOverride != null ? "override"
      : previousActual != null ? "previous_actual" : "default";
    const petty = pettyOverride != null ? pettyOverride
      : previousActual != null ? cents(previousActual) : cents(defaultPettyCash);
    const expensesTotal = expenseByDay.get(date) || 0;
    const expected = petty + s.cash - expensesTotal;
    const actual = e?.actual == null ? null : cents(e.actual);
    const bankOpening = e?.bankPettyOverride == null ? bankBalance : cents(e.bankPettyOverride);
    const credit = cents(e?.creditToBank);
    const debit = cents(e?.debitFromBank);
    bankBalance = bankOpening + credit - debit;
    rows.push({
      date,
      pettyCash: pesos(petty),
      pettyCashSource: pettySource,
      pettyCashPreviousDate: pettySource === "previous_actual" ? previousDate : null,
      pettyCashOverride: e?.pettyCashOverride == null ? null : Number(e.pettyCashOverride),
      dailyIncome: pesos(s.income),
      expenses: pesos(expensesTotal),
      expectedTotal: pesos(expected),
      actual: actual == null ? null : pesos(actual),
      variance: actual == null ? null : pesos(actual - expected),
      cash: pesos(s.cash), gcash: pesos(s.gcash), other: pesos(s.other),
      cashTxns: s.cashTxns, gcashTxns: s.gcashTxns, otherTxns: s.otherTxns,
      cashPlusGcash: pesos(s.cash + s.gcash), transactionCount: s.count,
      bankPetty: pesos(bankOpening),
      bankPettyOverride: e?.bankPettyOverride == null ? null : Number(e.bankPettyOverride),
      creditToBank: pesos(credit), debitFromBank: pesos(debit),
      runningBankTotal: pesos(bankBalance), note: e?.note || ""
    });
  }
  return rows;
}
