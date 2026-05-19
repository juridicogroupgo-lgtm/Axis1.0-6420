import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { generateId, hashPassword } from "../lib/crypto";
import { requireAuth } from "../lib/auth-middleware";

type UserRow = typeof schema.users.$inferSelect;

export const usersRoutes = new Hono()
  .use("*", requireAuth)

  .get("/", async (c) => {
    const me = c.get("user") as UserRow;

    let users: UserRow[];

    if (me.role === "admin") {
      users = await db.select().from(schema.users);
    } else if (me.role === "gerente") {
      // Get all stores for this manager
      const stores = await db.select().from(schema.stores).where(eq(schema.stores.managerId, me.id));
      const storeIds = stores.map(s => s.id);
      // Users under this manager's stores + himself
      users = await db.select().from(schema.users).where(
        or(
          eq(schema.users.managerId, me.id),
          storeIds.length > 0 ? inArray(schema.users.storeId, storeIds) : undefined
        )
      );
    } else if (me.role === "loja") {
      users = await db.select().from(schema.users).where(eq(schema.users.storeId, me.storeId ?? ""));
    } else {
      users = [me];
    }

    const safe = users.map(({ passwordHash, ...u }) => u);
    return c.json({ users: safe }, 200);
  })

  .post("/", async (c) => {
    const me = c.get("user") as UserRow;
    if (!["admin", "gerente", "loja"].includes(me.role)) {
      return c.json({ message: "Sem permissão" }, 403);
    }

    const body = await c.req.json();
    const { name, email, password, role, managerId, storeId } = body;

    if (!name || !email || !password || !role) {
      return c.json({ message: "Campos obrigatórios" }, 400);
    }

    // Role restrictions
    if (me.role === "gerente" && !["loja", "digitador"].includes(role)) {
      return c.json({ message: "Gerente só pode criar loja ou digitador" }, 403);
    }
    if (me.role === "loja" && role !== "digitador") {
      return c.json({ message: "Loja só pode criar digitador" }, 403);
    }

    // Check for duplicate email
    const existing = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return c.json({ message: "E-mail já cadastrado" }, 409);
    }

    const passwordHash = await hashPassword(password);
    const id = generateId();

    await db.insert(schema.users).values({
      id,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      managerId: managerId ?? (me.role === "gerente" ? me.id : me.managerId),
      storeId: storeId ?? (me.role === "loja" ? me.storeId : undefined),
      active: true,
    });

    await db.insert(schema.auditLogs).values({
      id: generateId(),
      userId: me.id,
      action: "create_user",
      payload: JSON.stringify({ targetEmail: email, role }),
    });

    return c.json({ message: "Usuário criado" }, 201);
  })

  .put("/:id", async (c) => {
    const me = c.get("user") as UserRow;
    if (!["admin", "gerente", "loja"].includes(me.role)) {
      return c.json({ message: "Sem permissão" }, 403);
    }

    const { id } = c.req.param();
    const body = await c.req.json();
    const { name, email, role, active, storeId, managerId, password } = body;

    const updates: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase();
    if (role !== undefined) updates.role = role;
    if (active !== undefined) updates.active = active;
    if (storeId !== undefined) updates.storeId = storeId || null;
    if (managerId !== undefined) updates.managerId = managerId || null;
    if (password) updates.passwordHash = await hashPassword(password);

    await db.update(schema.users).set(updates).where(eq(schema.users.id, id));

    return c.json({ message: "Usuário atualizado" }, 200);
  })

  .delete("/:id", async (c) => {
    const me = c.get("user") as UserRow;
    if (me.role !== "admin") return c.json({ message: "Sem permissão" }, 403);

    const { id } = c.req.param();
    await db.update(schema.users).set({ active: false }).where(eq(schema.users.id, id));
    return c.json({ message: "Usuário desativado" }, 200);
  });
