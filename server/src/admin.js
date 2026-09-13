import { Router } from "express";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { db, atomic, audit, fail, D } from "./db.js";
import { admin, userSchema, userSelect } from "./auth.js";
import { z, text, decimal, serviceSchema, pageNumber } from "./validation.js";
export const management = Router();
management.use(admin);
management.get("/users", async (req, res) =>
  res.json(
    await db.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "asc" },
    }),
  ),
);
management.post("/users", async (req, res) => {
  const v = userSchema.parse(req.body);
  if (!v.password) fail(400, "Password is required");
  const passwordHash = await bcrypt.hash(v.password, 12);
  delete v.password;
  res.status(201).json(
    await atomic(async (tx) => {
      const u = await tx.user.create({
        data: { ...v, passwordHash },
        select: userSelect,
      });
      await audit(tx, req.user.id, "USER_CREATED", "User", u.id, {
        role: u.role,
      });
      return u;
    }),
  );
});
management.put("/users/:id", async (req, res) => {
  const v = userSchema.parse(req.body);
  const passwordHash = v.password
    ? await bcrypt.hash(v.password, 12)
    : undefined;
  delete v.password;
  res.json(
    await atomic(async (tx) => {
      const old = await tx.user.findUnique({ where: { id: req.params.id } });
      if (!old) fail(404, "User not found");
      if (
        old.role === "ADMIN" &&
        old.active &&
        (v.role !== "ADMIN" || !v.active) &&
        (await tx.user.count({ where: { role: "ADMIN", active: true } })) <= 1
      )
        fail(409, "Keep at least one active Admin");
      const u = await tx.user.update({
        where: { id: old.id },
        data: { ...v, passwordHash },
        select: userSelect,
      });
      await tx.session.deleteMany({ where: { userId: u.id } });
      await audit(tx, req.user.id, "USER_UPDATED", "User", u.id, {
        role: u.role,
        active: u.active,
        passwordChanged: !!passwordHash,
      });
      return u;
    }),
  );
});
management.post("/services", async (req, res) => {
  const v = serviceSchema.parse(req.body);
  res.status(201).json(
    await atomic(async (tx) => {
      const s = await tx.service.create({ data: v });
      await audit(tx, req.user.id, "SERVICE_PRICING_CHANGED", "Service", s.id, {
        operation: "created",
      });
      return s;
    }),
  );
});
management.put("/services/:id", async (req, res) => {
  const v = serviceSchema.parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const s = await tx.service.update({
        where: { id: req.params.id },
        data: v,
      });
      await audit(tx, req.user.id, "SERVICE_PRICING_CHANGED", "Service", s.id, {
        ...v,
      });
      return s;
    }),
  );
});
management.get("/services/:id/usage", async (req, res) =>
  res.json(
    await db.serviceInventoryUsage.findMany({
      where: { serviceId: req.params.id },
      include: { inventoryItem: true },
    }),
  ),
);
management.put("/services/:id/usage", async (req, res) => {
  const v = z
    .array(
      z.object({ inventoryItemId: text, quantityPerUnit: decimal(3) }).strict(),
    )
    .max(50)
    .parse(req.body);
  if (new Set(v.map((x) => x.inventoryItemId)).size !== v.length)
    fail(400, "Use each supply once");
  res.json(
    await atomic(async (tx) => {
      await tx.serviceInventoryUsage.deleteMany({
        where: { serviceId: req.params.id },
      });
      await tx.serviceInventoryUsage.createMany({
        data: v.map((x) => ({ ...x, serviceId: req.params.id })),
      });
      await audit(
        tx,
        req.user.id,
        "SERVICE_INVENTORY_USAGE_CHANGED",
        "Service",
        req.params.id,
        { count: v.length },
      );
      return { ok: true };
    }),
  );
});
const inventorySchema = z
  .object({
    name: text,
    unit: z.string().trim().min(1).max(30),
    lowStockThreshold: decimal(3, true),
    active: z.boolean().default(true),
  })
  .strict();
