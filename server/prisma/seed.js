import { db } from "../src/db.js";
export async function seed() {
  for (const s of [
    {
      name: "Wash & Fold",
      unit: "KG",
      regularPrice: "31.43",
      expressPrice: "45.71",
      minimumQuantity: "7",
      regularFullPrice: "220",
      regularFullQuantity: "7",
      regularHalfPrice: "150",
      regularHalfQuantity: "4",
      expressFullPrice: "320",
      expressFullQuantity: "7",
      expressHalfPrice: "250",
      expressHalfQuantity: "4",
    },
    {
      name: "Comforter",
      unit: "PIECE",
      regularPrice: "180",
      expressPrice: "250",
      minimumQuantity: "1",
      regularFullPrice: "180",
      regularFullQuantity: "1",
      regularHalfPrice: "180",
      regularHalfQuantity: "1",
      expressFullPrice: "250",
      expressFullQuantity: "1",
      expressHalfPrice: "250",
      expressHalfQuantity: "1",
    },
    {
      name: "Shirt · Dry Cleaning",
      unit: "PIECE",
      regularPrice: "100",
      expressPrice: "150",
      minimumQuantity: "1",
      regularFullPrice: "100",
      regularFullQuantity: "1",
      regularHalfPrice: "100",
      regularHalfQuantity: "1",
      expressFullPrice: "150",
      expressFullQuantity: "1",
      expressHalfPrice: "150",
      expressHalfQuantity: "1",
    },
  ])
    await db.service.upsert({ where: { name: s.name }, create: s, update: {} });
  for (const i of [
    { name: "Detergent", unit: "L", lowStockThreshold: "5" },
    { name: "Bleach", unit: "L", lowStockThreshold: "3" },
    { name: "Fabric conditioner", unit: "L", lowStockThreshold: "5" },
    { name: "Laundry bags", unit: "PCS", lowStockThreshold: "20" },
    { name: "Tags", unit: "PCS", lowStockThreshold: "20" },
  ])
    await db.inventoryItem.upsert({
      where: { name: i.name },
      create: i,
      update: {},
    });
  await db.setting.upsert({
    where: { key: "business" },
    create: {
      key: "business",
      value: {
        name: "Laundry POS",
        timezone: "Asia/Manila",
        regularHours: 24,
        expressHours: 6,
        windowHours: 4,
      },
    },
    update: {},
  });
}
if (process.argv[1]?.endsWith("seed.js")) {
  await seed();
  console.log(
    "Services, empty inventory and settings seeded. No customer or transaction samples created.",
  );
  await db.$disconnect();
}
