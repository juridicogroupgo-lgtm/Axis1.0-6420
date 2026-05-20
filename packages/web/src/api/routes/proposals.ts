import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, or, inArray, desc, gte, lte, sql } from "drizzle-orm";
import { generateId } from "../lib/crypto";
import { requireAuth } from "../lib/auth-middleware";
import * as gf from "../services/gofintech";
import { DuplicateProposalError } from "../services/gofintech";
import { maskTableName } from "../lib/maskTableName";

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "033": "Santander", "104": "Caixa Econômica", "237": "Bradesco",
  "341": "Itaú Unibanco", "077": "Inter", "260": "Nubank", "756": "Sicoob",
  "748": "Sicredi", "422": "Safra", "070": "BRB", "085": "Ailos",
  "336": "C6 Bank", "197": "Stone", "212": "Banco Original", "389": "Mercantil",
};

type UserRow = typeof schema.users.$inferSelect;

async function getProposalFilter(me: UserRow) {
  if (me.role === "admin") return undefined;

  if (me.role === "gerente") {
    const stores = await db.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.managerId, me.id));
    const storeIds = stores.map(s => s.id);
    const users = await db.select({ id: schema.users.id }).from(schema.users).where(
      or(
        eq(schema.users.managerId, me.id),
        storeIds.length > 0 ? inArray(schema.users.storeId, storeIds) : undefined
      )
    );
    const userIds = users.map(u => u.id);
    return userIds.length > 0 ? inArray(schema.proposals.digitadorId, [...userIds, me.id]) : eq(schema.proposals.managerId, me.id);
  }

  if (me.role === "loja") {
    return eq(schema.proposals.storeId, me.storeId ?? "");
  }

  return eq(schema.proposals.digitadorId, me.id);
}

