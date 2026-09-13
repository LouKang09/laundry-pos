import {db} from '../src/db.js';
export async function seed(){
 for(const s of [{name:'Wash & Fold',unit:'KG',regularPrice:'40',expressPrice:'60',minimumQuantity:'7'},{name:'Comforter',unit:'PIECE',regularPrice:'180',expressPrice:'250',minimumQuantity:'1'},{name:'Shirt · Dry Cleaning',unit:'PIECE',regularPrice:'100',expressPrice:'150',minimumQuantity:'1'}])await db.service.upsert({where:{name:s.name},create:s,update:{}});
 for(const i of [{name:'Detergent',unit:'L',lowStockThreshold:'5'},{name:'Bleach',unit:'L',lowStockThreshold:'3'},{name:'Fabric conditioner',unit:'L',lowStockThreshold:'5'},{name:'Laundry bags',unit:'PCS',lowStockThreshold:'20'},{name:'Tags',unit:'PCS',lowStockThreshold:'20'}])await db.inventoryItem.upsert({where:{name:i.name},create:i,update:{}});
 await db.setting.upsert({where:{key:'business'},create:{key:'business',value:{name:'Laundry POS',timezone:'Asia/Manila',regularHours:24,expressHours:6,windowHours:4}},update:{}});
}
if(process.argv[1]?.endsWith('seed.js')){await seed();console.log('Services, empty inventory and settings seeded. No customer or transaction samples created.');await db.$disconnect();}
