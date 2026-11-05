CREATE TABLE "CashFlowEntry" (
  "date" DATE NOT NULL,
  "pettyCashOverride" DECIMAL(12,2),
  "bankPettyOverride" DECIMAL(12,2),
  "actual" DECIMAL(12,2),
  "creditToBank" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "debitFromBank" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "note" VARCHAR(500),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashFlowEntry_pkey" PRIMARY KEY ("date"),
  CONSTRAINT "CashFlowEntry_nonnegative" CHECK (
    ("pettyCashOverride" IS NULL OR "pettyCashOverride" >= 0) AND
    ("bankPettyOverride" IS NULL OR "bankPettyOverride" >= 0) AND
    ("actual" IS NULL OR "actual" >= 0) AND
    "creditToBank" >= 0 AND "debitFromBank" >= 0
  )
);
