CREATE TYPE "PaymentArrangement" AS ENUM ('PAY_ON_PICKUP', 'PAY_LATER');
ALTER TABLE "Order"
  ADD COLUMN "paymentArrangement" "PaymentArrangement" NOT NULL DEFAULT 'PAY_ON_PICKUP';
