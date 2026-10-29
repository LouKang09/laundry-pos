import React, {useMemo,useState} from "react";
import {useData,cash,Empty} from "./ui";

const SERIES=[
  {key:"sales",label:"Total Collected",color:"#2785e7"},
  {key:"cash",label:"Cash",color:"#ed5f83"},
  {key:"gcash",label:"GCash",color:"#e59a33"},
  {key:"other",label:"Other Digital",color:"#8c75e6"}
];
function hourLabel(hour){
  const n=Number(hour);
  return (n%12||12)+(n<12?" AM":" PM");
}
function shortDate(s){
  return new Date(s+"T12:00:00").toLocaleDateString("en-PH",{month:"short",day:"numeric"});
}
function peakLabel(peak){
  return peak?"Peak hour: "+hourLabel(peak.hour)+" · "+cash(peak.amount):"No collections in range";
}
function compact(n){
  const num=Number(n||0),abs=Math.abs(num);
  return abs>=1000000?"₱"+(num/1000000).toFixed(1)+"m":abs>=1000?"₱"+(num/1000).toFixed(1)+"k":"₱"+Math.round(num).toLocaleString("en-PH");
}

function TrendChart({data}){
  const [visible,setVisible]=useState(["sales","cash","gcash","other"]);
  const [focus,setFocus]=useState(null);
  const series=SERIES.filter(s=>visible.includes(s.key));
  const rows=data.timeline||[];
  // Keep short-range hourly plots readable on tablets/phones, and allow
  // all hours to show so collections outside normal store hours are not lost.
  const width=Math.max(800,rows.length*(data.grain==="hourly"?30:Math.max(15,Math.min(55,760/Math.max(1,rows.length)))));
  const height=324,left=64,right=30,top=28,bottom=62,pw=width-left-right,ph=height-top-bottom;
  const max=Math.max(1,...rows.flatMap(r=>series.map(s=>Number(r[s.key]||0))));
  const points=rows.map((row,i)=>({...row,x:left+(rows.length===1?pw/2:i*pw/(rows.length-1))}));
  const pointY=(v)=>top+ph-(Number(v||0)/max)*ph;
  const divisions=[0,0.25,0.5,0.75,1];
  const days=data.grain==="hourly"
    ? [...new Set(rows.map(row=>row.date))]
    : [];
  const groups=days.length?days.map(day=>points.filter(p=>p.date===day)):[points];
  const toggle=(key)=>{
    setVisible(current=>current.includes(key)
      ? (current.length===1?current:current.filter(x=>x!==key))
      : [...current,key]);
    setFocus(null);
  };
  const focused=focus&&series.some(s=>s.key===focus.key)?focus:null;
  return (
    <div className="laundry-trend">
      <div className="laundry-trend-legend" role="group" aria-label="Sales trend series visibility">
        {SERIES.map(s=><button type="button" key={s.key}
          style={{"--series-color":s.color}}
          className={"laundry-legend-pill "+(visible.includes(s.key)?"is-on":"is-off")}
          aria-pressed={visible.includes(s.key)}
          onClick={()=>toggle(s.key)}>
          <span className="laundry-legend-dot"/>{s.label}
        </button>)}
        <button type="button" className="laundry-legend-reset" disabled={visible.length===SERIES.length}
          onClick={()=>{setVisible(SERIES.map(s=>s.key));setFocus(null);}}>Show all</button>
      </div>
      <div className="laundry-trend-scroll">
        <svg viewBox={"0 0 "+width+" "+height} width={width} height={height}
          role="img" aria-label={data.grain==="hourly"?"Hourly payments trend broken down by Cash, GCash and Other Digital":"Daily payments trend broken down by Cash, GCash and Other Digital"}>
          {divisions.map(r=>{
            const y=pointY(max*r);
            return <g key={r}>
              <line x1={left} x2={width-right} y1={y} y2={y} stroke="#e5ecf2" strokeWidth="1"/>
              <text x={left-12} y={y+4} fill="#788697" fontSize="11" textAnchor="end">{compact(max*r)}</text>
            </g>;
          })}
          {days.length>1&&days.slice(1).map(day=>{
            const start=points.find(p=>p.date===day);
            return <line key={day} x1={start.x-15} x2={start.x-15} y1={top} y2={top+ph}
              stroke="#c5d7e3" strokeDasharray="4 5"/>;
          })}
          {focused&&<line x1={focused.x} x2={focused.x} y1={top} y2={top+ph}
            stroke="#8ba1b3" strokeWidth="1.2" strokeDasharray="4 4" pointerEvents="none"/>}
          {series.map(s=>groups.map((group,groupIndex)=>{
            const path=group.map((p,i)=>(i?"L":"M")+p.x+","+pointY(p[s.key])).join(" ");
            return <path key={s.key+"-"+groupIndex} d={path}
              fill="none" stroke={s.color} strokeWidth={s.key==="sales"?3:2.4}
              strokeLinejoin="round" strokeLinecap="round" pointerEvents="none"/>;
          }))}
          {rows.map((row,i)=>{
            const p=points[i];
            const showTick=data.grain==="hourly"
              ? (row.hour===0||row.hour===9||row.hour===12||row.hour===15||row.hour===18||row.hour===23)
              : i===0||i===rows.length-1||i%Math.max(1,Math.ceil(rows.length/11))===0;
            return showTick?<g key={row.date+"-"+(row.hour??"day")}>
              <line x1={p.x} x2={p.x} y1={top+ph} y2={top+ph+5} stroke="#9aabb5"/>
              <text x={p.x} y={height-37} textAnchor="middle" fill="#64788b" fontSize="11">
                {data.grain==="hourly"?hourLabel(row.hour):shortDate(row.date)}
              </text>
              {data.grain==="hourly"&&row.hour===0&&<text x={p.x+5} y={height-16} textAnchor="start" fill="#3b6079" fontSize="11" fontWeight="650">{shortDate(row.date)}</text>}
            </g>:null;
          })}
          {series.map(s=>points.map((p,i)=>{
            const y=pointY(p[s.key]),active=focused?.key===s.key&&focused?.i===i;
            return <g key={s.key+"-"+i}>
              <circle cx={p.x} cy={y} r={active?5.6:rows.length>75?2.1:3.25} fill={s.color} stroke="white" strokeWidth={active?2:0.8} pointerEvents="none"/>
              <circle cx={p.x} cy={y} r="11" fill="transparent" tabIndex={0}
                aria-label={s.label+" "+p.date+(p.hour!=null?" "+hourLabel(p.hour):"")+": "+cash(p[s.key])}
                onPointerEnter={()=>setFocus({...p,i,key:s.key,label:s.label,color:s.color})}
                onPointerDown={()=>setFocus({...p,i,key:s.key,label:s.label,color:s.color})}
                onFocus={()=>setFocus({...p,i,key:s.key,label:s.label,color:s.color})}/>
            </g>;
          }))}
        </svg>
      </div>
      <div className="laundry-trend-detail" role="status" aria-live="polite">
        {focused?<><span className="laundry-legend-dot" style={{background:focused.color}}/>
          <strong>{focused.label}: {cash(focused[focused.key])}</strong>
          <span>{shortDate(focused.date)}{focused.hour!=null?" · "+hourLabel(focused.hour):""} · {focused.transactions} payment{focused.transactions===1?"":"s"} in period</span>
        </>:<span>Select or tap a colored point to inspect that payment method's exact amount. Hide other lines using the legend.</span>}
      </div>
    </div>
  );
}

export function SalesAnalytics({from,to,rev=0}){
  const path="/dashboard/sales-analytics?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to);
  const {data,error,loading}=useData(path,rev);
  const cards=useMemo(()=>data?[
    {title:"Total Collected",value:data.totals.sales,peak:data.peaks.sales,kind:"sales"},
    {title:"Cash",value:data.totals.cash,peak:data.peaks.cash,kind:"cash"},
    {title:"GCash",value:data.totals.gcash,peak:data.peaks.gcash,kind:"gcash"},
    {title:"Other Digital",value:data.totals.other,peak:data.peaks.other,kind:"other"},
    {title:"Expenses",value:data.expenses,kind:"expenses"},
    {title:"Net Collections",value:data.netCollections,kind:"net"}
  ]:[],[data]);
  return (
    <section className="laundry-sales-section" aria-label="Sales and payment dashboard">
      <div className="laundry-sales-heading">
        <div>
          <p className="laundry-sales-eyebrow">SALES ANALYTICS</p>
          <h2>Sales & payment dashboard</h2>
          <p>Water POS-style breakdown, with collections and booked orders tracked separately.</p>
        </div>
        {data&&<span className="laundry-date-badge">{data.days===1?shortDate(from):shortDate(from)+" – "+shortDate(to)}</span>}
      </div>
      {error&&<p className="water-payment-error" role="alert">{error}</p>}
      {loading&&!data&&<div className="panel">Loading payment analytics…</div>}
      {data&&<>
        <div className="laundry-sales-metrics">
          {cards.map(c=><div key={c.title} className={"laundry-sales-metric metric-"+c.kind}>
            <span>{c.title}</span>
            <strong>{cash(c.value)}</strong>
            <small>{c.peak?peakLabel(c.peak):c.kind==="expenses"?"Expenses dated within the selected range":c.kind==="net"?"Collected payments minus recorded expenses":"No collections in range"}</small>
          </div>)}
        </div>
        <div className="panel laundry-sales-chart">
          <div className="laundry-sales-chart-header">
            <div>
              <p className="laundry-sales-eyebrow">PAYMENT TRENDS</p>
              <h3>{data.grain==="hourly"?"Hourly Sales Trend":"Daily Sales Trend"}</h3>
              <p>{data.grain==="hourly"
                ? "Hourly payment collections (all 24 hours), with day markers on multi-day views."
                : "Daily payment collections for seven or more days."}</p>
            </div>
            <span className="laundry-trend-mode">{data.grain==="hourly"?"HOURLY":"DAILY"}</span>
          </div>
          {data.timeline?.length?<TrendChart data={data}/>:<Empty>No collections in this range.</Empty>}
          <p className="laundry-sales-footnote">
            <strong>Accounting note:</strong> Collected = payments received by payment date. Booked orders (including unpaid orders) = {cash(data.bookedSales)} from {data.bookedOrders} order{data.bookedOrders===1?"":"s"}.
            Net Collections is receipts minus recorded expenses, not accounting profit. Payment-method corrections appear under the currently recorded method.
          </p>
        </div>
      </>}
    </section>
  );
}
