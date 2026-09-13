import {z} from 'zod';
export {z};
export const text = z.string().trim().min(1).max(160);
export const decimal = (places=2,zero=false) => z.union([z.string(),z.number()]).transform(String).refine(v=>new RegExp('^\\d{1,7}(\\.\\d{1,'+places+'})?$').test(v) && (zero?Number(v)>=0:Number(v)>0),'Enter a valid positive number');
export const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).transform(v=>v.replace(/[ ()-]/g,''));
export const customerSchema=z.object({name:text,phone}).strict();
export const serviceSchema=z.object({name:text,unit:z.enum(['KG','PIECE']),regularPrice:decimal(),expressPrice:decimal(),minimumQuantity:decimal(3),active:z.boolean().default(true)}).strict().refine(v=>v.unit!=='PIECE'||Number.isInteger(Number(v.minimumQuantity)),{message:'Piece minimum must be a whole number'});
export const paymentSchema=z.object({method:z.enum(['CASH','GCASH']),reference:z.string().trim().min(4).max(100).optional()}).strict().refine(v=>v.method!=='GCASH'||!!v.reference,{message:'GCash reference is required'});
export const orderSchema=z.object({requestKey:z.string().uuid(),customerId:text,items:z.array(z.object({serviceId:text,actualQuantity:decimal(3),express:z.boolean()}).strict()).min(1).max(30),payment:paymentSchema.optional(),estimatedFrom:z.iso.datetime().optional(),estimatedTo:z.iso.datetime().optional()}).strict().refine(v=>(!v.estimatedFrom&&!v.estimatedTo)||(v.estimatedFrom&&v.estimatedTo&&v.estimatedFrom<v.estimatedTo),{message:'Set a valid pickup window with both start and end'});
