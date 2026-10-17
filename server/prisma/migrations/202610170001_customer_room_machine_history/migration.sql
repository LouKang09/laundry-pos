ALTER TABLE "Customer"
ADD COLUMN "roomUnit" TEXT;

ALTER TABLE "Order"
ADD COLUMN "customerRoomUnit" TEXT,
ADD COLUMN "washingMachine" TEXT;

ALTER TABLE "OrderStatusHistory"
ADD COLUMN "washingMachine" TEXT;
