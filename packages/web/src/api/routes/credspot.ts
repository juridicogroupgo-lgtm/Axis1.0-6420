import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { generateId } from "../lib/crypto";
import { createCredspotUser, createConsent, createMargin, createOffer, createContract } from "../services/credspot";

export const credspotRoutes = new Hono()
  .use("*", requireAuth)
  .get("/health", async (c) => c.json({ ok: true, provider: "Go Financeira" }, 200))
  .get("/proposals/:id", async (c) => {
    const { id } = c.req.param();
    const proposal = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    if (!proposal[0]) return c.json({ message: "Not found" }, 404);

    const [credUser] = await db.select().from(schema.credspotUsers).where(eq(schema.credspotUsers.proposalId, id)).orderBy(desc(schema.credspotUsers.createdAt)).limit(1);
    const [consent] = await db.select().from(schema.credspotConsents).where(eq(schema.credspotConsents.proposalId, id)).orderBy(desc(schema.credspotConsents.createdAt)).limit(1);
    const [margin] = await db.select().from(schema.credspotMargin).where(eq(schema.credspotMargin.proposalId, id)).orderBy(desc(schema.credspotMargin.createdAt)).limit(1);
    const offers = await db.select().from(schema.credspotOffers).where(eq(schema.credspotOffers.proposalId, id)).orderBy(desc(schema.credspotOffers.createdAt));
    const [contract] = await db.select().from(schema.credspotContracts).where(eq(schema.credspotContracts.proposalId, id)).orderBy(desc(schema.credspotContracts.createdAt)).limit(1);

    return c.json({ proposal: proposal[0], goFinanceira: { user: credUser, consent, margin, offers, contract } }, 200);
  })
  .post("/proposals/:id/select", async (c) => {
    const { id } = c.req.param();
    const { offerId } = await c.req.json();
    if (!offerId) return c.json({ message: "offerId obrigatório" }, 400);

    const [offer] = await db.select().from(schema.credspotOffers).where(eq(schema.credspotOffers.id, offerId)).limit(1);
    if (!offer) return c.json({ message: "Oferta não encontrada" }, 404);

    await db.update(schema.credspotOffers).set({ selected: false }).where(eq(schema.credspotOffers.proposalId, id));
    await db.update(schema.credspotOffers).set({ selected: true, updatedAt: new Date() }).where(eq(schema.credspotOffers.id, offerId));

    return c.json({ ok: true, provider: "Go Financeira", selectedOfferId: offerId }, 200);
  })
  .post("/proposals/:id/trigger", async (c) => {
    const { id } = c.req.param();
    const proposal = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    if (!proposal[0]) return c.json({ message: "Not found" }, 404);

    let credUser = await db.select().from(schema.credspotUsers).where(eq(schema.credspotUsers.proposalId, id)).limit(1);
    if (!credUser[0]) {
      const userData = await createCredspotUser({ name: proposal[0].customerName, document: proposal[0].cpf });
      const created = await db.insert(schema.credspotUsers).values({
        id: generateId(), proposalId: id, userUuid: userData?.data?.uuid ?? userData?.uuid ?? null,
        document: proposal[0].cpf, name: proposal[0].customerName, email: null, phone: null, birth: null, rawPayload: JSON.stringify(userData),
      }).returning();
      credUser = created;
    }

    const userRow = credUser[0];
    const consentData = await createConsent({ userUuid: userRow.userUuid ?? "" });
    const consent = await db.insert(schema.credspotConsents).values({
      id: generateId(), proposalId: id, credspotUserId: userRow.id,
      relationshipInquiryUuid: consentData?.data?.relationshipInquiryUuid ?? consentData?.relationshipInquiryUuid ?? null,
      consentLink: null,
      accepted: Boolean(consentData?.data?.accepted ?? consentData?.accepted),
      acceptedAt: consentData?.data?.acceptedAt ? new Date(consentData.data.acceptedAt) : null,
      expiresAt: consentData?.data?.expiresAt ? new Date(consentData.data.expiresAt) : null,
      eligible: Boolean(consentData?.data?.eligible ?? false),
      rawPayload: JSON.stringify(consentData),
    }).returning();

    return c.json({ ok: true, user: userRow, consent: consent[0], provider: "Go Financeira" }, 200);
  })
  .get("/proposals/:id/stream", async (c) => {
    const id = c.req.param("id");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = async () => {
          const [consent] = await db.select().from(schema.credspotConsents).where(eq(schema.credspotConsents.proposalId, id)).orderBy(desc(schema.credspotConsents.createdAt)).limit(1);
          const [margin] = await db.select().from(schema.credspotMargin).where(eq(schema.credspotMargin.proposalId, id)).orderBy(desc(schema.credspotMargin.createdAt)).limit(1);
          const offers = await db.select().from(schema.credspotOffers).where(eq(schema.credspotOffers.proposalId, id)).orderBy(desc(schema.credspotOffers.createdAt));
          controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify({ provider: "Go Financeira", consent, margin, offers })}\n\n`));
        };
        send();
        const interval = setInterval(send, 15000);
        c.req.raw.signal.addEventListener("abort", () => clearInterval(interval));
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  })
  .post("/webhooks", async (c) => {
    const payload = await c.req.json();
    const eventType = payload?.eventType ?? payload?.type ?? "unknown";
    await db.insert(schema.credspotWebhooks).values({
      id: generateId(), eventType, providerEventId: payload?.id ?? null, payload: JSON.stringify(payload), headers: JSON.stringify(Object.fromEntries(c.req.raw.headers.entries())),
    });
    return c.json({ ok: true, provider: "Go Financeira" }, 200);
  });
