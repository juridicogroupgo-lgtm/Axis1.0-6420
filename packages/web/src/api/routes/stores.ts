import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { generateId } from "../lib/crypto";
import { requireAuth } from "../lib/auth-middleware";

type UserRow = typeof schema.users.$inferSelect;

export const storesRoutes = new Hono()
  .use("*", requireAuth)

  .get("/", async (c) => {
    const me = c.get("user") as UserRow;

    let stores;
    if (me.role === "admin") {
      stores = await db.select().from(schema.stores);
    } else if (me.role === "gerente") {
      stores = await db.select().from(schema.stores).where(eq(schema.stores.managerId, me.id));
    } else if (me.role === "loja") {
      stores = await db.select().from(schema.stores).where(eq(schema.stores.id, me.storeId ?? ""));
    } else {
      stores = [];
    }

    return c.json({ stores }, 200);
  })

  .post("/", async (c) => {
    const me = c.get("user") as UserRow;
    if (!["admin", "gerente"].includes(me.role)) {
      return c.json({ message: "Sem permissão" }, 403);
    }

    const { name, managerId } = await c.req.json();
    if (!name) return c.json({ message: "Nome obrigatório" }, 400);

    const id = generateId();
    const mgrId = me.role === "admin" ? (managerId ?? me.id) : me.id;

    await db.insert(schema.stores).values({ id, name, managerId: mgrId, active: true });
    return c.json({ message: "Loja criada", id }, 201);
  })

  .put("/:id", async (c) => {
    const me = c.get("user") as UserRow;
    if (!["admin", "gerente"].includes(me.role)) {
      return c.json({ message: "Sem permissão" }, 403);
    }

    const { id } = c.req.param();
    const { name, active } = await c.req.json();

    const updates: Partial<typeof schema.stores.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (active !== undefined) updates.active = active;

    await db.update(schema.stores).set(updates).where(eq(schema.stores.id, id));
    return c.json({ message: "Loja atualizada" }, 200);
  });
