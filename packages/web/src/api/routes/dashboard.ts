import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, or, inArray, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

type UserRow = typeof schema.users.$inferSelect;

async function buildWhere(me: UserRow, extra?: any) {
  if (me.role === "admin") return extra;

  if (me.role === "gerente") {
    const stores = await db.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.managerId, me.id));
    const storeIds = stores.map(s => s.id);
    const filter = storeIds.length > 0
      ? or(eq(schema.proposals.managerId, me.id), inArray(schema.proposals.storeId, storeIds))
      : eq(schema.proposals.managerId, me.id);
    return extra ? and(filter, extra) : filter;
  }

  if (me.role === "loja") {
    const filter = eq(schema.proposals.storeId, me.storeId ?? "");
    return extra ? and(filter, extra) : filter;
  }

  const filter = eq(schema.proposals.digitadorId, me.id);
  return extra ? and(filter, extra) : filter;
}

export const dashboardRoutes = new Hono()
  .use("*", requireAuth)

  .get("/stats", async (c) => {
    const me = c.get("user") as UserRow;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const allProposals = await db.select().from(schema.proposals).where(await buildWhere(me));

    const paid = allProposals.filter(p => p.status === "PAGA");
    const paidToday = paid.filter(p => p.paidAt && p.paidAt >= todayStart);
    const paidMonth = paid.filter(p => p.paidAt && p.paidAt >= monthStart);
    const paidYear = paid.filter(p => p.paidAt && p.paidAt >= yearStart);

    const totalPaidToday = paidToday.reduce((s, p) => s + (p.amount ?? 0), 0);
    const totalPaidMonth = paidMonth.reduce((s, p) => s + (p.amount ?? 0), 0);
    const totalPaidYear = paidYear.reduce((s, p) => s + (p.amount ?? 0), 0);

    const byStatus = allProposals.reduce((acc: Record<string, number>, p) => {
      const s = p.statusPadronizado ?? p.status;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});

    // Daily production (last 30 days)
    const daily: Record<string, { count: number; amount: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily[key] = { count: 0, amount: 0 };
    }
    allProposals.forEach(p => {
      const key = (p.createdAt ?? new Date()).toISOString().slice(0, 10);
      if (daily[key]) {
        daily[key].count++;
        daily[key].amount += p.amount ?? 0;
      }
    });

    // Monthly (last 12 months)
    const monthly: Record<string, { count: number; amount: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = { count: 0, amount: 0 };
    }
    allProposals.forEach(p => {
      const d = p.createdAt ?? new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthly[key]) {
        monthly[key].count++;
        monthly[key].amount += p.amount ?? 0;
      }
    });

    // Funnel
    const funnelStages = ["EM DIGITAÇÃO", "ENVIADA", "EM ANÁLISE", "ASSINADA", "PAGA"];
    const funnel = funnelStages.map(stage => ({
      stage,
      count: allProposals.filter(p => (p.statusPadronizado ?? p.status) === stage).length,
    }));

    return c.json({
      cards: {
        paidToday: { count: paidToday.length, amount: totalPaidToday },
        paidMonth: { count: paidMonth.length, amount: totalPaidMonth },
        paidYear: { count: paidYear.length, amount: totalPaidYear },
        total: allProposals.length,
        byStatus,
      },
      daily: Object.entries(daily).map(([date, v]) => ({ date, ...v })),
      monthly: Object.entries(monthly).map(([month, v]) => ({ month, ...v })),
      funnel,
    }, 200);
  })

  .get("/ranking", async (c) => {
    const me = c.get("user") as UserRow;
    const where = await buildWhere(me);

    const proposals = await db.select().from(schema.proposals).where(where);

    // Group by digitador
    const byDigitador: Record<string, { id: string; count: number; amount: number }> = {};
    proposals.forEach(p => {
      if (!byDigitador[p.digitadorId]) byDigitador[p.digitadorId] = { id: p.digitadorId, count: 0, amount: 0 };
      byDigitador[p.digitadorId].count++;
      byDigitador[p.digitadorId].amount += p.amount ?? 0;
    });

    const digitadorIds = Object.keys(byDigitador);
    const users = digitadorIds.length > 0
      ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, digitadorIds))
      : [];

    const ranking = Object.values(byDigitador)
      .map(d => ({ ...d, name: users.find(u => u.id === d.id)?.name ?? "—" }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return c.json({ ranking }, 200);
  });
