import React, { useState } from "react";
import { api } from "./api";
import { downloadCustomerActivity } from "./pdf-export";
import { useData, ErrorBox, Loading, Empty, Table, cash, date } from "./ui";

export const businessToday = () => new Date().toLocaleDateString("en-CA", {timeZone: window.businessZone || "Asia/Manila"});
export function ActivityFilters({period, setPeriod, day, setDay, from, setFrom, to, setTo}) {
  return <div className="filters" style={{display:"flex", flexWrap:"wrap", gap:10, alignItems:"center"}}>
    <select aria-label="Activity period" value={period} onChange={e=>setPeriod(e.target.value)}>
      {["Daily","Weekly","Monthly","Yearly","Custom"].map(p=><option key={p} value={p}>{p==="Custom"?"Custom range":p}</option>)}
    </select>
    {period==="Custom" ? <>
      <input aria-label="From" type="date" value={from} onChange={e=>{setFrom(e.target.value);if(e.target.value>to)setTo(e.target.value)}} />
      <input aria-label="To" type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/>
    </> : <input aria-label="Activity date" type="date" value={day} onChange={e=>setDay(e.target.value)}/>}
  </div>;
}
export function activityQuery({period,day,from,to}) {
  const params = new URLSearchParams({period});
  if(period==="Custom") { params.set("from",from); params.set("to",to); }
  else params.set("date",day);
  return "/reports/customer-activity?"+params;
}
export function CustomerActivity({compact=false, shopName="Laundry POS"}) {
  const [period,setPeriod]=useState("Daily");
  const [day,setDay]=useState(businessToday());
  const [from,setFrom]=useState(businessToday());
  const [to,setTo]=useState(businessToday());
  const [category,setCategory]=useState("ALL");
  const [page,setPage]=useState(1);
  const {data,error,loading}=useData(activityQuery({period,day,from,to}));
  const rows=(data?.rows||[]).filter(r=>category==="ALL"||r.category===category);
  const visible=rows.slice((page-1)*10,page*10);
  const count=data?.counts;
  return <section className="panel" style={{marginTop:16}}>
    <div className="section-title"><div><h2>Customer activity</h2><p className="muted">Order, payment and claim dates are tracked separately. Unclaimed and unpaid reflect current statuses for orders received in the selected period.</p></div></div>
    <ActivityFilters {...{period,setPeriod,day,setDay,from,setFrom,to,setTo}}/>
    <ErrorBox message={error}/>
    {loading&&!data?<Loading/>:data&&<>
      <div className="report-stats">
        {[["Orders",count.orders],["Paid",count.paid],["Claimed",count.claimed],["Unclaimed",count.unclaimed],["Unpaid",count.unpaid],["Payments received",cash(count.paymentsAmount)]].map(([k,v])=><div className="stat" key={k}><span>{k}</span><h2>{v}</h2></div>)}
      </div>
      <div style={{marginTop:16}}>
        <h3>Payment method breakdown</h3>
        <p className="muted small">Number of completed payments and amount received in the selected period. Bank transfers are counted under their recorded provider.</p>
        <Table headers={["Payment method","Payments (qty)","Amount collected"]}>
          {(data.paymentMethods || []).map(p=><tr key={p.method}><td>{p.method==="OTHER_BANKS"?"Other banks":p.method==="GOTYME"?"GoTyme":p.method==="MARIBANK"?"MariBank":p.method==="GCASH"?"GCash":p.method==="MAYA"?"Maya":p.method==="CASH"?"Cash":p.method}</td><td>{p.count}</td><td>{cash(p.amount)}</td></tr>)}
          <tr><td><strong>Total</strong></td><td><strong>{count.paid}</strong></td><td><strong>{cash(count.paymentsAmount)}</strong></td></tr>
        </Table>
      </div>
      {!compact&&<><div className="filters" style={{marginTop:16}}>
        <select aria-label="Customer activity type" value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}}>
          {["ALL","ORDERED","PAID","CLAIMED","UNCLAIMED","UNPAID"].map(s=><option value={s} key={s}>{s==="ALL"?"All activity":s}</option>)}
        </select>
        <button className="secondary" type="button" onClick={()=>downloadCustomerActivity(data,shopName,category)}>Download Report</button>
      </div>
      {rows.length?<><Table headers={["Customer","Order #","Activity","Status","Payment","Date","Amount"]}>{visible.map((r,i)=><tr key={r.category+"-"+r.id+"-"+i}><td>{r.customerName}</td><td>{r.orderNumber}</td><td>{r.category}</td><td>{r.status}</td><td>{r.paymentStatus}</td><td>{date(r.occurredAt)}</td><td>{cash(r.amount)}</td></tr>)}</Table><div className="filters"><span>{rows.length} matching records · Page {page} of {Math.ceil(rows.length/10)}</span><button className="secondary" disabled={page===1} onClick={()=>setPage(v=>v-1)}>Previous</button><button className="secondary" disabled={page*10>=rows.length} onClick={()=>setPage(v=>v+1)}>Next</button></div></>:<Empty>No activity matches the selected filters.</Empty>}</>}
    </>}
  </section>;
}
