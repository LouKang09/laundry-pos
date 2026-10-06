const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const peso = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value || 0),
  );

export function reportQuery({ period, date, from, to }) {
  if (period === "Custom") {
    if (!from || !to) throw new Error("Choose both custom range dates");
    return `/reports?period=Custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }
  if (!date) throw new Error("Choose a report date");
  return `/reports?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
}

function displayDate(value, zone) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    timeZone: zone || "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function rows(items, cells) {
  if (!items?.length)
    return `<tr><td colspan="${cells.length}">No records in this period.</td></tr>`;
  return items
    .map(
      (item) =>
        `<tr>${cells.map((cell) => `<td>${esc(cell(item))}</td>`).join("")}</tr>`,
    )
    .join("");
}

export async function printReport(api, filters, businessName) {
  const popup = window.open("", "_blank", "width=980,height=760");
  if (!popup) throw new Error("Allow pop-ups to print the report");
  popup.document.write(
    "<!doctype html><title>Preparing report…</title><p style='font-family:system-ui;padding:24px'>Preparing report…</p>",
  );
  try {
    const data = await api(reportQuery(filters));
    const inclusiveTo = new Date(new Date(data.to).getTime() - 1);
    const endLabel = inclusiveTo.toLocaleDateString("en-PH", {
      timeZone: data.timezone || "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const title = `${data.period} Report`;
    popup.document.open();
    popup.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#172033;margin:0;padding:28px;font-size:12px}
  header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #172033;padding-bottom:14px;margin-bottom:18px}
  h1,h2,p{margin:0} h1{font-size:24px} h2{font-size:15px;margin:22px 0 8px}.muted{color:#657087}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.card{border:1px solid #d8dde7;border-radius:8px;padding:11px}.card span{display:block;color:#657087}.card strong{font-size:18px;display:block;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #d8dde7;padding:7px;text-align:left;vertical-align:top}th{background:#f4f6f9}footer{margin-top:22px;border-top:1px solid #d8dde7;padding-top:10px;color:#657087}@page{size:auto;margin:14mm}@media print{body{padding:0}.no-print{display:none}}
</style></head><body>
<header><div><h1>${esc(businessName || "Laundry POS")}</h1><p class="muted">${esc(title)}</p></div><div><strong>${esc(displayDate(data.from, data.timezone))} – ${esc(endLabel)}</strong><p class="muted">${esc(data.timezone)}</p></div></header>
<div class="summary">
  <div class="card"><span>Gross sales</span><strong>${esc(peso(data.grossSales))}</strong></div>
  <div class="card"><span>Orders</span><strong>${esc(data.orders)}</strong></div>
  <div class="card"><span>Payments collected</span><strong>${esc(peso(data.paymentsReceived))}</strong></div>
  <div class="card"><span>Kilograms processed</span><strong>${esc(data.kilograms)}</strong></div>
  <div class="card"><span>Pieces processed</span><strong>${esc(data.pieces)}</strong></div>
  <div class="card"><span>Expenses</span><strong>${esc(peso(data.expenses))}</strong></div>
  <div class="card"><span>Estimated profit</span><strong>${esc(peso(data.estimatedProfit))}</strong></div>
</div>
<h2>Payments</h2><table><thead><tr><th>Method</th><th>Amount</th></tr></thead><tbody>${rows(data.paymentMethods, [(p) => p.method, (p) => peso(p.amount)])}</tbody></table>
<h2>Services sold</h2><table><thead><tr><th>Service</th><th>Unit</th><th>Actual</th><th>Billable</th><th>Sales</th></tr></thead><tbody>${rows(data.services, [(s) => s.name, (s) => s.unit, (s) => s.actual, (s) => s.billable, (s) => peso(s.sales)])}</tbody></table>
<h2>Staff performance</h2><table><thead><tr><th>Staff</th><th>Orders created</th><th>Sales</th></tr></thead><tbody>${rows(data.staff, [(s) => s.name, (s) => s.orders, (s) => peso(s.sales)])}</tbody></table>
<footer>Generated ${esc(new Date().toLocaleString("en-PH"))}. Sales exclude cancelled orders. Estimated profit = sales − recorded expenses.</footer>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script>
</body></html>`);
    popup.document.close();
    return data;
  } catch (error) {
    popup.close();
    throw error;
  }
}
