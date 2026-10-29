-- Digital references use the same three-character minimum as Water POS.
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_gcash_reference";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_digital_reference"
  CHECK ("method" = 'CASH' OR ("reference" IS NOT NULL AND length("reference") >= 3));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_other_provider"
  CHECK (("method" = 'OTHERS' AND "provider" IN ('MAYA','MARIBANK','GOTYME','BPI'))
    OR ("method" <> 'OTHERS' AND "provider" IS NULL));
