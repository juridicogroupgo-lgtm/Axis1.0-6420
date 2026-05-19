import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, or, inArray, desc, gte, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { maskTableName } from "../lib/maskTableName";

type UserRow = typeof schema.users.$inferSelect;

async function getWhere(me: UserRow, filters: any) {
  const conditions: any[] = [];

  // Hierarchy filter
  if (me.role === "gerente") {
    conditions.push(eq(schema.proposals.managerId, me.id));
  } else if (me.role === "loja") {
    conditions.push(eq(schema.proposals.storeId, me.storeId ?? ""));
  } else if (me.role === "digitador") {
    conditions.push(eq(schema.proposals.digitadorId, me.id));
  }

  // Additional filters
  if (filters.status) conditions.push(eq(schema.proposals.status, filters.status));
  if (filters.digitadorId) conditions.push(eq(schema.proposals.digitadorId, filters.digitadorId));
  if (filters.storeId) conditions.push(eq(schema.proposals.storeId, filters.storeId));
  if (filters.managerId) conditions.push(eq(schema.proposals.managerId, filters.managerId));
  if (filters.from) conditions.push(gte(schema.proposals.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(schema.proposals.createdAt, new Date(filters.to)));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function formatCurrency(v: number | null) {
  if (!v) return "R$ 0,00";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export const reportsRoutes = new Hono()
  .use("*", requireAuth)

  .get("/", async (c) => {
    const me = c.get("user") as UserRow;
    const filters = c.req.query();
    const where = await getWhere(me, filters);

    const proposals = await db.select().from(schema.proposals)
      .where(where)
      .orderBy(desc(schema.proposals.createdAt))
      .limit(1000);

    // Enrich with user names
    const userIds = [...new Set(proposals.flatMap(p => [p.digitadorId, p.storeId, p.managerId].filter(Boolean)))];
    const users = userIds.length > 0
      ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
          .where(inArray(schema.users.id, userIds as string[]))
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const storeIds = [...new Set(proposals.map(p => p.storeId).filter(Boolean))];
    const stores = storeIds.length > 0
      ? await db.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores)
          .where(inArray(schema.stores.id, storeIds as string[]))
      : [];
    const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]));

    const rows = proposals.map(p => ({
      id: p.id,
      contractNumber: p.contractNumber ?? "—",
      customerName: p.customerName ?? "—",
      cpf: p.cpf,
      amount: p.amount,
      installmentValue: p.installmentValue,
      installments: p.installments,
      rate: p.rate,
      tableName: maskTableName(p.tableName),
      fund: p.fundName, // always masked
      status: p.statusPadronizado ?? p.status,
      digitador: userMap[p.digitadorId] ?? "—",
      store: p.storeId ? storeMap[p.storeId] ?? "—" : "—",
      manager: p.managerId ? userMap[p.managerId] ?? "—" : "—",
      paidAt: p.paidAt ? p.paidAt.toLocaleString("pt-BR") : "—",
      createdAt: (p.createdAt ?? new Date()).toLocaleString("pt-BR"),
    }));

    return c.json({ rows, total: rows.length }, 200);
  })

  .get("/export", async (c) => {
    const me = c.get("user") as UserRow;
    const filters = c.req.query();
    const format = filters.format ?? "csv";
    const where = await getWhere(me, filters);

    const proposals = await db.select().from(schema.proposals).where(where).orderBy(desc(schema.proposals.createdAt));

    const headers = [
      "Contrato", "Cliente", "CPF", "Valor Liberado", "Prazo", "Parcela", "Taxa",
      "Tabela", "Fundo", "Status", "Digitador", "Loja", "Gerente", "Data Pagamento", "Data Criação"
    ];

    const userIds = [...new Set(proposals.flatMap(p => [p.digitadorId, p.managerId].filter(Boolean)))];
    const users = userIds.length > 0
      ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
          .where(inArray(schema.users.id, userIds as string[]))
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const storeIds = [...new Set(proposals.map(p => p.storeId).filter(Boolean))];
    const stores = storeIds.length > 0
      ? await db.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores)
          .where(inArray(schema.stores.id, storeIds as string[]))
      : [];
    const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]));

    const rows = proposals.map(p => [
      p.contractNumber ?? "",
      p.customerName ?? "",
      p.cpf,
      formatCurrency(p.amount),
      p.installments ?? "",
      formatCurrency(p.installmentValue),
      p.rate ? `${p.rate}%` : "",
      maskTableName(p.tableName),
      p.fundName,
      p.statusPadronizado ?? p.status,
      userMap[p.digitadorId] ?? "",
      p.storeId ? storeMap[p.storeId] ?? "" : "",
      p.managerId ? userMap[p.managerId] ?? "" : "",
      p.paidAt ? p.paidAt.toLocaleDateString("pt-BR") : "",
      (p.createdAt ?? new Date()).toLocaleDateString("pt-BR"),
    ]);

    if (format === "csv") {
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="relatorio-axis-capital-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // Return JSON for XLSX (frontend handles actual XLSX generation)
    return c.json({ headers, rows }, 200);
  })

  .get("/audit", async (c) => {
    const me = c.get("user") as UserRow;
    if (me.role !== "admin") return c.json({ message: "Acesso negado" }, 403);

    const logs = await db.select().from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(500);

    const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
    const users = userIds.length > 0
      ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
          .where(inArray(schema.users.id, userIds as string[]))
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const enriched = logs.map(l => ({
      ...l,
      userName: l.userId ? userMap[l.userId] ?? "—" : "—",
      payload: l.payload ? JSON.parse(l.payload) : null,
    }));

    return c.json({ logs: enriched }, 200);
  });
