// Dependency-free, client-side multi-page PDF export. No report data leaves the browser.
const pageW = 595.28, pageH = 841.89;
const txt = value => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
const pdfEscape = value => txt(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const money = amount => "PHP " + Number(amount || 0).toLocaleString("en-PH", {minimumFractionDigits:2,maximumFractionDigits:2});
const dateText = (v, zone) => new Date(v).toLocaleString("en-PH", {timeZone:zone||"Asia/Manila",year:"numeric",month:"short",day:"numeric"});
const wrap = (text, max) => {
  const words = txt(text).split(/\s+/).filter(Boolean), lines=[]; let line="";
  for (let word of words) {
    while (word.length > max) { if(line){lines.push(line);line="";} lines.push(word.slice(0,max)); word=word.slice(max); }
    if ((line+" "+word).trim().length > max && line) { lines.push(line); line=word; }
    else line=(line+" "+word).trim();
  }
  if(line)lines.push(line); return lines.length ? lines : [""];
};
export function downloadPdf({title, subtitle, filename, sections=[]}) {
  const pages=[]; let commands=[], y=0;
  const draw=(x,at,value,size=10,bold=false)=> {
    commands.push("BT /"+(bold?"F2":"F1")+" "+size+" Tf 1 0 0 1 "+x.toFixed(2)+" "+(pageH-at).toFixed(2)+" Tm ("+pdfEscape(value)+") Tj ET");
  };
  const line=(at)=>commands.push("0.8 0.84 0.88 RG 0.6 w 36 "+(pageH-at).toFixed(2)+" m "+(pageW-36)+" "+(pageH-at).toFixed(2)+" l S");
  const newPage=()=> {
    if(commands.length) pages.push(commands.join("\n"));
    commands=[];y=48;
    draw(36,y,title,17,true); y+=19;
    if(subtitle)for(const t of wrap(subtitle,100)){draw(36,y,t,9);y+=12;}
    y+=10;line(y);y+=20;
  };
  const need=(height)=>{if(y+height>pageH-65)newPage();};
  newPage();
  for(const section of sections){
    if(section.heading){need(35);draw(36,y,section.heading,13,true);y+=23;}
    if(section.note){for(const t of wrap(section.note,104)){need(14);draw(36,y,t,9);y+=13;}y+=7;}
    if(section.items){
      for(const [label,value] of section.items){need(17);draw(40,y,label,10);draw(305,y,value,10,true);y+=16;}
      y+=12;
    }
    if(section.headers&&section.rows){
      const count=section.headers.length;
      const usable=pageW-72;
      const widths=section.widths&&section.widths.length===count?section.widths.map(v=>v*usable):Array(count).fill(usable/count);
      const startXs=widths.map((_,i)=>36+widths.slice(0,i).reduce((a,b)=>a+b,0));
      const renderRow=(cells,header=false)=>{
        const wrapped=cells.map((cell,i)=>wrap(cell,Math.max(6,Math.floor((widths[i]-10)/(header?5.9:5.3)))));
        const height=Math.max(21,...wrapped.map(a=>a.length*12+7));
        need(height+3);
        if(header){commands.push("0.92 0.94 0.96 rg 36 "+(pageH-y-height+5).toFixed(2)+" "+usable+" "+height+" re f");}
        wrapped.forEach((ls,i)=>ls.forEach((text,k)=>draw(startXs[i]+4,y+13+k*12,text,header?9:9,header)));
        y+=height;line(y);
      };
      renderRow(section.headers,true);
      if(!section.rows.length){renderRow(["No records for the selected period.",...Array(count-1).fill("")]);}
      section.rows.forEach(r=>{if(y>pageH-98){newPage();renderRow(section.headers,true);}renderRow(r);});
      y+=16;
    }
  }
  if(commands.length)pages.push(commands.join("\n"));
  const objects=[null];
  const add=s=>{objects.push(s);return objects.length-1;};
  const catalog=add(""), tree=add("");
  const f1=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const f2=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const kids=[];
  for(let i=0;i<pages.length;i++){
    const foot="BT /F1 9 Tf 1 0 0 1 36 32 Tm (Generated "+pdfEscape(new Date().toLocaleString("en-PH"))+"  |  Page "+(i+1)+" of "+pages.length+") Tj ET";
    const stream=pages[i]+"\n"+foot;
    const len=new TextEncoder().encode(stream).length;
    const content=add("<< /Length "+len+" >>\nstream\n"+stream+"\nendstream");
    kids.push(add("<< /Type /Page /Parent "+tree+" 0 R /MediaBox [0 0 "+pageW+" "+pageH+"] /Resources << /Font << /F1 "+f1+" 0 R /F2 "+f2+" 0 R >> >> /Contents "+content+" 0 R >>"));
  }
  objects[tree]="<< /Type /Pages /Kids ["+kids.map(i=>i+" 0 R").join(" ")+"] /Count "+kids.length+" >>";
  objects[catalog]="<< /Type /Catalog /Pages "+tree+" 0 R >>";
  let pdf="%PDF-1.4\n", offsets=[0];const encoder=new TextEncoder();
  for(let i=1;i<objects.length;i++){offsets[i]=encoder.encode(pdf).length;pdf+=i+" 0 obj\n"+objects[i]+"\nendobj\n";}
  const xref=encoder.encode(pdf).length;
  pdf+="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+objects.length+" /Root "+catalog+" 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  const blob=new Blob([encoder.encode(pdf)],{type:"application/pdf"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=filename.replace(/[^a-zA-Z0-9._-]/g,"_");document.body.appendChild(link);link.click();link.remove();
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
        widths:[0.29,0.17,0.16,0.20,0.18],
        rows:rows.map(x=>[x.customerName+" / "+x.orderNumber,x.category,x.status+" / "+x.paymentStatus,dateText(x.occurredAt,data.timezone),money(x.amount)])},
      {note:"Paid and claimed events use their event dates. Unpaid and unclaimed are current statuses of orders received during this period. Customer records may appear in more than one activity category."}
    ]});
}
