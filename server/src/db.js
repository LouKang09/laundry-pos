import {PrismaClient, Prisma} from '@prisma/client';
export const db = new PrismaClient();
export const D = Prisma.Decimal;
export const money = v => new D(v).toDecimalPlaces(2, D.ROUND_HALF_UP);
export async function atomic(fn) {
  for(let attempt=0;attempt<4;attempt++) {
    try { return await db.$transaction(fn,{isolationLevel:'Serializable',timeout:20000}); }
    catch(e) {if(e.code!=='P2034'||attempt===3) throw e;}
  }
}
export const audit = (tx,userId,action,entity,entityId,metadata={}) => tx.auditLog.create({data:{userId,action,entity,entityId,metadata}});
export function fail(status,message){const e=new Error(message);e.status=status;throw e;}
