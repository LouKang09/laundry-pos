import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, atomic, audit, fail } from "./db.js";
import { authRoutes, authenticate } from "./auth.js";
import { orders, publicTracking, business } from "./orders.js";
import { historicalOrders } from "./historical-orders.js";
import { staffReceipts } from "./staff-receipts.js";
import { servicePricing } from "./service-pricing.js";
import { management } from "./admin.js";
import { reporting } from "./reports.js";
import { z, customerSchema, pageNumber } from "./validation.js";
export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // OCR is loaded lazily, using the same Tesseract.js provider as Water POS.
        // The receipt image never leaves the device during recognition.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net"],
        workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://tessdata.projectnaptha.com", "https://*.githubusercontent.com"],
      },
    },
  }),
);
const origins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.APP_URL ||
  "http://localhost:5173"
).split(",");
app.use(
  cors({
    origin(origin, cb) {
      cb(null, !origin || origins.includes(origin));
    },
    credentials: true,
  }),
);
app.use((req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("origin") &&
    !origins.includes(req.get("origin"))
  )
    return res.status(403).json({ error: "Origin not allowed" });
  next();
});
app.use(express.json({ limit: "5mb" }), cookieParser());
app.get("/health", async (req, res) => {
  try {
    const [migrations] = await db.$queryRaw`
      SELECT COUNT(*)::int AS applied FROM "_prisma_migrations"
      WHERE migration_name IN ('202609130001_initial', '202609130002_database_guards')
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const settings = await db.setting.findUnique({
      where: { key: "business" },
      select: { key: true },
    });
    if (migrations.applied !== 2 || !settings)
      throw new Error("Database setup incomplete");
    res.json({ status: "ok", database: "connected", schema: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 600,
    skip: () => process.env.NODE_ENV === "test",
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Minimal, rate-limited reporting for React render failures. Never accept or log
// the full URL because staff QR URLs contain private order tokens.
app.post(
  "/api/client-errors",
  rateLimit({
    windowMs: 60000,
    limit: 5,
    skip: () => process.env.NODE_ENV === "test",
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  (req, res) => {
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.slice(0, 300)
        : "Unknown client render error";
    const componentStack =
      typeof req.body?.componentStack === "string"
        ? req.body.componentStack.slice(0, 2000)
        : "";
    const route = ["staff-scan", "customer-track"].includes(req.body?.route)
      ? req.body.route
      : "other";
    console.error("Client render error", { route, message, componentStack });
    res.status(204).end();
  },
);
// A harmless, uncached fingerprint of the currently deployed client bundle.
 // Open tabs use it to offer a refresh rather than running old checkout code.
app.get("/api/app-version", (req, res) => {
  try {
    const index = readFileSync(path.join(dist, "index.html"), "utf8");
    const entry = index.match(/src="(\/assets\/[^"]+\.js)"/)?.[1] || null;
    return res.json({ entry });
  } catch {
    return res.json({ entry: null });
  }
});
authRoutes(app);
app.get(
  "/api/track/:token",
  rateLimit({
    windowMs: 60000,
    limit: 30,
    skip: () => process.env.NODE_ENV === "test",
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  publicTracking,
);
app.use("/api", authenticate);
app.get("/api/settings", async (req, res) => res.json(await business()));
app.get("/api/services", async (req, res) =>
  res.json(
    await db.service.findMany({
      where:
        req.user.role === "ADMIN" && req.query.all === "true"
          ? {}
          : { active: true },
      orderBy: { name: "asc" },
    }),
  ),
);
app.get("/api/addons", async (req, res) =>
  res.json(await db.inventoryItem.findMany({
    where: { active: true, sellAsAddon: true, salePrice: { gt: 0 } },
    select: { id: true, name: true, unit: true, stock: true, salePrice: true },
    orderBy: { name: "asc" },
  })),
);
app.get("/api/customers", async (req, res) => {
  const q = z
      .string()
      .max(160)
      .parse(req.query.q || ""),
    page = pageNumber.parse(req.query.page),
    where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/[ ()-]/g, "") } },
            { roomUnit: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: 30,
      skip: (page - 1) * 30,
      include: { _count: { select: { orders: true } } },
    }),
    db.customer.count({ where }),
  ]);
  res.json({ rows, total, page });
});
app.post("/api/customers", async (req, res) => {
  const v = customerSchema.parse(req.body);
  res.status(201).json(
    await atomic(async (tx) => {
      const c = await tx.customer.create({ data: v });
      await audit(tx, req.user.id, "CUSTOMER_CREATED", "Customer", c.id);
      return c;
    }),
  );
});
app.put("/api/customers/:id", async (req, res) => {
  const v = customerSchema.parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) fail(404, "Customer not found");
      const customer = await tx.customer.update({
        where: { id: existing.id },
        data: v,
      });
      await audit(tx, req.user.id, "CUSTOMER_UPDATED", "Customer", customer.id, {
        roomUnit: customer.roomUnit,
      });
      return customer;
    }),
  );
});
app.use("/api/orders", staffReceipts);
app.use("/api/orders", historicalOrders);
app.use("/api/orders", orders);
app.use("/api/admin", servicePricing);
app.use("/api/admin", management);
app.use("/api", reporting);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist",
);
// HTML must always be revalidated; hashed bundles are safe to cache forever.
app.use(express.static(dist, {
  setHeaders(res, filePath) {
    if (filePath.endsWith("index.html"))
      res.setHeader("Cache-Control", "no-store, max-age=0");
    else if (/[/\\]assets[/\\]/.test(filePath))
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));
app.get("/{*path}", (req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  return res.sendFile(path.join(dist, "index.html"));
});
app.use((err, req, res, next) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({
      error: err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  if (err.code === "P2002")
    return res.status(409).json({
      error:
        "This record or payment reference already exists. Refresh to check before retrying.",
    });
  if (err.code === "P2025")
    return res.status(404).json({ error: "Record not found" });
  if (err.code === "P2003")
    return res
      .status(400)
      .json({ error: "A related record is missing or in use" });
  if (err.code === "P2034")
    return res
      .status(409)
      .json({ error: "Another user updated this record. Refresh and retry." });
  const status = err.status || 500;
  if (status === 500)
    console.error("Request failed", {
      method: req.method,
      path: req.path,
      code: err.code || err.name,
    });
  res.status(status).json({
    error:
      status === 500 ? "Unexpected server error. Please retry." : err.message,
  });
});
