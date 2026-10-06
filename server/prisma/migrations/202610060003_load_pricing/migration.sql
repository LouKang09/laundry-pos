ALTER TABLE "Service"
  ADD COLUMN "regularFullPrice" DECIMAL(12,2),
  ADD COLUMN "regularFullQuantity" DECIMAL(12,3),
  ADD COLUMN "regularHalfPrice" DECIMAL(12,2),
  ADD COLUMN "regularHalfQuantity" DECIMAL(12,3),
  ADD COLUMN "expressFullPrice" DECIMAL(12,2),
  ADD COLUMN "expressFullQuantity" DECIMAL(12,3),
  ADD COLUMN "expressHalfPrice" DECIMAL(12,2),
  ADD COLUMN "expressHalfQuantity" DECIMAL(12,3);

UPDATE "Service"
SET
  "regularFullPrice" = ROUND("regularPrice" * "minimumQuantity", 2),
  "regularFullQuantity" = "minimumQuantity",
  "regularHalfPrice" = ROUND("regularPrice" * "minimumQuantity", 2),
  "regularHalfQuantity" = "minimumQuantity",
  "expressFullPrice" = ROUND("expressPrice" * "minimumQuantity", 2),
  "expressFullQuantity" = "minimumQuantity",
  "expressHalfPrice" = ROUND("expressPrice" * "minimumQuantity", 2),
  "expressHalfQuantity" = "minimumQuantity";

-- Switch the default Wash & Fold service to the requested full/half-load model.
UPDATE "Service"
SET
  "regularFullPrice" = 220.00,
  "regularFullQuantity" = 7.000,
  "regularHalfPrice" = 150.00,
  "regularHalfQuantity" = 4.000,
  "expressFullPrice" = 320.00,
  "expressFullQuantity" = 7.000,
  "expressHalfPrice" = 250.00,
  "expressHalfQuantity" = 4.000
WHERE "name" = 'Wash & Fold';

ALTER TABLE "Service"
  ALTER COLUMN "regularFullPrice" SET NOT NULL,
  ALTER COLUMN "regularFullQuantity" SET NOT NULL,
  ALTER COLUMN "regularHalfPrice" SET NOT NULL,
  ALTER COLUMN "regularHalfQuantity" SET NOT NULL,
  ALTER COLUMN "expressFullPrice" SET NOT NULL,
  ALTER COLUMN "expressFullQuantity" SET NOT NULL,
  ALTER COLUMN "expressHalfPrice" SET NOT NULL,
  ALTER COLUMN "expressHalfQuantity" SET NOT NULL;

ALTER TABLE "OrderItem"
  ADD COLUMN "pricingLabel" TEXT;