management.get("/inventory", async (req, res) =>
  res.json(
    (await db.inventoryItem.findMany({ orderBy: { name: "asc" } })).map(
      (i) => ({ ...i, low: i.stock.lte(i.lowStockThreshold) }),
    ),
  ),
);
management.post("/inventory", async (req, res) => {
  const v = inventorySchema.parse(req.body);
  res.status(201).json(
    await atomic(async (tx) => {
      const i = await tx.inventoryItem.create({ data: v });
      await audit(tx, req.user.id, "INVENTORY_CHANGED", "InventoryItem", i.id, {
        operation: "created",
      });
      return i;
    }),
  );
});
management.put("/inventory/:id", async (req, res) => {
  const v = inventorySchema.parse(req.body);
  res.json(
    await atomic(async (tx) => {
      const old = await tx.inventoryItem.findUnique({
        where: { id: req.params.id },
      });
      if (
        old &&
        old.unit !== v.unit &&
        (!old.stock.isZero() ||
          (await tx.inventoryTransaction.count({
            where: { itemId: old.id },
          })) ||
          (await tx.serviceInventoryUsage.count({
            where: { inventoryItemId: old.id },
          })))
      )
        fail(
          409,
          "Unit cannot change after stock movements or service mappings. Create a new supply instead.",
        );
      const i = await tx.inventoryItem.update({
        where: { id: req.params.id },
        data: v,
      });
      await audit(tx, req.user.id, "INVENTORY_CHANGED", "InventoryItem", i.id, {
        operation: "updated",
      });
      return i;
    }),
  );
});
management.get("/inventory/history", async (req, res) => {
  const page = pageNumber.parse(req.query.page),
    where = req.query.itemId ? { itemId: String(req.query.itemId) } : {};
  const [rows, total] = await Promise.all([
    db.inventoryTransaction.findMany({
      where,
      include: { item: true, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: (page - 1) * 50,
    }),
    db.inventoryTransaction.count({ where }),
  ]);
  res.json({ rows, total, page });
});
management.post("/inventory/:id/movement", async (req, res) => {
  const v = z
    .object({
      type: z.enum(["REPLENISHMENT", "CONSUMPTION", "ADJUSTMENT"]),
      quantity: z
        .union([z.string(), z.number()])
        .transform(String)
        .refine(
          (v) => /^-?\d{1,7}(\.\d{1,3})?$/.test(v) && Number(v) !== 0,
          "Non-zero quantity required",
        ),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(req.body);
  if (v.type !== "ADJUSTMENT" && new D(v.quantity).lte(0))
    fail(400, "Enter positive quantity for consumption or replenishment");
  res.json(
    await atomic(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: { id: req.params.id },
      });
      if (!item) fail(404, "Supply not found");
      const delta = new D(v.quantity).mul(v.type === "CONSUMPTION" ? -1 : 1),
        stock = item.stock.add(delta);
      if (stock.lt(0)) fail(409, "Stock cannot be negative");
      if (stock.gt("99999999999.999"))
        fail(400, "Stock exceeds the supported limit");
      const i = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { stock },
      });
      await tx.inventoryTransaction.create({
        data: {
          itemId: i.id,
          type: v.type,
          quantity: delta,
          stockAfter: stock,
          reason: v.reason,
          userId: req.user.id,
        },
      });
      await audit(tx, req.user.id, "INVENTORY_CHANGED", "InventoryItem", i.id, {
        type: v.type,
        quantity: delta.toString(),
        reason: v.reason,
      });
      return i;
    }),
  );
});
const expenseSchema = z
  .object({
    date: z.iso.date(),
    category: text,
    description: z.string().trim().min(1).max(500),
    amount: decimal(),
  })
  .strict();
management.get("/expenses", async (req, res) => {
  const page = pageNumber.parse(req.query.page);
  const [rows, total] = await Promise.all([
    db.expense.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 50,
      skip: (page - 1) * 50,
    }),
    db.expense.count(),
  ]);
  res.json({ rows, total, page });
});
for (const method of ["post", "put"])
  management[method](
    "/expenses" + (method === "put" ? "/:id" : ""),
    async (req, res) => {
      const v = expenseSchema.parse(req.body);
      res.json(
        await atomic(async (tx) => {
          const data = {
            ...v,
            date: new Date(v.date + "T00:00:00Z"),
            ...(method === "post" ? { userId: req.user.id } : {}),
          };
          const e =
            method === "post"
              ? await tx.expense.create({ data })
              : await tx.expense.update({ where: { id: req.params.id }, data });
          await audit(tx, req.user.id, "EXPENSE_CHANGED", "Expense", e.id, {
            operation: method,
            amount: v.amount,
          });
          return e;
        }),
      );
    },
  );
management.delete("/expenses/:id", async (req, res) =>
  res.json(
    await atomic(async (tx) => {
      const e = await tx.expense.delete({ where: { id: req.params.id } });
      await audit(tx, req.user.id, "EXPENSE_DELETED", "Expense", e.id, {
        amount: e.amount.toString(),
        category: e.category,
      });
      return { ok: true };
    }),
  ),
);
const settingSchema = z
  .object({
    name: text,
    timezone: z
      .string()
      .refine((v) => DateTime.now().setZone(v).isValid, "Invalid timezone"),
    regularHours: z.coerce.number().int().min(1).max(336),
    expressHours: z.coerce.number().int().min(1).max(168),
    windowHours: z.coerce.number().int().min(1).max(72),
  })
  .strict();
management.put("/settings", async (req, res) => {
  const value = settingSchema.parse(req.body);
  res.json(
    await atomic(async (tx) => {
      await tx.setting.upsert({
        where: { key: "business" },
        create: { key: "business", value },
        update: { value },
      });
      await audit(
        tx,
        req.user.id,
        "SETTINGS_CHANGED",
        "Setting",
        "business",
        value,
      );
      return value;
    }),
  );
});
management.get("/logs", async (req, res) => {
  const page = pageNumber.parse(req.query.page),
    q = z
      .string()
      .max(100)
      .parse(req.query.q || "");
  const where = q
    ? {
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { entityId: { contains: q } },
          { user: { name: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: (page - 1) * 50,
    }),
    db.auditLog.count({ where }),
  ]);
  res.json({ rows, total, page });
});
