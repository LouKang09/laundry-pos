import { Router } from "express";
import { DateTime } from "luxon";
import { db, fail } from "./db.js";
import { admin } from "./auth.js";
import { business } from "./orders.js";
import { z } from "./validation.js";

export const salesAnalytics = Router();

// This chart is based on actual recorded payments (not booked orders).
// Laundry orders may be unpaid when created and collected at pickup later.
export function buildSalesTimeline(payments, from, days, timezone) {
  const hourly = days < 7;
  const rows = [];
  const index = new Map();
  for (let day=0;day<days;day++) {
    const date=from.plus({days:day}).toISODate();
    const hourValues=hourly?Array.from({length:24},(_,i)=>i):[null];
    for(const hour of hourValues){
      const row={date,...(hour!==null?{hour}:{}),sales:0,cash:0,gcash:0,other:0,transactions:0};
      index.set(date+(hour===null?"":":"+hour),row);
      rows.push(row);
    }
  }
  const peaks={sales:Array.from({length:24},()=>0),cash:Array.from({length:24},()=>0),gcash:Array.from({length:24},()=>0),other:Array.from({length:24},()=>0)};
  const totals={sales:0,cash:0,gcash:0,other:0};
  for(const p of payments){
    const local=DateTime.fromJSDate(p.createdAt).setZone(timezone);
    const date=local.toISODate();
    const amount=Number(p.amount);
    const key=p.method==="CASH"?"cash":p.method==="GCASH"?"gcash":"other";
    const row=index.get(date+(hourly?":"+local.hour:""));
    if(!row)continue;
    row.sales+=amount;row[key]+=amount;row.transactions++;
    totals.sales+=amount;totals[key]+=amount;
    peaks.sales[local.hour]+=amount;peaks[key][local.hour]+=amount;
  }
  const rounded=v=>Math.round((v+Number.EPSILON)*100)/100;
  const getPeak=values=>{
    const amount=Math.max(...values);
    if(amount<=0)return null;
    return {hour:values.indexOf(amount),amount:rounded(amount)};
  };
  return {
    grain:hourly?"hourly":"daily",
    timeline:rows.map(row=>({
      ...row,
      sales:rounded(row.sales),cash:rounded(row.cash),gcash:rounded(row.gcash),other:rounded(row.other)
    })),
    totals:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,rounded(value)])),
    peaks:Object.fromEntries(Object.entries(peaks).map(([key,value])=>[key,getPeak(value)])),
    transactions:payments.length
  };
}

salesAnalytics.get("/dashboard/sales-analytics",admin,async(req,res)=>{
  const cfg=await business();
  const now=DateTime.now().setZone(cfg.timezone);
  const fromDate=z.iso.date().parse(req.query.from||now.toISODate());
  const toDate=z.iso.date().parse(req.query.to||fromDate);
  const from=DateTime.fromISO(fromDate,{zone:cfg.timezone}).startOf("day");
  const last=DateTime.fromISO(toDate,{zone:cfg.timezone}).startOf("day");
  if(!from.isValid||!last.isValid||last<from)fail(400,"Choose a valid date range.");
  if(last>now.startOf("day"))fail(400,"Future dates cannot be selected.");
  const days=Math.round(last.diff(from,"days").days)+1;
  if(days<1||days>366)fail(400,"Select at most 366 days.");
  const until=last.plus({days:1});
  const range={gte:from.toJSDate(),lt:until.toJSDate()};
  const [payments,booked,expenses]=await Promise.all([
    db.payment.findMany({
      where:{createdAt:range,order:{deletedAt:null,status:{not:"CANCELLED"}}},
      select:{createdAt:true,amount:true,method:true}
    }),
    db.order.aggregate({
      where:{createdAt:range,deletedAt:null,status:{not:"CANCELLED"}},
      _sum:{total:true},_count:true
    }),
    db.expense.aggregate({
      where:{date:{
        gte:new Date(fromDate+"T00:00:00Z"),
        lt:new Date(until.toISODate()+"T00:00:00Z")
      }},
      _sum:{amount:true}
    })
  ]);
  const data=buildSalesTimeline(payments,from,days,cfg.timezone);
  const expenseAmount=Number(expenses._sum.amount||0);
  res.json({
    from:fromDate,to:toDate,days,timezone:cfg.timezone,
    ...data,
    bookedSales:Number(booked._sum.total||0),
    bookedOrders:booked._count,
    expenses:expenseAmount,
    netCollections:Math.round((data.totals.sales-expenseAmount)*100)/100
  });
});
