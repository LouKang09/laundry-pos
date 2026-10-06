import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { seed } from "../prisma/seed.js";
import { periodRange } from "../src/reports.js";
if (process.env.NODE_ENV !== "test" || !process.env.TEST_DATABASE_URL)
  throw new Error(
    "Tests require NODE_ENV=test and TEST_DATABASE_URL pointing to a disposable database",
  );
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
  throw new Error("DATABASE_URL must equal TEST_DATABASE_URL");
const prefix = "test-" + crypto.randomBytes(6).toString("hex");
const password = crypto.randomBytes(20).toString("base64url");
const admin = request.agent(app),
  staff = request.agent(app);
let ac,
  sc,
  customer,
  kg,
  piece,
  unpaid,
  cashOrder,
  gcashOrder,
  adminUser,
  staffUser,
  supply;
const call = (agent, csrf, method, path, body) =>
  agent[method]("/api" + path)
    .set("x-csrf-token", csrf || "")
    .send(body);
before(async () => {
  await seed();
  const passwordHash = await bcrypt.hash(password, 12);
  if ((await db.user.count({ where: { role: "ADMIN" } })) === 0) {
    const oldKey = process.env.ADMIN_SETUP_KEY;
    process.env.ADMIN_SETUP_KEY = crypto.randomBytes(32).toString("hex");
    const available = await request(app)
      .get("/api/auth/setup-status")
      .expect(200);
    assert.equal(available.body.available, true);
    await request(app)
      .post("/api/auth/setup")
      .send({
        name: "Test Admin",
        email: prefix + "-admin@example.test",
        password,
        setupKey: process.env.ADMIN_SETUP_KEY,
      })
      .expect(201);
    adminUser = await db.user.findUnique({
      where: { email: prefix + "-admin@example.test" },
    });
    assert.notEqual(adminUser.passwordHash, password);
    if (oldKey === undefined) delete process.env.ADMIN_SETUP_KEY;
    else process.env.ADMIN_SETUP_KEY = oldKey;
  } else {
    adminUser = await db.user.create({
      data: {
        name: "Test Admin",
        email: prefix + "-admin@example.test",
        passwordHash,
        role: "ADMIN",
      },
    });
  }
  staffUser = await db.user.create({
    data: {
      name: "Test Staff",
      email: prefix + "-staff@example.test",
      passwordHash,
      role: "LAUNDRY_STAFF",
    },
  });
});
after(async () => {
  await db.$disconnect();
});
test("01 login, bad password, HttpOnly session and CSRF", async () => {
  await request(app)
    .post("/api/auth/login")
    .send({ email: adminUser.email, password: "wrong" })
    .expect(401);
  let r = await admin
    .post("/api/auth/login")
    .send({ email: adminUser.email, password })
    .expect(200);
  ac = r.body.csrfToken;
  assert.match(r.headers["set-cookie"][0], /HttpOnly/);
  assert(!JSON.stringify(r.body).includes("passwordHash"));
  r = await staff
    .post("/api/auth/login")
    .send({ email: staffUser.email, password })
    .expect(200);
  sc = r.body.csrfToken;
  await staff
    .post("/api/customers")
    .send({ name: "Blocked", phone: "09123456789" })
    .expect(403);
  await request(app).get("/api/orders").expect(401);
  await staff.get("/api/auth/me").expect(200);
});
test("02 staff registers and selects customer", async () => {
  const r = await call(staff, sc, "post", "/customers", {
    name: prefix + " Customer",
    phone: "0912 345 6789",
  }).expect(201);
  customer = r.body;
  assert.equal(customer.phone, "09123456789");
  const found = await staff.get("/api/customers?q=" + prefix).expect(200);
  assert(found.body.rows.some((c) => c.id === customer.id));
});
test("03 configure KG/piece services and decimal prices", async () => {
  let r = await call(admin, ac, "post", "/admin/services", {
    name: prefix + " Wash",
    unit: "KG",
    regularPrice: "40.15",
    expressPrice: "60.25",
    minimumQuantity: "7",
    active: true,
  }).expect(201);
  kg = r.body;
  r = await call(admin, ac, "post", "/admin/services", {
    name: prefix + " Comforter",
    unit: "PIECE",
    regularPrice: "180",
    expressPrice: "250",
    minimumQuantity: "1",
    active: true,
  }).expect(201);
  piece = r.body;
  await call(staff, sc, "post", "/admin/services", {
    name: "Forbidden",
  }).expect(403);
});
const orderBody = (items, payment) => ({
  requestKey: crypto.randomUUID(),
  customerId: customer.id,
  items,
  ...(payment ? { payment } : {}),
});
test("04 unpaid KG order applies minimum and is idempotent", async () => {
  const body = orderBody([
    { serviceId: kg.id, actualQuantity: "4.25", express: false },
  ]);
  let r = await call(staff, sc, "post", "/orders", body).expect(201);
  unpaid = r.body;
  assert.equal(unpaid.total, "281.05");
  assert.equal(unpaid.items[0].actualQuantity, "4.25");
  assert.equal(unpaid.items[0].billableQuantity, "7");
  assert.equal(unpaid.status, "RECEIVED");
  assert.equal(unpaid.paymentStatus, "UNPAID");
  assert.match(unpaid.orderNumber, /^L-\d{8}-\d+$/);
  r = await call(staff, sc, "post", "/orders", body).expect(201);
  assert.equal(r.body.id, unpaid.id);
});
test("05 paid Cash, piece based, regular pricing", async () => {
  const r = await call(
    staff,
    sc,
    "post",
    "/orders",
    orderBody([{ serviceId: piece.id, actualQuantity: "2", express: false }], {
      method: "CASH",
    }),
  ).expect(201);
  cashOrder = r.body;
  assert.equal(cashOrder.total, "360");
  assert.equal(cashOrder.paymentStatus, "PAID");
  assert.equal(cashOrder.payment.method, "CASH");
  await call(
    staff,
    sc,
    "post",
    "/orders",
    orderBody([{ serviceId: piece.id, actualQuantity: "1.5", express: false }]),
  ).expect(400);
});
test("06 paid GCash express, reference required and unique", async () => {
  const items = [
    { serviceId: kg.id, actualQuantity: "8.125", express: true },
    { serviceId: piece.id, actualQuantity: "1", express: true },
  ];
  await call(
    staff,
    sc,
    "post",
    "/orders",
    orderBody(items, { method: "GCASH" }),
  ).expect(400);
  const reference = prefix + "-GCASH";
  const r = await call(
    staff,
    sc,
    "post",
    "/orders",
    orderBody(items, { method: "GCASH", reference }),
  ).expect(201);
  gcashOrder = r.body;
  assert.equal(gcashOrder.total, "739.53");
  assert.equal(gcashOrder.items[0].total, "489.53");
  await call(
    staff,
    sc,
    "post",
    "/orders",
    orderBody(items, { method: "GCASH", reference }),
  ).expect(409);
});
test("07 prevent arbitrary edits, deletes, status skipping", async () => {
  await call(staff, sc, "put", "/orders/" + unpaid.id, { total: "1" }).expect(
    404,
  );
  await call(staff, sc, "delete", "/orders/" + unpaid.id).expect(404);
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/status", {
    status: "READY",
  }).expect(409);
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/status", {
    status: "CANCELLED",
    reason: "No longer needed",
  }).expect(403);
});
test("08 inventory replenish, adjust, map and atomic insufficient-stock rejection", async () => {
  let r = await call(admin, ac, "post", "/admin/inventory", {
    name: prefix + " Detergent",
    unit: "L",
    lowStockThreshold: "2",
    active: true,
  }).expect(201);
  supply = r.body;
  await call(admin, ac, "put", "/admin/services/" + kg.id + "/usage", [
    { inventoryItemId: supply.id, quantityPerUnit: "0.1" },
  ]).expect(200);
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/status", {
    status: "WASHING",
  }).expect(409);
  assert.equal(
    (await db.order.findUnique({ where: { id: unpaid.id } })).status,
    "RECEIVED",
  );
  await call(admin, ac, "post", "/admin/inventory/" + supply.id + "/movement", {
    type: "REPLENISHMENT",
    quantity: "10",
    reason: "Opening delivery",
  }).expect(200);
  await call(admin, ac, "post", "/admin/inventory/" + supply.id + "/movement", {
    type: "ADJUSTMENT",
    quantity: "-1",
    reason: "Damaged bottle",
  }).expect(200);
  await call(admin, ac, "post", "/admin/inventory/" + supply.id + "/movement", {
    type: "CONSUMPTION",
    quantity: "100",
    reason: "Too much",
  }).expect(409);
  await call(staff, sc, "post", "/admin/inventory/" + supply.id + "/movement", {
    type: "REPLENISHMENT",
    quantity: "5",
    reason: "Blocked",
  }).expect(403);
});
test("09 controlled workflow and notifications at three stages", async () => {
  for (const status of ["WASHING", "DRYING", "FOLDING", "READY"])
    await call(staff, sc, "post", "/orders/" + unpaid.id + "/status", {
      status,
    }).expect(200);
  const r = await staff.get("/api/orders/" + unpaid.id).expect(200);
  assert.equal(r.body.statusHistory.length, 5);
  assert.deepEqual(
    r.body.notifications.map((n) => n.stage),
    ["DRYING", "FOLDING", "READY"],
  );
  assert(r.body.notifications.every((n) => n.state === "PENDING" && !n.sentAt));
  const item = await db.inventoryItem.findUnique({ where: { id: supply.id } });
  assert.equal(item.stock.toString(), "8.575");
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/status", {
    status: "WASHING",
  }).expect(409);
});
test("10 block unpaid claim, receive payment, claim and log both actions", async () => {
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/status", {
    status: "CLAIMED",
  }).expect(409);
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/payment", {
    method: "CASH",
  }).expect(200);
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/payment", {
    method: "CASH",
  }).expect(409);
  const r = await call(staff, sc, "post", "/orders/" + unpaid.id + "/status", {
    status: "CLAIMED",
  }).expect(200);
  assert(r.body.claimedAt);
  assert.equal(r.body.status, "CLAIMED");
  const logs = await db.auditLog.findMany({ where: { entityId: unpaid.id } });
  assert(logs.some((l) => l.action === "PAYMENT_RECEIVED"));
  assert(logs.some((l) => l.metadata?.newStatus === "CLAIMED"));
});
test("11 private public tracking, secure QR token and receipt access", async () => {
  const r = await request(app)
    .get("/api/track/" + unpaid.trackingToken)
    .expect(200);
  assert.equal(r.body.orderNumber, unpaid.orderNumber);
  assert(!r.body.id);
  for (const k of [
    "customerName",
    "customerPhone",
    "total",
    "payment",
    "trackingToken",
    "userId",
  ])
    assert(!(k in r.body));
  await request(app)
    .get("/api/track/" + unpaid.id)
    .expect(400);
  await call(staff, sc, "post", "/orders/" + unpaid.id + "/receipt").expect(
    403,
  );
  const receipt = await call(
    admin,
    ac,
    "post",
    "/orders/" + unpaid.id + "/receipt",
  ).expect(200);
  assert.match(receipt.body.qr, /^data:image\/png;base64,/);
  assert(receipt.body.trackingUrl.endsWith(unpaid.trackingToken));
  assert.equal(receipt.body.copy, 1);
  const reprint = await call(
    admin,
    ac,
    "post",
    "/orders/" + unpaid.id + "/receipt",
  ).expect(200);
  assert.equal(reprint.body.copy, 2);
});
test("12 historical price snapshots survive service changes", async () => {
  await call(admin, ac, "put", "/admin/services/" + kg.id, {
    name: kg.name,
    unit: "KG",
    regularPrice: "99",
    expressPrice: "120",
    minimumQuantity: "8",
    active: true,
  }).expect(200);
  const r = await staff.get("/api/orders/" + unpaid.id).expect(200);
  assert.equal(r.body.total, "281.05");
  assert.equal(r.body.items[0].unitPrice, "40.15");
});
test("13 cancellation only Admin, unpaid and Received", async () => {
  const o = (
    await call(
      staff,
      sc,
      "post",
      "/orders",
      orderBody([{ serviceId: piece.id, actualQuantity: "1", express: false }]),
    ).expect(201)
  ).body;
  await call(admin, ac, "post", "/orders/" + o.id + "/status", {
    status: "CANCELLED",
    reason: "Customer changed plans",
  }).expect(200);
  await call(staff, sc, "post", "/orders/" + o.id + "/payment", {
    method: "CASH",
  }).expect(409);
  await call(staff, sc, "post", "/orders/" + o.id + "/status", {
    status: "RECEIVED",
  }).expect(409);
  await call(admin, ac, "post", "/orders/" + cashOrder.id + "/status", {
    status: "CANCELLED",
    reason: "Already paid",
  }).expect(409);
});
test("14 expenses, database reports, dashboard and scoped transaction searches", async () => {
  const day = DateTime.now().setZone("Asia/Manila").toISODate();
  await call(admin, ac, "post", "/admin/expenses", {
    date: day,
    category: "Utilities",
    description: prefix + " Water",
    amount: "125.55",
  }).expect(200);
  for (const period of ["Daily", "Weekly", "Monthly", "Yearly"]) {
    const r = await admin
      .get("/api/reports?period=" + period + "&date=" + day)
      .expect(200);
    assert(Number(r.body.grossSales) >= 1380.58);
    assert(r.body.services.some((s) => s.name === kg.name));
    assert(Number(r.body.expenses) >= 125.55);
    assert.equal(
      Number(r.body.estimatedProfit).toFixed(2),
      (Number(r.body.grossSales) - Number(r.body.expenses)).toFixed(2),
    );
  }
  const dashboard = await staff.get("/api/dashboard").expect(200);
  assert(dashboard.body.todayOrders >= 3);
  assert(dashboard.body.claimedToday >= 1);
  const history = await staff
    .get(
      "/api/orders?view=transactions&customerId=" +
        customer.id +
        "&q=" +
        prefix,
    )
    .expect(200);
  assert(history.body.rows.length >= 1);
  assert(history.body.rows.every((o) => o.status === "CLAIMED"));
  assert(history.body.rows.some((o) => o.id === unpaid.id));
  const pickup = await staff.get("/api/orders?view=pickup").expect(200);
  assert(pickup.body.rows.every((o) => o.status === "READY"));
  const active = await staff.get("/api/orders?view=orders").expect(200);
  assert(
    active.body.rows.every((o) =>
      ["RECEIVED", "WASHING", "DRYING", "FOLDING"].includes(o.status),
    ),
  );
  await admin.get("/api/admin/inventory/history").expect(200);
  await admin.get("/api/admin/logs").expect(200);
});
test("15 server-side staff restrictions across all admin APIs", async () => {
  for (const path of [
    "/admin/users",
    "/admin/inventory",
    "/admin/expenses",
    "/admin/logs",
    "/reports",
  ])
    await staff.get("/api" + path).expect(403);
  await call(staff, sc, "put", "/admin/settings", {}).expect(403);
  await call(staff, sc, "post", "/admin/users", {}).expect(403);
});
test("16 input validation, origin and audit secrets exclusion", async () => {
  await call(staff, sc, "post", "/customers", {
    name: "",
    phone: "hello",
  }).expect(400);
  await call(staff, sc, "post", "/orders", {
    ...orderBody([{ serviceId: kg.id, actualQuantity: "-1", express: false }]),
    total: "1",
  }).expect(400);
  await staff
    .post("/api/customers")
    .set("Origin", "https://evil.example")
    .set("x-csrf-token", sc)
    .send({ name: "Blocked", phone: "09123456789" })
    .expect(403);
  const logs = await db.auditLog.findMany({
    where: { userId: { in: [adminUser.id, staffUser.id] } },
  });
  assert(!JSON.stringify(logs).includes(password));
  assert(!JSON.stringify(logs).includes("passwordHash"));
  assert(logs.some((l) => l.action === "TRANSACTION_VIEWED"));
  assert(logs.some((l) => l.action === "TRANSACTION_REPRINTED"));
});
test("17 Monday week boundaries and year rollover", () => {
  const { from, to } = periodRange("Weekly", "2026-01-01", "Asia/Manila");
  assert.equal(from.toISODate(), "2025-12-29");
  assert.equal(to.toISODate(), "2026-01-05");
});
test("18 logout revokes server session", async () => {
  await call(staff, sc, "post", "/auth/logout").expect(200);
  await staff.get("/api/auth/me").expect(401);
  assert(
    await db.auditLog.count({
      where: { userId: staffUser.id, action: "LOGOUT" },
    }),
  );
});

