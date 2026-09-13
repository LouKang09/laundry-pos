import { app } from "./app.js";
import { db } from "./db.js";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (
  process.env.NODE_ENV === "production" &&
  !process.env.APP_URL?.startsWith("https://")
)
  throw new Error("Set APP_URL to the HTTPS production URL");
await db.$connect();
const server = app.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
  console.log("Laundry POS listening"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
