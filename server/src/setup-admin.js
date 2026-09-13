import bcrypt from "bcryptjs";
import { z } from "./validation.js";
import { db, atomic, audit, fail } from "./db.js";
const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
const password = z.string().min(12).max(128).parse(process.env.ADMIN_PASSWORD);
const name = z
  .string()
  .min(1)
  .max(160)
  .parse(process.env.ADMIN_NAME || "Administrator");
const passwordHash = await bcrypt.hash(password, 12);
try {
  await atomic(async (tx) => {
    if ((await tx.user.count({ where: { role: "ADMIN" } })) > 0)
      fail(409, "An Admin already exists. Use Users management.");
    const u = await tx.user.create({
      data: { email, name, passwordHash, role: "ADMIN" },
    });
    await audit(tx, u.id, "USER_CREATED", "User", u.id, {
      source: "first-admin-setup",
    });
  });
  console.log(
    "First Admin created. Remove ADMIN_PASSWORD from the environment now.",
  );
} finally {
  await db.$disconnect();
}