test("19 malformed pagination and phone digits rejected", async () => {
  await admin.get("/api/orders?page=Infinity").expect(400);
  await admin.get("/api/admin/expenses?page=1.5").expect(400);
  await call(admin, ac, "post", "/customers", {
    name: "Invalid phone",
    phone: "-------",
  }).expect(400);
});
test("20 health and static production route availability", async () => {
  const health = await request(app).get("/health").expect(200);
  assert.equal(health.body.database, "connected");
  const page = await request(app).get("/").expect(200);
  assert.match(page.text, /<div id="root"><\/div>/);
  await request(app)
    .get("/track/" + unpaid.trackingToken)
    .expect(200);
});

test("21 admin cannot create orders; simultaneous payments produce one payment", async () => {
  const body = orderBody([
    { serviceId: piece.id, actualQuantity: "1", express: false },
  ]);
  await call(admin, ac, "post", "/orders", body).expect(403);
  const order = (await call(staff, sc, "post", "/orders", body).expect(201))
    .body;
  const results = await Promise.all([
    call(admin, ac, "post", "/orders/" + order.id + "/payment", {
      method: "CASH",
    }),
    call(admin, ac, "post", "/orders/" + order.id + "/payment", {
      method: "CASH",
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await db.payment.count({ where: { orderId: order.id } }), 1);
});
test("22 disabled users lose sessions and cannot sign in", async () => {
  const tempEmail = prefix + "-disabled@example.test";
  const temp = (
    await call(admin, ac, "post", "/admin/users", {
      name: "Temporary staff",
      email: tempEmail,
      password,
      role: "LAUNDRY_STAFF",
      active: true,
    }).expect(201)
  ).body;
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ email: tempEmail, password })
    .expect(200);
  await call(admin, ac, "put", "/admin/users/" + temp.id, {
    name: temp.name,
    email: tempEmail,
    role: "LAUNDRY_STAFF",
    active: false,
  }).expect(200);
  await agent.get("/api/auth/me").expect(401);
  await agent
    .post("/api/auth/login")
    .send({ email: tempEmail, password })
    .expect(401);
});

test("23 first-admin setup rejects missing key and closes after setup", async () => {
  const old = process.env.ADMIN_SETUP_KEY;
  process.env.ADMIN_SETUP_KEY = "test-only-setup-key-123456789";
  const payload = {
    name: "Blocked Admin",
    email: "blocked@example.test",
    password,
    setupKey: "wrong",
  };
  await request(app).post("/api/auth/setup").send(payload).expect(403);
  const status = await request(app).get("/api/auth/setup-status").expect(200);
  assert.equal(status.body.available, false);
  await request(app)
    .post("/api/auth/setup")
    .send({ ...payload, setupKey: process.env.ADMIN_SETUP_KEY })
    .expect(409);
  if (old === undefined) delete process.env.ADMIN_SETUP_KEY;
  else process.env.ADMIN_SETUP_KEY = old;
});
