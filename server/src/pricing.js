import {D,money,fail} from './db.js';
export function priceItem(service,item){
  if(!service?.active)fail(400,'A selected service is unavailable');
  const actual=new D(item.actualQuantity);
  if(service.unit==='PIECE'&&!actual.isInteger())fail(400,'Piece quantity must be a whole number');
  const billable=D.max(actual,service.minimumQuantity);
  const price=new D(item.express?service.expressPrice:service.regularPrice);
  return {serviceId:service.id,serviceName:service.name,unit:service.unit,express:item.express,actualQuantity:actual,billableQuantity:billable,unitPrice:price,total:money(billable.mul(price))};
}
export const workflow=['RECEIVED','WASHING','DRYING','FOLDING','READY','CLAIMED'];
