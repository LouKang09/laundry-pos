-- Retain historic unit values and prices; add configurable tiers and retail add-ons.
ALTER TABLE "Service" ALTER COLUMN "unit" TYPE TEXT USING "unit"::text;
ALTER TABLE "OrderItem" ALTER COLUMN "unit" TYPE TEXT USING "unit"::text;
ALTER TABLE "Service" ADD COLUMN "pricingTiers" JSONB;
ALTER TABLE "InventoryItem" ADD COLUMN "salePrice" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN "sellAsAddon" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "OrderAddon" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL, "name" TEXT NOT NULL, "unit" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL, "unitPrice" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL
);
CREATE INDEX "OrderAddon_orderId_idx" ON "OrderAddon"("orderId");
ALTER TABLE "OrderAddon" ADD CONSTRAINT "OrderAddon_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderAddon" ADD CONSTRAINT "OrderAddon_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
