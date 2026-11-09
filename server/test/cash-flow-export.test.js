import test from "node:test";
import assert from "node:assert/strict";
import { buildCashFlowPdfSections } from "../../client/src/cash-flow-download.js";

test("Cash Flow PDF exports both ledgers with totals for the chosen dates", () => {
  const data = {from:"2026-11-01",to:"2026-11-02",rows:[
    {date:"2026-11-01",pettyCash:100,dailyIncome:125.10,cash:95.10,cashTxns:2,gcash:30,gcashTxns:1,other:0,transactionCount:3,expenses:15.05,expectedTotal:180.05,actual:180.05,variance:0,bankPetty:250,creditToBank:50,debitFromBank:0,runningBankTotal:300,note:"First day"},
    {date:"2026-11-02",pettyCash:180.05,dailyIncome:40.20,cash:10.20,cashTxns:1,gcash:30,gcashTxns:1,other:0,transactionCount:2,expenses:3.10,expectedTotal:187.15,actual:null,variance:null,bankPetty:300,creditToBank:0,debitFromBank:20,runningBankTotal:280,note:"Second day"},
  ]};
  const [summary,cashLedger,bankLedger] = buildCashFlowPdfSections(data);
  assert.equal(summary.items[0][1],"PHP 165.30");
  assert.equal(summary.items[1][1],"PHP 105.30");
  assert.equal(summary.items[2][1],"PHP 60.00");
  assert.equal(summary.items[3][1],"PHP 18.15");
  assert.equal(cashLedger.headers.length,13);
  assert.equal(cashLedger.rows.length,3);
  assert.equal(cashLedger.rows[2][0],"TOTAL");
  assert.equal(cashLedger.rows[2][2],"165.30");
  assert.equal(cashLedger.rows[2][3],"105.30");
  assert.equal(cashLedger.rows[2][5],"60.00");
  assert.equal(cashLedger.rows[2][9],"18.15");
  assert.equal(cashLedger.rows[1][11],"-"); // Missing cash count must not become zero.
  assert.equal(bankLedger.headers.length,6);
  assert.equal(bankLedger.rows.length,2);
  assert.equal(bankLedger.rows[0][5],"First day");
  assert.equal(bankLedger.rows[1][4],"280.00");
});

test("Cash Flow PDF rejects an empty date range rather than exporting misleading totals", () => {
  assert.throws(() => buildCashFlowPdfSections({rows:[]}), /no cash-flow records/i);
});
