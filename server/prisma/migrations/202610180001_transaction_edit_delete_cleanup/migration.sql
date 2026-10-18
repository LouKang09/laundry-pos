-- Add transaction soft-delete support and clear pre-production test transactions.
ALTER TABLE "Order" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "deletedById" TEXT;
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");

-- Remove existing test/placeholder transaction records only. Preserve users,
-- customers, service pricing, inventory items, settings, and service mappings.
DELETE FROM "Notification";
DELETE FROM "OrderStatusHistory";
DELETE FROM "Payment";
DELETE FROM "OrderItem";
DELETE FROM "InventoryTransaction";
DELETE FROM "Order";
DELETE FROM "Expense";

-- Clear audit entries tied to the pre-production transaction data while
-- retaining user/account and configuration audit records.
DELETE FROM "AuditLog"
WHERE "entity" IN ('Order', 'Expense')
   OR "action" IN (
     'ORDER_CREATED', 'ORDER_VIEWED', 'ORDER_LIST_VIEWED',
     'TRANSACTION_VIEWED', 'TRANSACTION_PRINTED', 'TRANSACTION_REPRINTED',
     'PAYMENT_RECEIVED', 'STATUS_UPDATED', 'CANCELLATION',
     'INVENTORY_CHANGED'
   );

SELECT setval(pg_get_serial_sequence('"Order"', 'number'), 1, false);
