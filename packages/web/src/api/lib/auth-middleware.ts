import { createMiddleware } from "hono/factory";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, gt } from "drizzle-orm";

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  const [session] = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.token, token),
        gt(schema.sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});

export const requireAuth = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ message: "Não autorizado" }, 401);
  return next();
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") return c.json({ message: "Acesso negado" }, 403);
  return next();
});
