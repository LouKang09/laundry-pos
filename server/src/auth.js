import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, atomic, audit, fail } from "./db.js";
import { z, text } from "./validation.js";
import { rateLimit } from "express-rate-limit";
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
};
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge: 12 * 60 * 60 * 1000,
};
export async function authenticate(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: "Please sign in" });
  const session = await db.session.findUnique({
    where: { id: hash(token) },
    include: { user: { select: userSelect } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    return res
      .status(401)
      .json({ error: "Session expired. Please sign in again." });
  req.user = session.user;
  req.session = session;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("x-csrf-token") !== session.csrfToken
  )
    return res
      .status(403)
      .json({ error: "Security token expired. Refresh and try again." });
  next();
}
export function admin(req, res, next) {
  if (req.user.role !== "ADMIN")
    return res.status(403).json({ error: "Admin access required" });
  next();
}
export function authRoutes(app) {
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      skip: () => process.env.NODE_ENV === "test",
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const { email, password } = z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
      const user = await db.user.findUnique({ where: { email } });
      const valid = await bcrypt.compare(
        password,
        user?.passwordHash ||
          "$2b$12$SKRwHdMWrOkETlHoxsxITewpmqkrAbCIuSRLC/5.rsiC7IKKpGC2K",
      );
      if (!user?.active || !valid) fail(401, "Incorrect email or password");
      const token = crypto.randomBytes(32).toString("hex"),
        csrfToken = crypto.randomBytes(32).toString("hex");
      await atomic(async (tx) => {
        await tx.session.create({
          data: {
            id: hash(token),
            userId: user.id,
            csrfToken,
            expiresAt: new Date(Date.now() + cookieOptions.maxAge),
          },
        });
        await audit(tx, user.id, "LOGIN", "User", user.id);
      });
      res.cookie("session", token, cookieOptions).json({
        user: Object.fromEntries(
          Object.keys(userSelect).map((k) => [k, user[k]]),
        ),
        csrfToken,
      });
    },
  );
  app.get("/api/auth/me", authenticate, (req, res) =>
    res.json({ user: req.user, csrfToken: req.session.csrfToken }),
  );
  app.post("/api/auth/logout", authenticate, async (req, res) => {
    await atomic(async (tx) => {
      await tx.session.delete({ where: { id: req.session.id } });
      await audit(tx, req.user.id, "LOGOUT", "User", req.user.id);
    });
    res
      .clearCookie("session", { ...cookieOptions, maxAge: undefined })
      .json({ ok: true });
  });
}
export const userSchema = z
  .object({
    name: text,
    email: z.email().transform((v) => v.toLowerCase()),
    role: z.enum(["ADMIN", "LAUNDRY_STAFF"]),
    active: z.boolean().default(true),
    password: z.string().min(12).max(128).optional(),
  })
  .strict();
