// Browser-native vector PDF: sharp text and lines at any zoom level.
// Uses vector text and keeps private data in the browser. A3 is optional for wide ledgers.
const LEFT = 42;
const RIGHT = 42;
const BOTTOM = 52;
const normalize = v => String(v ?? "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\x20-\x7e]/g, "-");
const escapeText = v => normalize(v).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
const money = amount => "PHP " + Number(amount || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const dateText = (v, zone) => new Date(v).toLocaleDateString("en-PH", {
  timeZone: zone || "Asia/Manila", year: "numeric", month: "short", day: "numeric",
});
const shortDate = (v, zone) => new Date(v).toLocaleDateString("en-PH", {
  timeZone: zone || "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
});
const approximateWidth = (s,size) => normalize(s).split("").reduce((sum,ch)=>
  sum + (ch===" " ? 0.27 : "il.,:;!|".includes(ch) ? 0.25 :
    "MW@#%".includes(ch) ? 0.85 : "0123456789".includes(ch) ? 0.55 : 0.53)*size,0);
function wrapText(value, maxWidth, size=10.5) {
  const words = normalize(value).split(/\s+/).filter(Boolean);
  const out=[]; let line="";
  for (const word of words) {
    const candidate = line ? line+" "+word : word;
    if (approximateWidth(candidate,size) <= maxWidth) { line=candidate; continue; }
    if(line){ out.push(line); line=""; }
    let rest=word;
    while(rest && approximateWidth(rest,size)>maxWidth){
      let cut=1;
      while(cut<rest.length && approximateWidth(rest.slice(0,cut+1),size)<=maxWidth)cut++;
      out.push(rest.slice(0,cut));
      rest=rest.slice(cut);
    }
    line=rest;
  }
  if(line)out.push(line);
  return out.length ? out : [""];
}
export function downloadPdf({title, subtitle, filename, sections=[], pageSize="A4"}) {
  const WIDTH = pageSize === "A3" ? 1190.55 : 841.89;
  const HEIGHT = pageSize === "A3" ? 841.89 : 595.28;
  const TABLE_WIDTH = WIDTH - LEFT - RIGHT;
  const pages=[];
  let commands=[], y=0, currentPage=0;
  const number = n => Number(n).toFixed(2);
  const fillRect = (x,top,width,height,rgb) => {
    commands.push(rgb.join(" ")+" rg "+number(x)+" "+number(HEIGHT-top-height)+" "+number(width)+" "+number(height)+" re f");
  };
  const draw = (x,top,value,size=10.5,bold=false,color=[0.12,0.17,0.24]) => {
    commands.push(color.join(" ")+" rg BT /"+(bold?"F2":"F1")+" "+number(size)+" Tf 1 0 0 1 "+
      number(x)+" "+number(HEIGHT-top)+" Tm ("+escapeText(value)+") Tj ET");
  };
  const rule = (top) => commands.push("0.84 0.87 0.91 RG 0.45 w "+number(LEFT)+" "+number(HEIGHT-top)+" m "+number(WIDTH-RIGHT)+" "+number(HEIGHT-top)+" l S");
  const newPage = () => {
    if(commands.length) pages.push(commands.join("\n"));
    commands=[]; currentPage++; y=0;
    fillRect(0,0,WIDTH,9,[0.08,0.35,0.42]);
    draw(LEFT,45,title,19,true,[0.08,0.20,0.27]);
    y=63;
    for(const sub of wrapText(subtitle, TABLE_WIDTH,10.5)){
      draw(LEFT,y,sub,10.5,false,[0.34,0.42,0.49]); y+=14;
    }
    y+=9;rule(y);y+=20;
  };
  const requireSpace = height => { if(y+height>HEIGHT-BOTTOM)newPage(); };
  function table(section){
    const headers=section.headers.map(String), rows=section.rows;
    const ratios=section.widths?.length===headers.length?section.widths:Array(headers.length).fill(1/headers.length);
    const ratioSum=ratios.reduce((a,b)=>a+b,0);
    const widths=ratios.map(r=>TABLE_WIDTH*r/ratioSum);
    const starts=widths.map((_,i)=>LEFT+widths.slice(0,i).reduce((a,b)=>a+b,0));
    let rowIndex=0;
    const render=(values,header=false)=>{
      const size=header?(section.headerFontSize ?? 10.5):(section.fontSize ?? 10.5);
      const padding=section.cellPadding ?? 9;
      const lineHeight=section.lineHeight ?? 14;
      const multi=widths.map((w,i)=>wrapText(values[i] ?? "",Math.max(w-padding*2,18),size));
      const rowHeight=Math.max(section.minRowHeight ?? 29,...multi.map(lines=>lines.length*lineHeight+15));
      // Keep the whole row together and repeat headings after page breaks.
      if(y+rowHeight>HEIGHT-BOTTOM){
        newPage();
        if(!header)render(headers,true);
      }
      if(header)fillRect(LEFT,y,TABLE_WIDTH,rowHeight,[0.88,0.93,0.95]);
      else if(rowIndex++%2===0)fillRect(LEFT,y,TABLE_WIDTH,rowHeight,[0.965,0.976,0.982]);
      for(let i=0;i<multi.length;i++){
        multi[i].forEach((line,k)=>draw(starts[i]+padding,y+19+k*lineHeight,line,size,header,[0.12,0.22,0.30]));
      }
      y+=rowHeight;rule(y);
    };
    render(headers,true);
    if(rows.length)for(const row of rows)render(row);
    else render(["No records for this period.",...headers.slice(1).map(()=> "")]);
    y+=17;
  }
  newPage();
  for(const section of sections){
    if(section.heading){requireSpace(44);draw(LEFT,y,section.heading,13.5,true,[0.07,0.32,0.39]);y+=26;}
    if(section.note)for(const noteLine of wrapText(section.note,TABLE_WIDTH,10.5)){
      requireSpace(18);draw(LEFT,y,noteLine,10.5,false,[0.34,0.42,0.49]);y+=15;
    }
    if(section.note)y+=10;
    if(section.items){
      for(const [name,value] of section.items){
        requireSpace(21);
        draw(LEFT+8,y,String(name),11);
        draw(LEFT+290,y,String(value),11,true);
        y+=21;
      }
      y+=15;
    }
    if(section.headers && section.rows)table(section);
  }
  if(commands.length)pages.push(commands.join("\n"));
  const objects=[null];
  const add=obj=>{objects.push(obj);return objects.length-1;};
  const catalog=add(""),pagesRoot=add("");
  const font=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldFont=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids=[];
  for(let i=0;i<pages.length;i++){
    const footer="0.36 0.43 0.50 rg BT /F1 9 Tf 1 0 0 1 "+LEFT+" 27 Tm ("+
      escapeText("Generated "+new Date().toLocaleString("en-PH")+" | Page "+(i+1)+" of "+pages.length)+") Tj ET";
    const stream=pages[i]+"\n"+footer;
    const content=add("<< /Length "+new TextEncoder().encode(stream).length+" >>\nstream\n"+stream+"\nendstream");
    kids.push(add("<< /Type /Page /Parent "+pagesRoot+" 0 R /MediaBox [0 0 "+WIDTH+" "+HEIGHT+"] "+
      "/Resources << /Font << /F1 "+font+" 0 R /F2 "+boldFont+" 0 R >> >> /Contents "+content+" 0 R >>"));
  }
  objects[pagesRoot]="<< /Type /Pages /Kids ["+kids.map(i=>i+" 0 R").join(" ")+"] /Count "+kids.length+" >>";
  objects[catalog]="<< /Type /Catalog /Pages "+pagesRoot+" 0 R >>";
  const encoder=new TextEncoder();
  let pdf="%PDF-1.4\n",offsets=[0];
  for(let i=1;i<objects.length;i++){
    offsets[i]=encoder.encode(pdf).length;
    pdf+=i+" 0 obj\n"+objects[i]+"\nendobj\n";
  }
  const xref=encoder.encode(pdf).length;
  pdf+="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+objects.length+" /Root "+catalog+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  const blob=new Blob([encoder.encode(pdf)],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename.replace(/[^a-zA-Z0-9._-]/g,"_");
  document.body.appendChild(link);
  link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function downloadBusinessReport(data,name){
  const to=new Date(new Date(data.to).getTime()-1);
  const prefix=data.period.toLowerCase();
  downloadPdf({title:(name||"Laundry POS")+" - Business report",
    subtitle:data.period+" | "+dateText(data.from,data.timezone)+" to "+dateText(to,data.timezone)+" | "+data.timezone,
    filename:"laundry-business-"+prefix+"-"+new Date(data.from).toISOString().slice(0,10)+".pdf",
    sections:[
      {heading:"Business summary",items:[["Gross sales",money(data.grossSales)],["Orders",data.orders],["Payments collected",money(data.paymentsReceived)],["Kilograms processed",data.kilograms],["Pieces processed",data.pieces],["Expenses",money(data.expenses)],["Estimated profit",money(data.estimatedProfit)]]},
      {heading:"Payment method breakdown",headers:["Payment method","Quantity","Amount"],widths:[0.44,0.20,0.36],
        rows:(data.paymentMethods||[]).map(x=>[x.method,x.count,money(x.amount)])},
      {heading:"Services sold",headers:["Service","Unit","Actual","Billable","Sales"],widths:[0.32,0.12,0.16,0.16,0.24],
        rows:(data.services||[]).map(x=>[x.name,x.unit,x.actual,x.billable,money(x.sales)])},
      {heading:"Staff performance",headers:["Staff","Orders created","Sales"],widths:[0.45,0.22,0.33],
        rows:(data.staff||[]).map(x=>[x.name,x.orders,money(x.sales)])},
      {heading:"Daily sales trend",headers:["Date","Orders","Sales"],widths:[0.40,0.2,0.4],
        rows:(data.trend||[]).map(x=>[x.date,x.orders,money(x.sales)])},
      {note:"Sales use order-received dates; payment collections use payment dates. Cancelled orders are excluded. Estimated profit is sales minus recorded expenses."}
    ]});
}
export function downloadCustomerActivity(data,name,category="ALL"){
  const rows=(data.rows||[]).filter(x=>category==="ALL"||x.category===category);
  const to=new Date(new Date(data.to).getTime()-1);
  downloadPdf({title:(name||"Laundry POS")+" - Customer activity",
    subtitle:dateText(data.from,data.timezone)+" to "+dateText(to,data.timezone)+" | Filter: "+category+" | "+data.timezone,
    filename:"laundry-customer-activity-"+category.toLowerCase()+"-"+new Date(data.from).toISOString().slice(0,10)+".pdf",
    sections:[
      {heading:"Activity summary",items:[["Orders",data.counts.orders],["Paid",data.counts.paid],["Claimed",data.counts.claimed],["Unclaimed",data.counts.unclaimed],["Unpaid",data.counts.unpaid],["Payments received",money(data.counts.paymentsAmount)]]},
      {heading:"Payment method breakdown",headers:["Method","Quantity","Collected"],widths:[0.45,0.20,0.35],
        rows:(data.paymentMethods||[]).map(x=>[x.method,x.count,money(x.amount)])},
      {heading:"Customer activity",headers:["Customer / order","Activity","Status","Date","Amount"],
        widths:[0.29,0.14,0.22,0.17,0.18],
        rows:rows.map(x=>[x.customerName+" / "+x.orderNumber,x.category,x.status+" / "+x.paymentStatus,shortDate(x.occurredAt,data.timezone),money(x.amount)])},
      {note:"Paid and claimed events use their event dates. Unpaid and unclaimed are current statuses of orders received during this period. Customer records may appear in more than one activity category."}
    ]});
}
