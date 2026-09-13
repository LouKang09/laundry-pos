-- Database-level invariants complement API validation.
ALTER TABLE "Service" ADD CONSTRAINT "Service_positive_pricing" CHECK ("regularPrice" > 0 AND "expressPrice" > 0 AND "minimumQuantity" > 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_whole_piece_minimum" CHECK ("unit" <> 'PIECE' OR "minimumQuantity" = trunc("minimumQuantity"));
ALTER TABLE "Order" ADD CONSTRAINT "Order_positive_total" CHECK ("total" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_paid_before_claim" CHECK (("status" = 'CLAIMED' AND "paymentStatus" = 'PAID' AND "claimedAt" IS NOT NULL) OR ("status" <> 'CLAIMED' AND "claimedAt" IS NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_valid_pickup_window" CHECK (("estimatedFrom" IS NULL AND "estimatedTo" IS NULL) OR ("estimatedFrom" IS NOT NULL AND "estimatedTo" IS NOT NULL AND "estimatedFrom" < "estimatedTo"));
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_valid_quantities" CHECK ("actualQuantity" > 0 AND "billableQuantity" >= "actualQuantity" AND "unitPrice" > 0 AND "total" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_whole_pieces" CHECK ("unit" <> 'PIECE' OR ("actualQuantity" = trunc("actualQuantity") AND "billableQuantity" = trunc("billableQuantity")));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_gcash_reference" CHECK ("method" <> 'GCASH' OR ("reference" IS NOT NULL AND length("reference") >= 4));
ALTER TABLE "InventoryItem" ADD CONSTRAINT "Inventory_nonnegative" CHECK ("stock" >= 0 AND "lowStockThreshold" >= 0);
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_valid_balance" CHECK ("stockAfter" >= 0 AND "quantity" <> 0 AND ("type" <> 'CONSUMPTION' OR "quantity" < 0) AND ("type" <> 'REPLENISHMENT' OR "quantity" > 0));
ALTER TABLE "ServiceInventoryUsage" ADD CONSTRAINT "ServiceInventoryUsage_positive" CHECK ("quantityPerUnit" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_positive_amount" CHECK ("amount" > 0);
