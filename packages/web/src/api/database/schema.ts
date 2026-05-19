import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "gerente", "loja", "digitador"] }).notNull().default("digitador"),
  managerId: text("manager_id"),
  storeId: text("store_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Sessions ────────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Stores ──────────────────────────────────────────────────────────────────
export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  managerId: text("manager_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Terms (CLT term/consent) ─────────────────────────────────────────────────
export const terms = sqliteTable("terms", {
  id: text("id").primaryKey(),
  cpf: text("cpf").notNull(),
  externalUuid: text("external_uuid"),
  clienteUuid: text("cliente_uuid"),
  saldoId: text("saldo_id"),
  status: text("status").notNull().default("criada"), // criada, elegivel, inelegivel, erro
  consultationUrl: text("consultation_url"), // URL returned by gerarTermo (eligibility step) — NEVER used as formalization link
  rawPayload: text("raw_payload"),
  digitadorId: text("digitador_id").notNull().references(() => users.id),
  storeId: text("store_id"),
  managerId: text("manager_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Simulations ─────────────────────────────────────────────────────────────
export const simulations = sqliteTable("simulations", {
  id: text("id").primaryKey(),
  termId: text("term_id").notNull().references(() => terms.id),
  proposalId: text("proposal_id"),
  externalUuid: text("external_uuid"),
  amount: real("amount"),
  installmentValue: real("installment_value"),
  installments: integer("installments"),
  rate: real("rate"),
  tableName: text("table_name"),
  provider: text("provider"),
  rawPayload: text("raw_payload"),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Proposals ───────────────────────────────────────────────────────────────
export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  contractNumber: text("contract_number"),
  externalUuid: text("external_uuid"),
  termId: text("term_id"),
  simulationId: text("simulation_id"),
  customerName: text("customer_name"),
  cpf: text("cpf").notNull(),
  amount: real("amount"),
  installmentValue: real("installment_value"),
  installments: integer("installments"),
  rate: real("rate"),
  tableName: text("table_name"),
  fundName: text("fund_name").notNull().default("FUNDO A"), // always masked
  status: text("status").notNull().default("EM ANÁLISE"),
  statusPadronizado: text("status_padronizado"),
  statusMotivo: text("status_motivo"), // detailed reason from GF esteira (e.g. pendência bancária)
  apiOrigin: text("api_origin").notNull().default("gofintech"), // internal only
  signatureUrl: text("signature_url"),
  signatureProvider: text("signature_provider"),
  formData: text("form_data"), // JSON blob of proposal form
  digitadorId: text("digitador_id").notNull().references(() => users.id),
  storeId: text("store_id"),
  managerId: text("manager_id"),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Proposal Status History ──────────────────────────────────────────────────
export const proposalStatusHistory = sqliteTable("proposal_status_history", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull().references(() => proposals.id),
  oldStatus: text("old_status"),
  newStatus: text("new_status").notNull(),
  motivo: text("motivo"),   // human-readable reason for this status change
  payload: text("payload"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  payload: text("payload"),
  ip: text("ip"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── API Config (stored securely server-side) ─────────────────────────────────
export const apiConfig = sqliteTable("api_config", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().unique(), // gofintech, bankerize
  baseUrl: text("base_url").notNull(),
  apiToken: text("api_token"),
  email: text("email"),
  passwordEnc: text("password_enc"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
