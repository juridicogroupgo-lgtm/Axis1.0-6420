import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { generateId, hashPassword, verifyPassword, generateToken } from "../lib/crypto";
import { requireAuth } from "../lib/auth-middleware";

export const authRoutes = new Hono()
  .post("/login", async (c) => {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ message: "Email e senha obrigatórios" }, 400);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
    if (!user || !user.active) return c.json({ message: "Credenciais inválidas" }, 401);

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return c.json({ message: "Credenciais inválidas" }, 401);

    // Clean old sessions
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await db.insert(schema.sessions).values({
      id: generateId(),
      userId: user.id,
      token,
      expiresAt,
    });

    // Audit
    await db.insert(schema.auditLogs).values({
      id: generateId(),
      userId: user.id,
      action: "login",
      payload: JSON.stringify({ email }),
      ip: c.req.header("x-forwarded-for") ?? "unknown",
    });

    const { passwordHash: _, ...safeUser } = user;
    return c.json({ token, user: safeUser }, 200);
  })

  .post("/logout", requireAuth, async (c) => {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token) {
      await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
    }
    return c.json({ message: "Logout realizado" }, 200);
  })

  .get("/me", requireAuth, async (c) => {
    const user = c.get("user") as typeof schema.users.$inferSelect;
    const { passwordHash: _, ...safeUser } = user;
    return c.json({ user: safeUser }, 200);
  })

  // Seed admin on first boot
  .post("/setup", async (c) => {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.role, "admin")).limit(1);
    if (existing) return c.json({ message: "Setup já realizado" }, 409);

    const { name, email, password } = await c.req.json();
    if (!name || !email || !password) return c.json({ message: "Campos obrigatórios" }, 400);

    const passwordHash = await hashPassword(password);
    const id = generateId();
    await db.insert(schema.users).values({
      id,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: "admin",
      active: true,
    });

    return c.json({ message: "Admin criado com sucesso" }, 201);
  })

  // Reset admin password — requires secret key via header X-Reset-Key
  .post("/reset-password", async (c) => {
    const resetKey = c.req.header("X-Reset-Key");
    const expectedKey = process.env.ADMIN_RESET_KEY ?? "axis-reset-2025";
    if (resetKey !== expectedKey) return c.json({ message: "Não autorizado" }, 401);

    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ message: "Campos obrigatórios" }, 400);

    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase())).limit(1);
    if (!user) return c.json({ message: "Usuário não encontrado" }, 404);

    const passwordHash = await hashPassword(password);
    await db.update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, user.id));

    return c.json({ message: "Senha redefinida com sucesso" });
  })

  // Change password (authenticated)
  .put("/password", requireAuth, async (c) => {
    const currentUser = c.get("user") as typeof schema.users.$inferSelect;
    const { senhaAtual, novaSenha } = await c.req.json();
    if (!senhaAtual || !novaSenha) return c.json({ message: "Campos obrigatórios" }, 400);

    const valid = await verifyPassword(senhaAtual, currentUser.passwordHash);
    if (!valid) return c.json({ message: "Senha atual incorreta" }, 400);

    if (novaSenha.length < 6) return c.json({ message: "Senha deve ter no mínimo 6 caracteres" }, 400);

    const passwordHash = await hashPassword(novaSenha);
    await db.update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, currentUser.id));

    return c.json({ message: "Senha alterada com sucesso" });
  });