export const proposalsRoutes = new Hono()
  .use("*", requireAuth)

  // List terms (CPF consultations) with hierarchy filter — for Nova Proposta esteira
  .get("/terms", async (c) => {
    const me = c.get("user") as UserRow;

    let termRows: (typeof schema.terms.$inferSelect)[];

    if (me.role === "admin") {
      termRows = await db.select().from(schema.terms).orderBy(desc(schema.terms.createdAt)).limit(100);
    } else if (me.role === "gerente") {
      const stores = await db.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.managerId, me.id));
      const storeIds = stores.map(s => s.id);
      const subUsers = await db.select({ id: schema.users.id }).from(schema.users).where(
        or(
          eq(schema.users.managerId, me.id),
          storeIds.length > 0 ? inArray(schema.users.storeId, storeIds) : undefined
        )
      );
      const userIds = [...subUsers.map(u => u.id), me.id];
      termRows = await db.select().from(schema.terms)
        .where(inArray(schema.terms.digitadorId, userIds))
        .orderBy(desc(schema.terms.createdAt)).limit(100);
    } else if (me.role === "loja") {
      const subUsers = await db.select({ id: schema.users.id }).from(schema.users).where(
        eq(schema.users.storeId, me.storeId ?? "")
      );
      const userIds = [...subUsers.map(u => u.id), me.id];
      termRows = await db.select().from(schema.terms)
        .where(inArray(schema.terms.digitadorId, userIds))
        .orderBy(desc(schema.terms.createdAt)).limit(100);
    } else {
      termRows = await db.select().from(schema.terms)
        .where(eq(schema.terms.digitadorId, me.id))
        .orderBy(desc(schema.terms.createdAt)).limit(100);
    }

    // ── Auto-sync pending terms with GoFintech (background, non-blocking) ────
    const pendingTerms = termRows.filter(t => t.status === "criada" || t.status === "processando");
    if (pendingTerms.length > 0) {
      // Fire-and-forget: don't await, response is immediate from DB
      Promise.allSettled(pendingTerms.map(async (term) => {
        try {
          const termos = await gf.listarTermos({ cpf: term.cpf, per_page: 10 });
          // GoFintech returns Laravel paginator: { data: { data: [...] } }
          const items: any[] = termos?.data?.data ?? termos?.data ?? (Array.isArray(termos) ? termos : []);
          const match = items.find((t: any) =>
            t.solicitacao_id === term.externalUuid ||
            t.cliente_cpf === term.cpf ||
            t.cpf === term.cpf
          ) ?? (items.length === 1 ? items[0] : null);

          if (match) {
            const rawStatus = match.solicitacao_status ?? match.status ?? match.situacao ?? term.status;
            const clienteUuid = match.cliente_id ?? match.cliente_uuid ?? match.cliente?.uuid ?? match.clienteUuid ?? term.clienteUuid;
            const saldoId = match.saldo_id ?? match.saldo?.id ?? match.saldoId ?? term.saldoId;
            // Correct: only elegivel when solicitacao_status="elegivel" AND saldo_id present
            let newStatus = gf.normalizarStatusTermo(rawStatus);
            if (rawStatus === "processando") newStatus = "processando";
            if (newStatus === "elegivel" && !saldoId) newStatus = "processando";
            // Margem zero = inelegível
            // GF CLT termos: saldo_available_margin_value; simulacoes: saldo_margem
            const autoMargem = match.saldo_available_margin_value ?? match.saldo_margem ?? match.margem ?? match.margem_disponivel ?? match.saldo?.margem ?? null;
            if (newStatus === "elegivel" && autoMargem != null && Number(autoMargem) <= 0) newStatus = "inelegivel";
            if (newStatus === "elegivel" && match.saldo_elegivel === false) newStatus = "inelegivel";
            // Motivo field
            const autoMotivo = String(match.motivo ?? match.motivo_inelegibilidade ?? "").toLowerCase();
            if (autoMotivo.includes("ineleg") || autoMotivo.includes("sem margem")) newStatus = "inelegivel";
            if (newStatus === "processando" && Array.isArray(match.fases) && match.fases.length > 0) {
              const anyInelegivel = match.fases.some((f: any) =>
                ["inelegivel", "reprovado", "sem margem", "bloqueado"].some(kw =>
                  String(f.status ?? "").toLowerCase().includes(kw)
                )
              );
              if (anyInelegivel) newStatus = "inelegivel";
            }

            await db.update(schema.terms).set({
              status: newStatus,
              clienteUuid: clienteUuid ?? term.clienteUuid,
              saldoId: saldoId ?? term.saldoId,
              rawPayload: JSON.stringify(match),
              updatedAt: new Date(),
            }).where(eq(schema.terms.id, term.id));
          }
        } catch {
          // silently ignore
        }
      }));
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch digitador names
    const digitadorIds = [...new Set(termRows.map(t => t.digitadorId))];
    const digitadores = digitadorIds.length > 0
      ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
          .where(inArray(schema.users.id, digitadorIds))
      : [];
    const digitadorMap = Object.fromEntries(digitadores.map(d => [d.id, d.name]));

    // Fetch proposals linked to these terms
    const termIds = termRows.map(t => t.id);
    const linkedProposals = termIds.length > 0
      ? await db.select({ termId: schema.proposals.termId, id: schema.proposals.id, status: schema.proposals.status, customerName: schema.proposals.customerName })
          .from(schema.proposals).where(inArray(schema.proposals.termId, termIds))
      : [];
    const proposalMap = Object.fromEntries(linkedProposals.map(p => [p.termId, p]));

    const terms = termRows.map(t => ({
      ...t,
      digitadorName: digitadorMap[t.digitadorId] ?? "—",
      proposal: proposalMap[t.id] ?? null,
    }));

    return c.json({ terms }, 200);
  })

  // List proposals with hierarchy filter
  .get("/", async (c) => {
    const me = c.get("user") as UserRow;
    const filter = await getProposalFilter(me);

    const proposals = await db.select().from(schema.proposals)
      .where(filter)
      .orderBy(desc(schema.proposals.createdAt))
      .limit(200);

    // Auto-sync non-final proposals that have an externalUuid
    const FINAL = new Set(["PAGA", "CANCELADA", "REPROVADA"]);
    const toSync = proposals.filter(p => p.externalUuid && !FINAL.has(p.status));

    if (toSync.length > 0) {
      await Promise.allSettled(toSync.map(async (proposal) => {
        try {
          const [esteira, operacao] = await Promise.all([
            gf.getOperacaoEsteira(proposal.externalUuid!),
            gf.getOperacao(proposal.externalUuid!),
          ]);
          const rawStatus = operacao?.status ?? esteira?.status;
          if (!rawStatus) return;
          const newStatus = gf.normalizarStatus(rawStatus);
          const rawSigUrl = operacao?.formalizacao ?? operacao?.url_assinatura ?? operacao?.link_assinatura ?? esteira?.url_assinatura;

          // Guard: never store consultationUrl as signatureUrl
          let signatureUrl = rawSigUrl ?? null;
          if (signatureUrl && proposal.termId) {
            const [term] = await db.select({ consultationUrl: schema.terms.consultationUrl })
              .from(schema.terms).where(eq(schema.terms.id, proposal.termId)).limit(1);
            if (term?.consultationUrl && signatureUrl === term.consultationUrl) {
              console.error("[sync][BUG] signatureUrl === consultationUrl — skipping");
              signatureUrl = null;
            }
          }

          if (newStatus !== proposal.status || (signatureUrl && !proposal.signatureUrl)) {
            await db.update(schema.proposals).set({
              status: newStatus,
              statusPadronizado: newStatus,
              signatureUrl: signatureUrl ?? proposal.signatureUrl,
              paidAt: newStatus === "PAGA" ? new Date() : proposal.paidAt,
              updatedAt: new Date(),
            }).where(eq(schema.proposals.id, proposal.id));
            // Update in-memory list too
            const idx = proposals.findIndex(p => p.id === proposal.id);
            if (idx !== -1) proposals[idx] = { ...proposals[idx], status: newStatus, statusPadronizado: newStatus };
          }
        } catch {/* silent — don't fail the whole request */}
      }));
    }

    // Mask signatureUrl in list — return /sign/:id instead of provider URL
    const maskedProposals = proposals.map(p => ({
      ...p,
      signatureUrl: p.signatureUrl ? `/sign/${p.id}` : null,
    }));

    return c.json({ proposals: maskedProposals }, 200);
  })

  // Get single proposal
  .get("/:id", async (c) => {
    const me = c.get("user") as UserRow;
    const { id } = c.req.param();

    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    if (!proposal) return c.json({ message: "Proposta não encontrada" }, 404);

    // Check visibility
    if (me.role === "digitador" && proposal.digitadorId !== me.id) {
      return c.json({ message: "Acesso negado" }, 403);
    }

    const history = await db.select().from(schema.proposalStatusHistory)
      .where(eq(schema.proposalStatusHistory.proposalId, id))
      .orderBy(desc(schema.proposalStatusHistory.createdAt));

    // Mask signatureUrl — never expose provider URL to frontend
    const maskedProposal = {
      ...proposal,
      signatureUrl: proposal.signatureUrl ? `/sign/${id}` : null,
    };

    return c.json({ proposal: maskedProposal, history }, 200);
  })

  // STEP 1: Start flow — CPF → generate term automatically
  .post("/start", async (c) => {
    const me = c.get("user") as UserRow;
    const { cpf } = await c.req.json();

    if (!cpf || !/^\d{11}$/.test(cpf)) {
      return c.json({ message: "CPF inválido. Use 11 dígitos." }, 400);
    }

    // Generate term via Go Fintech
    let termoResult;
    try {
      termoResult = await gf.gerarTermo(cpf);
    } catch (err: any) {
      return c.json({ message: "Erro ao gerar termo de autorização", detail: err.message }, 502);
    }

    // Save term locally
    // Extract consultation URL from gerarTermo response (eligibility step only)
    // This is SEPARATE from the formalization URL (operacao.formalizacao) — never conflate the two
    const consultationUrl: string | null = termoResult?.urls?.[0] ?? termoResult?.url ?? null;
    if (consultationUrl) console.log("[gerarTermo] consultationUrl:", consultationUrl);

    const termId = generateId();
    await db.insert(schema.terms).values({
      id: termId,
      cpf,
      externalUuid: termoResult?.termo_uuid ?? termoResult?.solicitacao_id ?? termoResult?.uuid ?? termoResult?.id,
      clienteUuid: termoResult?.cliente_id ?? termoResult?.cliente_uuid ?? termoResult?.cliente?.uuid,
      saldoId: termoResult?.saldo_id ?? termoResult?.saldo?.id,
      status: termoResult?.solicitacao_status ?? termoResult?.status ?? "criada",
      consultationUrl, // eligibility-step URL — stored separately, never used as formalization link
      rawPayload: JSON.stringify(termoResult),
      digitadorId: me.id,
      storeId: me.storeId,
      managerId: me.managerId,
    });

    await db.insert(schema.auditLogs).values({
      id: generateId(),
      userId: me.id,
      action: "start_proposal",
      payload: JSON.stringify({ cpf, termId, termoResult }),
    });

    return c.json({
      termId,
      status: termoResult?.solicitacao_status ?? "criada",
      requiresManualData: termoResult?.requires_manual_data === true,
      message: "Termo gerado. Aguardando consulta de elegibilidade.",
    }, 201);
  })

  // STEP 1b: Manual term data
  .post("/term-manual", async (c) => {
    const me = c.get("user") as UserRow;
    const body = await c.req.json();

    let termoResult;
    try {
      termoResult = await gf.gerarTermoManual(body);
    } catch (err: any) {
      return c.json({ message: "Erro ao gerar termo manual", detail: err.message }, 502);
    }

    const termId = generateId();
    await db.insert(schema.terms).values({
      id: termId,
      cpf: body.cpf,
      externalUuid: termoResult?.uuid ?? termoResult?.id,
      clienteUuid: termoResult?.cliente_uuid,
      saldoId: termoResult?.saldo_id,
      status: termoResult?.solicitacao_status ?? "criada",
      rawPayload: JSON.stringify(termoResult),
      digitadorId: me.id,
      storeId: me.storeId,
      managerId: me.managerId,
    });

    return c.json({ termId, status: termoResult?.solicitacao_status ?? "criada" }, 201);
  })

  // STEP 2: Poll term eligibility
  .get("/term/:termId/poll", async (c) => {
    const me = c.get("user") as UserRow;
    const { termId } = c.req.param();

    const [term] = await db.select().from(schema.terms).where(eq(schema.terms.id, termId)).limit(1);
    if (!term) return c.json({ message: "Termo não encontrado" }, 404);

    // If already eligible WITH saldo_id, return immediately
    if (term.status === "elegivel" && term.saldoId) {
      return c.json({ status: "elegivel", termId, clienteUuid: term.clienteUuid, saldoId: term.saldoId }, 200);
    }
    if (term.status === "inelegivel") {
      return c.json({ status: "inelegivel", termId }, 200);
    }

    // Poll Go Fintech
    try {
      let match: any = null;

      // GoFintech /termos response: { data: { data: [...items] }, ... }
      // Each item has: solicitacao_id, cliente_id, cliente_cpf, solicitacao_status, saldo_id
      const extractItems = (r: any): any[] => {
        // Laravel paginator: r.data.data
        if (r?.data?.data && Array.isArray(r.data.data)) return r.data.data;
        // Direct array
        if (Array.isArray(r?.data)) return r.data;
        if (Array.isArray(r)) return r;
        return [];
      };

      // 1. Try direct UUID lookup first
      if (term.externalUuid) {
        try {
          const direct = await gf.getTermo(term.externalUuid);
          const items = extractItems(direct);
          if (items.length > 0) {
            match = items.find((t: any) =>
              t.solicitacao_id === term.externalUuid ||
              t.cliente_cpf === term.cpf
            ) ?? items[0];
          } else {
            // direct single object
            const obj = direct?.data ?? direct;
            if (obj && typeof obj === "object" && (obj.solicitacao_id || obj.cliente_id)) {
              match = obj;
            }
          }
          if (match) console.log("[Poll] Direct lookup hit:", JSON.stringify(match).slice(0, 200));
        } catch (e: any) {
          console.warn("[Poll] Direct lookup failed:", e.message);
        }
      }

      // 2. Fall back to list search by CPF
      if (!match) {
        const termos = await gf.listarTermos({ cpf: term.cpf, per_page: 20 });
        const items = extractItems(termos);
        console.log("[Poll] List search returned", items.length, "items. externalUuid=", term.externalUuid);
        if (items.length > 0) console.log("[Poll] First item sample:", JSON.stringify(items[0]).slice(0, 300));

        match = items.find((t: any) =>
          t.solicitacao_id === term.externalUuid ||
          t.cliente_cpf === term.cpf ||
          t.cpf === term.cpf
        ) ?? (items.length === 1 ? items[0] : null);
      }

      if (match) {
        const rawStatus = match.solicitacao_status ?? match.status ?? match.situacao ?? term.status;
        // Real field names confirmed from live API: cliente_id (not cliente_uuid), saldo_id
        const clienteUuid = match.cliente_id ?? match.cliente_uuid ?? match.cliente?.uuid ?? match.clienteUuid ?? term.clienteUuid;
        const saldoId = match.saldo_id ?? match.saldo?.id ?? match.saldoId ?? term.saldoId;

        console.log("[Poll] Retorno elegibilidade Go Fintech:", JSON.stringify(match).slice(0, 600));

        // Check margem from GF response — GF CLT termos: saldo_available_margin_value; simulacoes: saldo_margem
        const margemRaw = match.saldo_available_margin_value ?? match.saldo_margem ?? match.margem ?? match.margem_disponivel ??
                          match.saldo?.margem ?? match.saldo?.margem_disponivel ?? null;
        const margemNum = margemRaw != null ? Number(margemRaw) : null;
        console.log("[Poll] Margem identificada:", margemNum, "| saldo_id:", saldoId);

        // CORRECT eligibility logic:
        // Only set "elegivel" when GoFintech solicitacao_status IS "elegivel" AND saldo_id is present
        // GoFintech only sets solicitacao_status="elegivel" after full processing with saldo_id
        let newStatus = gf.normalizarStatusTermo(rawStatus);
        if (newStatus === "elegivel" && !saldoId) {
          // Status says eligible but no saldo_id yet — still processing
          newStatus = "processando";
        }
        // Handle GoFintech "processando" status explicitly
        if (rawStatus === "processando") {
          newStatus = "processando";
        }
        // If margem is explicitly zero or negative, mark inelegível regardless of status
        if (newStatus === "elegivel" && margemNum !== null && margemNum <= 0) {
          console.log("[Poll] Marcando inelegível por margem zero/negativa:", margemNum);
          newStatus = "inelegivel";
        }
        // saldo_elegivel=false is explicit ineligibility from GF
        if (newStatus === "elegivel" && match.saldo_elegivel === false) {
          console.log("[Poll] Marcando inelegível por saldo_elegivel=false");
          newStatus = "inelegivel";
        }
        // inelegivel from fases — only when no saldo
        if (newStatus === "processando" && Array.isArray(match.fases) && match.fases.length > 0) {
          const anyInelegivel = match.fases.some((f: any) =>
            ["inelegivel", "reprovado", "sem margem", "bloqueado"].some(kw =>
              String(f.status ?? "").toLowerCase().includes(kw)
            )
          );
          if (anyInelegivel) newStatus = "inelegivel";
        }
        // Check motivo field for inelegibility
        const motivo = String(match.motivo ?? match.motivo_inelegibilidade ?? match.descricao ?? "").toLowerCase();
        if (motivo.includes("ineleg") || motivo.includes("sem margem") || motivo.includes("margem insuf")) {
          console.log("[Poll] Marcando inelegível por motivo:", motivo);
          newStatus = "inelegivel";
        }

        console.log("[Poll] Resultado final elegibilidade:", { status: newStatus, margem: margemNum, saldoId });

        if (newStatus !== term.status || clienteUuid !== term.clienteUuid || saldoId !== term.saldoId) {
          await db.update(schema.terms).set({
            status: newStatus,
            clienteUuid: clienteUuid ?? term.clienteUuid,
            saldoId: saldoId ?? term.saldoId,
            rawPayload: JSON.stringify(match),
            updatedAt: new Date(),
          }).where(eq(schema.terms.id, termId));
        }

        return c.json({
          status: newStatus,
          termId,
          clienteUuid,
          saldoId,
          raw: match,
        }, 200);
      }
    } catch (err: any) {
      console.error("[Poll] term error:", err.message);
    }

    return c.json({ status: term.status, termId, clienteUuid: term.clienteUuid, saldoId: term.saldoId }, 200);
  })

  // STEP 3: Get simulations
  .get("/term/:termId/simulations", async (c) => {
    const me = c.get("user") as UserRow;
    const { termId } = c.req.param();

    let [term] = await db.select().from(schema.terms).where(eq(schema.terms.id, termId)).limit(1);
    if (!term) return c.json({ message: "Termo não encontrado" }, 404);

    // If missing saldoId, try re-polling GoFintech before failing
    if (!term.saldoId || !term.clienteUuid) {
      try {
        const extractItems = (r: any): any[] => {
          if (r?.data?.data && Array.isArray(r.data.data)) return r.data.data;
          if (Array.isArray(r?.data)) return r.data;
          if (Array.isArray(r)) return r;
          return [];
        };
        const termos = await gf.listarTermos({ cpf: term.cpf, per_page: 20 });
        const items = extractItems(termos);
        const match = items.find((t: any) =>
          t.solicitacao_id === term.externalUuid || t.cliente_cpf === term.cpf
        ) ?? (items.length === 1 ? items[0] : null);

        if (match) {
          const rawStatus = match.solicitacao_status ?? match.status;
          const saldoId = match.saldo_id ?? null;
          const clienteUuid = match.cliente_id ?? null;
          if (rawStatus === "elegivel" && saldoId && clienteUuid) {
            await db.update(schema.terms).set({
              status: "elegivel",
              clienteUuid,
              saldoId,
              rawPayload: JSON.stringify(match),
              updatedAt: new Date(),
            }).where(eq(schema.terms.id, termId));
            // Refresh term
            const updated = await db.select().from(schema.terms).where(eq(schema.terms.id, termId)).limit(1);
            term = updated[0];
          }
        }
      } catch (e: any) {
        console.warn("[Simulations] re-poll failed:", e.message);
      }
    }

    if (!term.clienteUuid || !term.saldoId) {
      return c.json({ message: "Cliente ainda não elegível ou aguardando processamento. Tente novamente em alguns instantes.", status: term.status }, 400);
    }

    try {
      const simData = await gf.getSimulacoes(term.clienteUuid, term.saldoId);
      console.log("[Simulations] Retorno Go Fintech:", JSON.stringify(simData).slice(0, 500));

      // GoFintech response: { success, data: [...], tabelas, saldo_margem, count }
      const sims: any[] = simData?.data ?? simData?.simulacoes ?? (Array.isArray(simData) ? simData : []);

      // Enrich simulations with top-level fields
      const margem = simData?.saldo_margem ?? simData?.margem ?? simData?.margem_disponivel ?? null;
      const margemNum = margem != null ? Number(margem) : null;
      const produto = simData?.produto ?? null;
      const tabelas = simData?.tabelas ?? {};

      console.log("[Simulations] Margem identificada:", margemNum, "| Simulações:", sims.length, "| Tabelas:", Object.keys(tabelas).length);
      console.log("[Simulations] Resultado final elegibilidade:", {
        eligible: sims.length > 0 && (margemNum == null || margemNum > 0),
        margem: margemNum,
        simulacoes: sims.length,
        tabelas: Object.keys(tabelas).length,
      });

      // If margem is zero or no simulations, mark term as ineligible in DB
      if ((margemNum !== null && margemNum <= 0) || sims.length === 0) {
        console.log("[Simulations] Marcando termo como inelegível: margem=", margemNum, "sims=", sims.length);
        await db.update(schema.terms).set({
          status: "inelegivel",
          updatedAt: new Date(),
        }).where(eq(schema.terms.id, termId));
        return c.json({
          simulations: [],
          margem: margemNum,
          produto: maskTableName(produto),
          tabelas: {},
          inelegivel: true,
          reason: margemNum !== null && margemNum <= 0 ? "Sem margem disponível" : "Sem simulações disponíveis",
        }, 200);
      }

      // Save simulations locally
      for (const sim of sims) {
        const simUuid = sim.uuid ?? sim.id;
        if (!simUuid) continue;
        const existing = await db.select({ id: schema.simulations.id }).from(schema.simulations)
          .where(eq(schema.simulations.externalUuid, simUuid)).limit(1);

        if (existing.length === 0) {
          await db.insert(schema.simulations).values({
            id: generateId(),
            termId,
            externalUuid: simUuid,
            amount: String(sim.valor_desembolso ?? sim.valor_liberado ?? "0"),
            installmentValue: String(sim.valor_parcela ?? "0"),
            installments: String(sim.prazo ?? "0"),
            rate: String(sim.taxa_juros_mensal ?? sim.taxa ?? "0"),
            tableName: maskTableName(sim.tabelas?.nome ?? sim.produto),
            provider: "gofintech",
            rawPayload: JSON.stringify(sim),
          });
        }
      }

      // Mask table/product names before sending to frontend
      const maskedProduto = maskTableName(produto);
      const maskedTabelas: Record<string, any> = {};
      for (const [key, val] of Object.entries(tabelas)) {
        maskedTabelas[maskTableName(key)] = val;
      }

      // Mask per-sim table names in the response array
      const maskedSims = sims.map((sim: any) => ({
        ...sim,
        tabelas: sim.tabelas
          ? { ...sim.tabelas, nome: maskTableName(sim.tabelas?.nome ?? sim.produto) }
          : sim.tabelas,
        produto: maskTableName(sim.produto),
      }));

      console.log("[Simulations] Enviando", maskedSims.length, "simulações para frontend.");

      return c.json({ simulations: maskedSims, margem, produto: maskedProduto, tabelas: maskedTabelas }, 200);
    } catch (err: any) {
      return c.json({ message: "Erro ao buscar simulações", detail: err.message }, 502);
    }
  })

  // STEP 3b: Select simulation
  .post("/term/:termId/simulations/select", async (c) => {
    const me = c.get("user") as UserRow;
    const { termId } = c.req.param();
    const { simulacaoUuid } = await c.req.json();

    const [term] = await db.select().from(schema.terms).where(eq(schema.terms.id, termId)).limit(1);
    if (!term || !term.clienteUuid || !term.saldoId) {
      return c.json({ message: "Termo inválido" }, 400);
    }

    try {
      const result = await gf.selecionarSimulacao(term.clienteUuid, term.saldoId, simulacaoUuid);

      // Mark selected
      await db.update(schema.simulations)
        .set({ selected: false })
        .where(eq(schema.simulations.termId, termId));

      await db.update(schema.simulations)
        .set({ selected: true })
        .where(eq(schema.simulations.externalUuid, simulacaoUuid));

      return c.json({ message: "Simulação selecionada", result }, 200);
    } catch (err: any) {
      return c.json({ message: "Erro ao selecionar simulação", detail: err.message }, 502);
    }
  })

  // STEP 4 + 5: Submit full proposal
  .post("/submit", async (c) => {
    const me = c.get("user") as UserRow;
    const body = await c.req.json();
    const { termId, simulacaoUuid, formData } = body;

    if (!termId) return c.json({ message: "termId é obrigatório" }, 400);

    const [term] = await db.select().from(schema.terms).where(eq(schema.terms.id, termId)).limit(1);
    if (!term) return c.json({ message: "Termo não encontrado" }, 404);

    // Create proposal locally first
    const proposalId = generateId();

    try {
      // Extract GoFintech user_id from raw term payload, fallback to env
      const rawTerm = term.rawPayload ? JSON.parse(term.rawPayload as string) : {};
      const gfUserId = rawTerm?.user_id ?? process.env.GF_USER_ID ?? null;

      // Map form fields → GoFintech field names
      const fd = formData ?? {};
      const celular = (fd.celular ?? fd.telefone ?? "").replace(/\D/g, "");
      const agencia = String(fd.bancario_agencia ?? fd.agencia ?? "").replace(/\D/g, "").padStart(4, "0").slice(-4);
      const conta = String(fd.bancario_conta ?? fd.conta ?? "").replace(/\D/g, "");
      const pixKey = String(fd.bancario_chave ?? fd.chave_pix ?? "").trim();
      const pixTipo = String(fd.bancario_pix_tipo ?? fd.pix_tipo ?? "CPF");
      // Normalize conta tipo → GF expects "Corrente" or "Poupança"
      const rawTipoConta = fd.bancario_conta_tipo ?? fd.tipo_conta ?? "";
      const tipoConta = rawTipoConta.toLowerCase().includes("poupa") ? "Poupança" : "Corrente";
      const allowedBanks = new Set(["001","041","237","104","341","033","756","748","077","336","273","212","007","260"]);
      const bancoCodigo = String(fd.bancario_cod ?? fd.banco ?? "").replace(/\D/g, "").padStart(3, "0");
      if (bancoCodigo && !allowedBanks.has(bancoCodigo)) {
        return c.json({ message: "Banco não autorizado para pagamento." }, 400);
      }
      if (pixKey && !bancoCodigo) {
        return c.json({ message: "Informe o banco autorizado para validar a chave PIX." }, 400);
      }

      const gfPayload: Record<string, any> = {
        simulacao_id: simulacaoUuid,
        cliente_id: term.clienteUuid,
        saldo_id: term.saldoId,
        user_id: gfUserId,
        // ── cliente fields (ignored by criarOperacao — sent separately via /pessoais) ──
        nascimento: gf.normalizeToISODate(fd.data_nascimento ?? fd.nascimento) ?? null,
        filiacao_mae: fd.filiacao_mae ?? fd.nome_mae ?? null,
        rg_tipo: fd.rg_tipo ?? (fd.rg ? "RG" : null),
        rg_documento: fd.rg_documento ?? fd.rg ?? null,
        rg_data_emissao: gf.normalizeToISODate(fd.rg_data_emissao ?? fd.data_emissao) ?? null,
        rg_uf: fd.rg_uf ?? fd.uf_documento ?? null,
        rg_emissor: fd.rg_emissor ?? fd.orgao_emissor ?? null,
        // ── perfil fields ──
        email: fd.email ?? null,
        celular: celular || null,
        cep: (fd.cep ?? "").replace(/\D/g, "") || null,
        endereco: fd.endereco ?? fd.logradouro ?? null,
        numero: fd.numero ?? null,
        complemento: fd.complemento ?? null,
        bairro: fd.bairro ?? null,
        cidade: fd.cidade ?? null,
        uf: fd.uf ?? null,
        // ── bank fields ──
        bancario_tipo: fd.bancario_tipo ?? (fd.banco ? "CONTA" : null),
        bancario_cod: fd.bancario_cod ?? fd.banco ?? null,
        bancario_agencia: agencia || null,
        bancario_conta: conta || null,
        bancario_conta_tipo: tipoConta,
        bancario_chave: pixKey || null,
        bancario_pix_tipo: pixKey ? pixTipo : null,
        bancario_titular_nome: fd.bancario_titular_nome ?? fd.nome ?? null,
        bancario_titular_cpf: fd.bancario_titular_cpf ?? fd.cpf ?? (term.cpf ?? "").replace(/\D/g, "") ?? null,
      };

      // Strip null values to keep payload clean
      Object.keys(gfPayload).forEach(k => gfPayload[k] === null && delete gfPayload[k]);

      let operacao: any;
      try {
        operacao = await gf.criarOperacao(gfPayload);
      } catch (err: any) {
        // ── Duplicate proposal: upsert to DB and return existing/new proposalId ──
        if (err instanceof DuplicateProposalError) {
          const dup = err.duplicada;
          const externalUuid = dup.operacao_id ?? dup.uuid;

          // Check if we already have this in DB
          let existingProposal = externalUuid
            ? (await db.select().from(schema.proposals).where(eq(schema.proposals.externalUuid, externalUuid)).limit(1))[0]
            : undefined;

          if (!existingProposal) {
            // Try to fetch from GoFintech to get full data
            let gfOp: any = {};
            try { gfOp = externalUuid ? await gf.getOperacao(externalUuid) : {}; } catch { /* ignore */ }

            const dupData: typeof schema.proposals.$inferInsert = {
              id: proposalId,
              termId,
              simulationId: simulacaoUuid,
              externalUuid: externalUuid ?? gfOp?.uuid,
              contractNumber: gfOp?.numero_contrato ?? dup.numero_publico,
              cpf: term.cpf,
              customerName: formData?.nome ?? formData?.customer_name,
              amount: formData?.valor_liberado ?? formData?.amount,
              installmentValue: formData?.valor_parcela ?? formData?.installment_value,
              installments: formData?.prazo ?? formData?.installments,
              rate: formData?.taxa ?? formData?.rate,
              tableName: maskTableName(formData?.nome_tabela ?? formData?.table_name),
              fundName: "FUNDO A",
              status: dup.status ?? gfOp?.status ?? "INICIADA",
              statusPadronizado: gf.normalizarStatus(dup.status ?? gfOp?.status ?? "INICIADA"),
              apiOrigin: "gofintech",
              formData: JSON.stringify(formData),
              digitadorId: me.id,
              storeId: me.storeId,
              managerId: me.managerId,
            };
            await db.insert(schema.proposals).values(dupData).onConflictDoNothing();
            await db.insert(schema.proposalStatusHistory).values({
              id: generateId(),
              proposalId,
              oldStatus: null,
              newStatus: dupData.status ?? "INICIADA",
              payload: JSON.stringify({ duplicada: dup }),
            }).onConflictDoNothing();
            existingProposal = dupData as typeof schema.proposals.$inferSelect;
          }

          // ── For patchable duplicates: push client data + implantar ──
          const dupExternalUuid = existingProposal.externalUuid;
          const dupClienteUuid = term.clienteUuid;
          const patchableStatuses = ["INICIADA", "EM DIGITAÇÃO", "EM_DIGITACAO"];
          if (dupExternalUuid && dupClienteUuid && patchableStatuses.includes(existingProposal.status ?? "")) {
            try {
              const rawNascimento = fd.data_nascimento ?? fd.nascimento;
              const nascimentoISO = gf.normalizeToISODate(rawNascimento);
              console.log("[dup-pessoais] data_nascimento raw:", rawNascimento, "→ ISO:", nascimentoISO);
              const pessoaisPayload: gf.PessoaisPayload = {
                nacionalidade: fd.nacionalidade ?? "Brasileira",
                nascimento: nascimentoISO,
                rg_tipo: fd.rg_tipo ?? (fd.rg_documento || fd.rg ? "RG" : undefined),
                rg_documento: fd.rg_documento ?? fd.rg ?? undefined,
                rg_emissor: fd.rg_emissor ?? fd.orgao_emissor ?? undefined,
                rg_uf: fd.rg_uf ?? fd.uf_documento ?? undefined,
                rg_data_emissao: gf.normalizeToISODate(fd.rg_data_emissao ?? fd.data_emissao),
                filiacao_mae: fd.filiacao_mae ?? fd.nome_mae ?? undefined,
                email: fd.email ?? undefined,
                celular: celular || undefined,
                celular_whatsapp: true,
              };
              console.log("[dup-pessoais] payload:", JSON.stringify(pessoaisPayload));
              Object.keys(pessoaisPayload).forEach(k => (pessoaisPayload as any)[k] === undefined && delete (pessoaisPayload as any)[k]);
              await gf.atualizarPessoais(dupClienteUuid, dupExternalUuid, pessoaisPayload);
              console.log("[dup-pessoais] success");
            } catch (e: any) { console.error("[dup-pessoais] failed:", e.message); }

            try {
              const enderecoPayload: gf.EnderecoPayload = {
                cep: (fd.cep ?? "").replace(/\D/g, "") || undefined,
                endereco: fd.endereco ?? fd.logradouro ?? undefined,
                numero: fd.numero ?? undefined,
                complemento: fd.complemento ?? undefined,
                bairro: fd.bairro ?? undefined,
                cidade: fd.cidade ?? undefined,
                uf: fd.uf ?? undefined,
              };
              Object.keys(enderecoPayload).forEach(k => (enderecoPayload as any)[k] === undefined && delete (enderecoPayload as any)[k]);
              await gf.atualizarEndereco(dupClienteUuid, dupExternalUuid, enderecoPayload);
              console.log("[dup-endereco] success");
            } catch (e: any) { console.error("[dup-endereco] failed:", e.message); }

            try {
              const bancarioPayload: gf.BancarioPayload = {
                bancario_tipo: fd.bancario_tipo ?? (fd.bancario_cod || fd.banco ? "TED" : undefined),
                bancario_cod: fd.bancario_cod ?? fd.banco ?? undefined,
                bancario_nome: fd.bancario_nome ?? undefined,
                bancario_agencia: agencia || undefined,
                bancario_agencia_digito: fd.bancario_agencia_digito ?? "0",
                bancario_conta: conta || undefined,
                bancario_conta_digito: String(fd.bancario_conta_digito ?? fd.digito ?? "0"),
                bancario_conta_tipo: tipoConta || undefined,
                bancario_titular_nome: fd.bancario_titular_nome ?? fd.nome ?? undefined,
                bancario_titular_cpf: (term.cpf ?? "").replace(/\D/g, "") || undefined,
              };
              Object.keys(bancarioPayload).forEach(k => (bancarioPayload as any)[k] === undefined && delete (bancarioPayload as any)[k]);
              await gf.atualizarBancario(dupClienteUuid, dupExternalUuid, bancarioPayload);
              console.log("[dup-bancario] success");
            } catch (e: any) { console.error("[dup-bancario] failed:", e.message); }

            try {
              await gf.implantar(dupExternalUuid);
              console.log("[dup-implantar] success");
              await db.update(schema.proposals).set({ status: "ENVIADA", statusPadronizado: "ENVIADA", updatedAt: new Date() })
                .where(eq(schema.proposals.id, existingProposal.id));
            } catch (e: any) { console.error("[dup-implantar] failed:", e.message); }
          }

          // Get formalization URL from operacao.formalizacao for duplicates
          let dupSignatureUrl: string | null = existingProposal.signatureUrl ?? null;
          if (dupExternalUuid) {
            try {
              const opData = await gf.getOperacao(dupExternalUuid);
              const rawDupUrl = opData?.formalizacao ?? opData?.url_assinatura ?? null;
              if (rawDupUrl) {
                // Guard: fetch term's consultationUrl and refuse if they match
                const [dupTerm] = await db.select({ consultationUrl: schema.terms.consultationUrl })
                  .from(schema.terms).where(eq(schema.terms.id, existingProposal.termId)).limit(1);
                if (dupTerm?.consultationUrl && rawDupUrl === dupTerm.consultationUrl) {
                  console.error("[formalizacao-dup][BUG] formalizacaoUrl === consultationUrl — refusing to store");
                } else {
                  dupSignatureUrl = rawDupUrl;
                  console.log("[formalizacao-dup] signatureUrl:", dupSignatureUrl);
                  await db.update(schema.proposals).set({
                    signatureUrl: dupSignatureUrl,
                    updatedAt: new Date(),
                  }).where(eq(schema.proposals.id, existingProposal.id));
                }
              }
            } catch (err: any) {
              console.error("[formalizacao-dup] getOperacao failed:", err.message);
            }
          }

          return c.json({
            proposalId: existingProposal.id,
            externalUuid: existingProposal.externalUuid,
            status: existingProposal.status,
            signatureUrl: dupSignatureUrl,
            duplicada: true,
            message: "Já existe uma proposta em andamento para este CPF.",
          }, 200);
        }

        // Other errors — return 502
        return c.json({ message: "Erro ao enviar proposta", detail: err.message }, 502);
      }

      // Extract operacao UUID from GF response
      const operacaoUuid = operacao?.uuid ?? operacao?.id ?? operacao?.operacao_id ?? operacao?.numero_publico;

      // ── Step 2: Push client data via the 3 dedicated GF endpoints ─────────
      // GF ignores personal data in criarOperacao — it must be sent separately
      // after creation via: /pessoais, /endereco, /bancario
      const clienteUuid = term.clienteUuid;
      let implantarStatus = "EM_DIGITACAO";

      if (!clienteUuid) {
        console.error("[proposta] clienteUuid ausente no termo — PATCH steps serão ignorados. termId:", termId);
        return c.json({
          error: "Não foi possível enviar a proposta: identificador do cliente (clienteUuid) não encontrado. Tente novamente em alguns instantes ou entre em contato com o suporte.",
          code: "MISSING_CLIENTE_UUID",
        }, 422);
      }

      if (operacaoUuid && clienteUuid) {
        // 2a. Dados pessoais
        try {
          const rawNascimento = fd.data_nascimento ?? fd.nascimento;
          const nascimentoISO = gf.normalizeToISODate(rawNascimento);
          console.log("[pessoais] data_nascimento raw:", rawNascimento, "→ ISO:", nascimentoISO);
          if (!nascimentoISO) {
            console.warn("[pessoais] AVISO: nascimento ausente ou inválido — campo não enviado ao GF");
          }
          const pessoaisPayload: gf.PessoaisPayload = {
            nacionalidade: fd.nacionalidade ?? "Brasileira",
            nascimento: nascimentoISO,
            rg_tipo: fd.rg_tipo ?? (fd.rg_documento || fd.rg ? "RG" : undefined),
            rg_documento: fd.rg_documento ?? fd.rg ?? undefined,
            rg_emissor: fd.rg_emissor ?? fd.orgao_emissor ?? undefined,
            rg_uf: fd.rg_uf ?? fd.uf_documento ?? undefined,
            rg_data_emissao: gf.normalizeToISODate(fd.rg_data_emissao ?? fd.data_emissao),
            filiacao_mae: fd.filiacao_mae ?? fd.nome_mae ?? undefined,
            email: fd.email ?? undefined,
            celular: celular || undefined,
            celular_whatsapp: true,
            telefone: null,
            operacao_uuid: operacaoUuid,
          };
          console.log("[pessoais] payload:", JSON.stringify(pessoaisPayload));
          // Remove undefined fields
          Object.keys(pessoaisPayload).forEach(k => (pessoaisPayload as any)[k] === undefined && delete (pessoaisPayload as any)[k]);
          const pessoaisRes = await gf.atualizarPessoais(clienteUuid, operacaoUuid, pessoaisPayload);
          console.log("[pessoais] success:", pessoaisRes?.success);
        } catch (err: any) {
          console.error("[pessoais] failed:", err.message);
        }

        // 2b. Endereço
        try {
          const enderecoPayload: gf.EnderecoPayload = {
            cep: (fd.cep ?? "").replace(/\D/g, "") || undefined,
            endereco: fd.endereco ?? fd.logradouro ?? undefined,
            numero: fd.numero ?? undefined,
            complemento: fd.complemento ?? undefined,
            bairro: fd.bairro ?? undefined,
            cidade: fd.cidade ?? undefined,
            uf: fd.uf ?? undefined,
            operacao_uuid: operacaoUuid,
          };
          Object.keys(enderecoPayload).forEach(k => (enderecoPayload as any)[k] === undefined && delete (enderecoPayload as any)[k]);
          const enderecoRes = await gf.atualizarEndereco(clienteUuid, operacaoUuid, enderecoPayload);
          console.log("[endereco] success:", enderecoRes?.success);
        } catch (err: any) {
          console.error("[endereco] failed:", err.message);
        }

        // 2c. Dados bancários
        try {
          const bancarioPayload: gf.BancarioPayload = {
            bancario_tipo: fd.bancario_tipo ?? (fd.bancario_cod || fd.banco ? "TED" : undefined),
            bancario_pix_tipo: fd.bancario_pix_tipo ?? undefined,
            bancario_chave: fd.bancario_chave ?? undefined,
            bancario_cod: fd.bancario_cod ?? fd.banco ?? undefined,
            bancario_nome: fd.bancario_nome ?? undefined,
            bancario_agencia: agencia || undefined,
            bancario_agencia_digito: fd.bancario_agencia_digito ?? "0",
            bancario_conta: conta || undefined,
            bancario_conta_digito: String(fd.bancario_conta_digito ?? fd.digito ?? "0"),
            bancario_conta_tipo: tipoConta || undefined,
            bancario_titular_nome: fd.bancario_titular_nome ?? fd.nome ?? undefined,
            bancario_titular_cpf: (term.cpf ?? "").replace(/\D/g, "") || undefined,
            operacao_uuid: operacaoUuid,
          };
          Object.keys(bancarioPayload).forEach(k => (bancarioPayload as any)[k] === undefined && delete (bancarioPayload as any)[k]);
          const bancarioRes = await gf.atualizarBancario(clienteUuid, operacaoUuid, bancarioPayload);
          console.log("[bancario] success:", bancarioRes?.success);
        } catch (err: any) {
          console.error("[bancario] failed:", err.message);
        }

        // 2d. Implantar — submits to bank after data is filled
        try {
          await gf.implantar(operacaoUuid);
          implantarStatus = "ENVIADA";
          console.log("[implantar] success");
        } catch (err: any) {
          console.error("[implantar] failed:", err.message);
          // Non-fatal — proposal exists, data is saved
        }
      }

      // Get formalization URL from operacao.formalizacao — the real signing link for the PROPOSAL step
      // This MUST be different from term.consultationUrl (eligibility step)
      let signatureUrl: string | null = null;
      if (operacaoUuid) {
        try {
          const opData = await gf.getOperacao(operacaoUuid);
          const rawFormalizacaoUrl = opData?.formalizacao ?? opData?.url_assinatura ?? null;
          if (rawFormalizacaoUrl) {
            console.log("[formalizacao] rawFormalizacaoUrl:", rawFormalizacaoUrl);
            // Guard: reject if this matches the consultation URL (eligibility link)
            if (term.consultationUrl && rawFormalizacaoUrl === term.consultationUrl) {
              console.error("[BUG] formalizacaoUrl === consultationUrl — refusing to store as signatureUrl");
              // Do NOT assign — signatureUrl stays null, will be fetched again on poll
            } else {
              signatureUrl = rawFormalizacaoUrl;
              console.log("[formalizacao] signatureUrl (formalization):", signatureUrl);
            }
          }
        } catch (err: any) {
          console.error("[formalizacao] getOperacao failed:", err.message);
        }
      }

      const proposalData: typeof schema.proposals.$inferInsert = {
        id: proposalId,
        termId,
        simulationId: simulacaoUuid,
        externalUuid: operacaoUuid,
        contractNumber: operacao?.numero_contrato ?? operacao?.numero_publico,
        cpf: term.cpf,
        customerName: fd.nome ?? formData?.customer_name,
        amount: fd.valor_liberado ?? fd.valor_desembolso ?? formData?.amount,
        installmentValue: fd.valor_parcela ?? formData?.installment_value,
        installments: fd.prazo != null ? Number(fd.prazo) : (formData?.installments ?? null),
        rate: fd.taxa ?? fd.taxa_juros_mensal ?? formData?.rate,
        tableName: maskTableName(fd.nome_tabela ?? formData?.table_name),
        fundName: "FUNDO A", // always masked
        status: implantarStatus,
        statusPadronizado: gf.normalizarStatus(implantarStatus),
        signatureUrl,
        apiOrigin: "gofintech",
        formData: JSON.stringify(formData),
        digitadorId: me.id,
        storeId: me.storeId,
        managerId: me.managerId,
      };

      await db.insert(schema.proposals).values(proposalData);

      await db.insert(schema.proposalStatusHistory).values({
        id: generateId(),
        proposalId,
        oldStatus: null,
        newStatus: proposalData.status ?? "ENVIADA",
        payload: JSON.stringify(operacao),
      });

      return c.json({ proposalId, externalUuid: proposalData.externalUuid, status: proposalData.status, signatureUrl }, 201);
    } catch (err: any) {
      return c.json({ message: "Erro ao enviar proposta", detail: err.message }, 502);
    }
  })

  // STEP 5: Poll proposal status
  .post("/:id/poll", async (c) => {
    const me = c.get("user") as UserRow;
    const { id } = c.req.param();

    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    if (!proposal || !proposal.externalUuid) return c.json({ message: "Proposta não encontrada" }, 404);

    try {
      const esteira = await gf.getOperacaoEsteira(proposal.externalUuid);
      const operacao = await gf.getOperacao(proposal.externalUuid);

      const rawStatus = operacao?.status ?? esteira?.status;
      const newStatus = gf.normalizarStatus(rawStatus ?? proposal.status);
      // Extract motivo from GF esteira (most recent entry)
      const esteiraItems: any[] = Array.isArray(operacao?.esteira) ? operacao.esteira : [];
      const lastEsteiraItem = esteiraItems[0] ?? null;
      const statusMotivo: string | null = lastEsteiraItem?.motivo ?? esteira?.motivo ?? null;

      const rawSignatureUrl = operacao?.formalizacao ?? operacao?.url_assinatura ?? operacao?.link_assinatura ?? esteira?.url_assinatura;

      // Guard: fetch term's consultationUrl and refuse to store if they match (link conflation bug)
      let signatureUrl = rawSignatureUrl ?? null;
      if (signatureUrl && proposal.termId) {
        const [term] = await db.select({ consultationUrl: schema.terms.consultationUrl })
          .from(schema.terms).where(eq(schema.terms.id, proposal.termId)).limit(1);
        if (term?.consultationUrl && signatureUrl === term.consultationUrl) {
          console.error("[poll][BUG] signatureUrl === consultationUrl — refusing to store as formalization link");
          signatureUrl = null;
        }
      }

      const statusChanged = newStatus !== proposal.status;
      const motivoChanged = statusMotivo && statusMotivo !== proposal.statusMotivo;

      if (statusChanged || motivoChanged || (signatureUrl && !proposal.signatureUrl)) {
        await db.update(schema.proposals).set({
          status: newStatus,
          statusPadronizado: newStatus,
          statusMotivo: statusMotivo ?? proposal.statusMotivo,
          signatureUrl: signatureUrl ?? proposal.signatureUrl,
          paidAt: newStatus === "PAGA" ? new Date() : proposal.paidAt,
          updatedAt: new Date(),
        }).where(eq(schema.proposals.id, id));

        if (statusChanged) {
          await db.insert(schema.proposalStatusHistory).values({
            id: generateId(),
            proposalId: id,
            oldStatus: proposal.status,
            newStatus,
            motivo: statusMotivo ?? undefined,
            payload: JSON.stringify({ operacao, esteira }),
          });
        }
      }

      return c.json({
        status: newStatus,
        statusMotivo,
        signatureUrl: signatureUrl ? `/sign/${id}` : null,
        esteira,
        operacao: {
          ...operacao,
          // Strip provider names from response
          banco: undefined,
          bancarizadora: undefined,
        },
      }, 200);
    } catch (err: any) {
      return c.json({ message: "Erro ao consultar status", detail: err.message }, 502);
    }
  })

  // Fix banking data — called when proposal has pending bancário status
  .patch("/:id/bancario", requireAuth, async (c) => {
    const me = c.get("user") as UserRow;
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));

    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    if (!proposal) return c.json({ message: "Proposta não encontrada" }, 404);
    if (me.role === "digitador" && proposal.digitadorId !== me.id) return c.json({ message: "Acesso negado" }, 403);
    if (!proposal.externalUuid) return c.json({ message: "Proposta sem UUID externo" }, 400);

    // Fetch clienteUuid from term
    let clienteUuid: string | null = null;
    if (proposal.termId) {
      const [term] = await db.select({ clienteUuid: schema.terms.clienteUuid })
        .from(schema.terms).where(eq(schema.terms.id, proposal.termId)).limit(1);
      clienteUuid = term?.clienteUuid ?? null;
    }
    if (!clienteUuid) return c.json({ message: "Cliente UUID não encontrado para esta proposta" }, 400);

    // Build bancário payload
    const bancario: Record<string, string | undefined> = {
      bancario_tipo: body.tipo ?? "TED",
      bancario_cod: body.banco,
      bancario_nome: BANCOS[String(body.banco ?? "").padStart(3, "0")] ?? BANCOS[String(body.banco ?? "")] ?? undefined,
      bancario_agencia: body.agencia,
      bancario_agencia_digito: body.agencia_digito,
      bancario_conta: body.conta,
      bancario_conta_digito: body.conta_digito,
      bancario_conta_tipo: body.tipo_conta ?? "Corrente",
    };
    if (body.chave_pix) {
      bancario.bancario_tipo = "PIX";
      bancario.bancario_chave = body.chave_pix;
      bancario.bancario_pix_tipo = body.pix_tipo ?? "CPF";
    }

    // Remove undefined keys
    Object.keys(bancario).forEach(k => { if (bancario[k] === undefined) delete bancario[k]; });

    try {
      await gf.atualizarBancario(clienteUuid, proposal.externalUuid, bancario as any);

      // After fixing, re-implant to resume analysis
      await gf.implantar(proposal.externalUuid);

      // Update local status
      await db.update(schema.proposals).set({
        status: "EM ANÁLISE",
        statusPadronizado: "EM ANÁLISE",
        statusMotivo: null,
        updatedAt: new Date(),
      }).where(eq(schema.proposals.id, id));

      await db.insert(schema.proposalStatusHistory).values({
        id: generateId(),
        proposalId: id,
        oldStatus: proposal.status,
        newStatus: "EM ANÁLISE",
        motivo: "Dados bancários corrigidos e reenviados para análise",
        payload: JSON.stringify({ bancario }),
      });

      await db.insert(schema.auditLogs).values({
        id: generateId(),
        userId: me.id,
        action: "fix_bancario",
        payload: JSON.stringify({ proposalId: id, bancario }),
      });

      return c.json({ message: "Dados bancários atualizados. Proposta reenviada para análise." }, 200);
    } catch (err: any) {
      return c.json({ message: "Erro ao atualizar dados bancários", detail: err.message }, 502);
    }
  })

  // Cancel proposal
  .post("/:id/cancel", requireAuth, async (c) => {
    const me = c.get("user") as UserRow;
    const { id } = c.req.param();
    const { motivo } = await c.req.json().catch(() => ({ motivo: undefined }));

    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    if (!proposal) return c.json({ message: "Proposta não encontrada" }, 404);

    if (proposal.externalUuid) {
      try {
        await gf.cancelarOperacao(proposal.externalUuid, motivo);
      } catch (e) {
        console.error("Cancel on provider failed:", e);
      }
    }

    await db.update(schema.proposals).set({
      status: "CANCELADA",
      statusPadronizado: "CANCELADA",
      updatedAt: new Date(),
    }).where(eq(schema.proposals.id, id));

    return c.json({ message: "Proposta cancelada" }, 200);
  });

