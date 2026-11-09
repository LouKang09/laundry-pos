// Export the exact date-filtered cash-flow data supplied by /admin/cash-flow.
// No backend mutation or payment recalculation occurs during a download.
import { downloadPdf } from "./pdf-export.js";

const cashHeaders = [
  "Date", "Petty Cash", "Daily Income", "Cash", "Cash Txn Ct",
  "GCash", "GCash Txns", "Other Banks", "Total Txns",
  "Expenses", "Expected Total", "Actual", "Variance",
];
const bankHeaders = [
  "Date", "Bank Balance", "Credit to Bank",
  "Debit from Bank", "Running Bank Total", "Note",
];

const amount = value => value == null ? "-" : Number(value).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const total = (rows, key) => rows.reduce((sum, row) =>
  sum + Math.round(Number(row[key] || 0) * 100), 0) / 100;

export function buildCashFlowPdfSections(data) {
  const rows = data?.rows || [];
  if (!rows.length) throw new Error("There are no cash-flow records to download.");
  const sums = {
    income: total(rows,"dailyIncome"), cash: total(rows,"cash"),
    gcash: total(rows,"gcash"), expenses: total(rows,"expenses"),
  };
  return [
    {
      heading: "Summary for selected dates",
      items: [
        ["Daily income", "PHP " + amount(sums.income)],
        ["Cash collections", "PHP " + amount(sums.cash)],
        ["GCash collections", "PHP " + amount(sums.gcash)],
        ["Expenses", "PHP " + amount(sums.expenses)],
      ],
    },
    {
      heading: "Cash Flow Ledger",
      note: "All monetary values in Philippine pesos (PHP). Expected Total = Petty Cash + Cash - Expenses. Variance = Actual - Expected Total.",
      headers: cashHeaders,
      widths: [0.096,0.086,0.092,0.076,0.064,0.075,0.063,0.087,0.062,0.078,0.091,0.067,0.063],
      fontSize: 9.5, headerFontSize: 9.5,
      cellPadding: 4, lineHeight: 12.5, minRowHeight: 26,
      rows: [
        ...rows.map(row => [
          row.date, amount(row.pettyCash), amount(row.dailyIncome),
          amount(row.cash), String(row.cashTxns ?? 0),
          amount(row.gcash), String(row.gcashTxns ?? 0),
          amount(row.other), String(row.transactionCount ?? 0),
          amount(row.expenses), amount(row.expectedTotal),
          amount(row.actual), amount(row.variance),
        ]),
        ["TOTAL", "-", amount(sums.income), amount(sums.cash),
          "-", amount(sums.gcash), "-", "-", "-",
          amount(sums.expenses), "-", "-", "-"],
      ],
    },
    {
      heading: "Bank Ledger",
      note: "Bank balances and movements share the selected date range.",
      headers: bankHeaders,
      widths: [0.13,0.15,0.15,0.15,0.16,0.26],
      fontSize: 10.5, cellPadding: 7,
      rows: rows.map(row => [
        row.date, amount(row.bankPetty), amount(row.creditToBank),
        amount(row.debitFromBank), amount(row.runningBankTotal), row.note || "-",
      ]),
    },
  ];
}

export function downloadCashFlowPdf(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.from || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data?.to || ""))
    throw new Error("The selected report dates are invalid.");
  downloadPdf({
    pageSize: "A3",
    title: "Laundry POS - Cash Flow Report",
    subtitle: data.from + " to " + data.to + " | Financial reconciliation | PHP",
    filename: "laundry-cash-flow-" + data.from + "-to-" + data.to + ".pdf",
    sections: buildCashFlowPdfSections(data),
  });
}
