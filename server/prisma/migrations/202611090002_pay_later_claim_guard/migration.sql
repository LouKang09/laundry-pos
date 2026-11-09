-- Maintain the original payment-before-claim safeguard for Pay Upon Pickup,
-- while allowing explicitly deferred Pay Later orders to be claimed unpaid.
ALTER TABLE "Order" DROP CONSTRAINT "Order_paid_before_claim";

ALTER TABLE "Order" ADD CONSTRAINT "Order_paid_before_claim" CHECK (
  (
    "status" = 'CLAIMED'
    AND "claimedAt" IS NOT NULL
    AND (
      "paymentStatus" = 'PAID'
      OR "paymentArrangement" = 'PAY_LATER'
    )
  )
  OR (
    "status" <> 'CLAIMED'
    AND "claimedAt" IS NULL
  )
);