// Public route — no auth required (customer-facing sign page)
export const proposalsPublicRoutes = new Hono()
  .get("/:id/sign", async (c) => {
    const { id } = c.req.param();
    const [proposal] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    if (!proposal) return c.json({ message: "Proposta não encontrada" }, 404);

    if (!proposal.signatureUrl) {
      return c.json({ message: "Link de assinatura ainda não disponível" }, 404);
    }

    // Resolve GF shortlinks (app.sejago.site/u/{code}) to the real Unico URL
    let signatureUrl = proposal.signatureUrl;
    const gfShortlinkMatch = signatureUrl.match(/app\.sejago\.site\/u\/([A-Za-z0-9]+)/);
    if (gfShortlinkMatch) {
      try {
        const code = gfShortlinkMatch[1];
        const resp = await fetch(`https://api-backend.sib2b.com.br/public/u/${code}`);
        if (resp.ok) {
          const data = await resp.json() as { sucesso?: boolean; destino_url?: string };
          if (data.sucesso && data.destino_url) {
            signatureUrl = data.destino_url;
            console.log(`[sign] Resolved GF shortlink ${code} -> ${signatureUrl}`);
          }
        }
      } catch (err) {
        console.error("[sign] Failed to resolve GF shortlink:", err);
        // Fall back to the stored URL
      }
    }

    return c.json({
      id: proposal.id,
      customerName: proposal.customerName,
      amount: proposal.amount,
      installmentValue: proposal.installmentValue,
      installments: proposal.installments,
      tableName: maskTableName(proposal.tableName),
      fund: proposal.fundName,
      signatureUrl,
    }, 200);
  });
