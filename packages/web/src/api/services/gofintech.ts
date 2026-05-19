// Go Fintech API Service — internal only, never exposed to frontend
// Provider displayed as "FUNDO A" to users

import fs from "fs";
import path from "path";

const BASE_URL = "https://app-sejago-site.sib2b.com.br";
const API_TOKEN = process.env.GF_API_TOKEN ?? "";
const GF_EMAIL = process.env.GF_EMAIL ?? "sac@gofintech.digital";
const GF_PASSWORD = process.env.GF_PASSWORD ?? "En18042717*";
// Fallback token for when /auth/login is temporarily down (valid for 1h from generation)
const GF_FALLBACK_TOKEN = process.env.GF_FALLBACK_TOKEN ?? "";

let cachedToken: { token: string; expiresAt: number } | null = null;

// Bootstrap fallback token if present and not expired
if (GF_FALLBACK_TOKEN) {
  try {
    const parts = GF_FALLBACK_TOKEN.split(".");
    if (parts.length === 3) {
      const pad = 4 - parts[1].length % 4;
      const payload = JSON.parse(Buffer.from(parts[1] + (pad < 4 ? "=".repeat(pad) : ""), "base64url").toString());
      if (payload.exp && payload.exp * 1000 > Date.now() + 60000) {
        cachedToken = { token: GF_FALLBACK_TOKEN, expiresAt: payload.exp * 1000 };
        console.log("[GoFintech] Loaded fallback token, expires at", new Date(payload.exp * 1000).toISOString());
      }
    }
  } catch { /* ignore */ }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(5000); // 5s before retry — GF rate limit is 1 req/window
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Sib2b": API_TOKEN,
        },
        body: JSON.stringify({ email: GF_EMAIL, password: GF_PASSWORD }),
      });

      if (!res.ok) {
        const text = await res.text();
        lastErr = new Error(`Go Fintech auth failed: ${res.status} ${text}`);
        console.warn(`[GoFintech] Auth attempt ${attempt + 1}/3 failed: ${res.status} | API_TOKEN[:20]=${API_TOKEN.substring(0,20)} | body: ${text.substring(0,100)}`);
        continue;
      }

      const data = await res.json() as { access_token?: string; expires_in?: number; success?: boolean; message?: string };
      if (!data.access_token) {
        lastErr = new Error(`Go Fintech auth returned no token: ${JSON.stringify(data)}`);
        console.warn(`[GoFintech] Auth attempt ${attempt + 1} no token in response: ${JSON.stringify(data)}`);
        continue;
      }
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000),
      };
      // Persist fresh token to .env so server restarts don't lose it
      try {
        const envPath = path.resolve(process.cwd(), "../../.env");
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, "utf-8");
          if (envContent.includes("GF_FALLBACK_TOKEN=")) {
            envContent = envContent.replace(/^GF_FALLBACK_TOKEN=.*/m, `GF_FALLBACK_TOKEN=${data.access_token}`);
          } else {
            envContent += `\nGF_FALLBACK_TOKEN=${data.access_token}`;
          }
          fs.writeFileSync(envPath, envContent, "utf-8");
          console.log("[GoFintech] Persisted fresh token to .env");
        }
      } catch (e: any) {
        console.warn("[GoFintech] Could not persist token to .env:", e.message);
      }
      return cachedToken.token;
    } catch (e: any) {
      lastErr = e;
      console.warn(`[GoFintech] Auth attempt ${attempt + 1}/3 threw: ${e.message}`);
    }
  }
  throw lastErr ?? new Error("Go Fintech auth failed after 3 attempts");
}

async function gfFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Sib2b": API_TOKEN,
    "Authorization": `Bearer ${token}`,
    ...((options.headers ?? {}) as Record<string, string>),
  };

  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
}

// ─── Terms ────────────────────────────────────────────────────────────────────

export async function gerarTermo(cpf: string, canal?: string) {
  const res = await gfFetch("/termo/gerar/clt", {
    method: "POST",
    body: JSON.stringify({ cpf, ...(canal ? { canal } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// Gera termo para operação específica (retorna URL de assinatura)
export async function gerarTermoCltOperacao(cpf: string, operacao_uuid: string) {
  const res = await gfFetch("/termo/gerar/clt", {
    method: "POST",
    body: JSON.stringify({ cpf, operacao_uuid }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  // returns { success: true, termo_uuid: "...", urls: ["https://app.sejago.site/u/..."] }
  return data;
}

export async function gerarTermoManual(payload: {
  cpf: string;
  nome: string;
  data_nascimento: string;
  nome_mae: string;
  empresa: string;
  matricula: string;
}) {
  const res = await gfFetch("/termo/gerar/clt/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function listarTermos(params: {
  cpf?: string;
  status?: string;
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params.cpf) qs.set("search", params.cpf);
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.per_page) qs.set("per_page", String(params.per_page));

  const res = await gfFetch(`/termos?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function getTermo(uuid: string) {
  // Try direct UUID endpoint first, fall back to list search
  try {
    const res = await gfFetch(`/termos/${uuid}`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch { /* fall through to list search */ }

  const res = await gfFetch(`/termos?search=${uuid}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ─── Simulations ──────────────────────────────────────────────────────────────

export async function getSimulacoes(clienteUuid: string, saldoId: string) {
  const res = await gfFetch(`/simulacoes/${clienteUuid}/${saldoId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function selecionarSimulacao(clienteUuid: string, saldoId: string, simulacaoUuid: string) {
  const res = await gfFetch(`/simulacoes/${clienteUuid}/${saldoId}`, {
    method: "POST",
    body: JSON.stringify({ simulacao_uuid: simulacaoUuid }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ─── Operações ────────────────────────────────────────────────────────────────

export class DuplicateProposalError extends Error {
  duplicada: { operacao_id: string; numero_publico?: string; status?: string };
  constructor(msg: string, duplicada: any) {
    super(msg);
    this.name = "DuplicateProposalError";
    this.duplicada = duplicada;
  }
}

export async function criarOperacao(payload: Record<string, unknown>) {
  const res = await gfFetch("/operacoes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    // Detect duplicate proposal from GoFintech
    if (data?.duplicada || (data?.message && /duplicada|em andamento/i.test(data.message))) {
      throw new DuplicateProposalError(data.message ?? "Proposta duplicada", data.duplicada ?? {});
    }
    throw new Error(JSON.stringify(data));
  }
  // GF POST /operacoes returns: { success: true, operacao: { id: "uuid", numero_publico, ccb_publica }, perfil: {...} }
  // Flatten to make UUID accessible at top level
  const op = data?.operacao ?? {};
  return {
    ...data,
    uuid: op.id ?? op.uuid ?? data.uuid,
    id: op.id ?? op.uuid ?? data.id,
    numero_publico: op.numero_publico ?? data.numero_publico,
  };
}

export async function getOperacao(uuid: string) {
  const res = await gfFetch(`/operacoes/${uuid}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  // GF returns { success, operacao: { uuid, formalizacao, ... }, cliente, perfil, simulacao, esteira }
  // Flatten to a single object for easy access
  const op = data?.operacao ?? {};
  const esteira = data?.esteira ?? [];
  const lastEsteira = Array.isArray(esteira) ? esteira[0] : esteira;
  return {
    ...op,
    cliente: data?.cliente ?? {},
    perfil: data?.perfil ?? {},
    simulacao: data?.simulacao ?? {},
    esteira: esteira,
    // Convenience: expose last status
    status: lastEsteira?.acao ?? op?.status ?? null,
    // Signing URL
    url_assinatura: op?.formalizacao ?? null,
  };
}

export async function getOperacaoEsteira(uuid: string) {
  const res = await gfFetch(`/operacoes/${uuid}/esteira`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  // Returns { success, operacao_uuid, esteira: [{acao, motivo, created_at},...] }
  const esteira = data?.esteira ?? [];
  const last = Array.isArray(esteira) && esteira.length > 0 ? esteira[0] : null;
  return {
    ...data,
    status: last?.acao ?? null,
    motivo: last?.motivo ?? null,
  };
}

export async function listarOperacoes(params: {
  status?: string;
  page?: number;
  per_page?: number;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.per_page) qs.set("per_page", String(params.per_page ?? 50));
  if (params.search) qs.set("search", params.search);

  const res = await gfFetch(`/operacoes?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export interface ImplantarPayload {
  // address
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  // bank
  bancario_tipo?: string;       // "TED" | "PIX" | "DOC"
  bancario_cod?: string;        // bank code e.g. "104"
  bancario_agencia?: string;
  bancario_agencia_digito?: string;
  bancario_conta?: string;
  bancario_conta_digito?: string;
  bancario_conta_tipo?: string; // "Corrente" | "Poupança"
  bancario_chave?: string;      // PIX key
  bancario_pix_tipo?: string;
  // contact
  celular?: string;
  email?: string;
}

export async function implantar(uuid: string, payload?: ImplantarPayload) {
  const res = await gfFetch(`/operacoes/${uuid}/implantar`, {
    method: "POST",
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ─── Client Data Endpoints ────────────────────────────────────────────────────
// These 3 endpoints fill the digitação form in GoFintech
// Pattern: PATCH /clientes/{clienteUuid}/{operacaoUuid}/pessoais|endereco|bancario

export interface PessoaisPayload {
  nome?: string;
  nacionalidade?: string;
  nascimento?: string;        // YYYY-MM-DD — ISO date, GF format for /pessoais
  sexo?: "M" | "F" | "O";
  rg_tipo?: string;
  rg_documento?: string;
  rg_emissor?: string;
  rg_uf?: string;
  rg_data_emissao?: string;   // YYYY-MM-DD — ISO date
  filiacao_mae?: string;
  email?: string;
  celular?: string;
  celular_whatsapp?: boolean;
  telefone?: string | null;
  operacao_uuid?: string;
}

/**
 * Normalize any date string to YYYY-MM-DD (ISO format required by GF /pessoais endpoint).
 * Handles: YYYY-MM-DD (pass-through), DD/MM/YYYY (convert), or invalid (returns undefined).
 */
export function normalizeToISODate(date?: string | null): string | undefined {
  if (!date) return undefined;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  // DD/MM/YYYY → YYYY-MM-DD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [d, m, y] = date.split("/");
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

/** @deprecated Use normalizeToISODate — GF expects YYYY-MM-DD, not DD/MM/YYYY */
export function formatDateToGF(date?: string | null): string | undefined {
  return normalizeToISODate(date);
}

export interface EnderecoPayload {
  cep?: string;
  endereco?: string;       // logradouro
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  operacao_uuid?: string;
}

export interface BancarioPayload {
  bancario_tipo?: string;           // "TED" | "PIX" | "DOC"
  bancario_pix_tipo?: string;       // "CPF" | "email" | etc
  bancario_chave?: string;          // PIX key
  bancario_cod?: string;            // bank code
  bancario_nome?: string;           // bank name
  bancario_agencia?: string;
  bancario_agencia_digito?: string;
  bancario_conta?: string;
  bancario_conta_digito?: string;
  bancario_conta_tipo?: string;     // "Corrente" | "Poupança"
  bancario_titular_nome?: string;
  bancario_titular_cpf?: string;
  operacao_uuid?: string;
}

export async function atualizarPessoais(clienteUuid: string, operacaoUuid: string, payload: PessoaisPayload) {
  const res = await gfFetch(`/clientes/${clienteUuid}/${operacaoUuid}/pessoais`, {
    method: "PATCH",
    body: JSON.stringify({ operacao_uuid: operacaoUuid, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`atualizarPessoais failed: ${JSON.stringify(data)}`);
  return data;
}

export async function atualizarEndereco(clienteUuid: string, operacaoUuid: string, payload: EnderecoPayload) {
  const res = await gfFetch(`/clientes/${clienteUuid}/${operacaoUuid}/endereco`, {
    method: "PATCH",
    body: JSON.stringify({ operacao_uuid: operacaoUuid, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`atualizarEndereco failed: ${JSON.stringify(data)}`);
  return data;
}

export async function atualizarBancario(clienteUuid: string, operacaoUuid: string, payload: BancarioPayload) {
  const res = await gfFetch(`/clientes/${clienteUuid}/${operacaoUuid}/bancario`, {
    method: "PATCH",
    body: JSON.stringify({ operacao_uuid: operacaoUuid, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`atualizarBancario failed: ${JSON.stringify(data)}`);
  return data;
}

export async function cancelarOperacao(uuid: string, motivo?: string) {
  const res = await gfFetch(`/operacoes/${uuid}/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo: motivo ?? "Cancelado pelo operador" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ─── Term Status Normalization ────────────────────────────────────────────────
// Maps GoFintech term/solicitacao_status strings → our internal term status

export function normalizarStatusTermo(status: string): string {
  if (!status) return "criada";
  const s = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // elegivel variants
  if (s.includes("elegivel") || s.includes("elegib") || s === "aprovado" || s === "aprovada") return "elegivel";
  // inelegivel / sem margem variants
  if (
    s.includes("inelegivel") || s.includes("sem margem") || s.includes("sem_margem") ||
    s.includes("reprovado") || s.includes("negado") || s.includes("negada") ||
    s.includes("nao elegivel") || s.includes("nao_elegivel") || s.includes("bloqueado")
  ) return "inelegivel";
  // processing
  if (s.includes("process") || s.includes("analise") || s === "criada" || s === "criado" || s === "gerado" || s === "gerada") return "criada";
  // fallback: keep original lowercased
  return s;
}

// ─── Status Normalization ─────────────────────────────────────────────────────

export function normalizarStatus(status: string): string {
  const map: Record<string, string> = {
    PAGO: "PAGA",
    PAGA: "PAGA",
    LIQUIDADO: "PAGA",
    APROVADO: "APROVADA",
    APROVADA: "APROVADA",
    FORMALIZADO: "ASSINADA",
    ASSINADO: "ASSINADA",
    ASSINADA: "ASSINADA",
    "AGUARDANDO ASSINATURA": "AGUARDANDO ASSINATURA",
    "AGUARDA ASSINATURA": "AGUARDANDO ASSINATURA",
    "EM ANÁLISE": "EM ANÁLISE",
    "EM ANALISE": "EM ANÁLISE",
    PENDENTE: "PENDÊNCIA",
    "PENDENTE DOCUMENTACAO": "PENDÊNCIA",
    PENDÊNCIA: "PENDÊNCIA",
    CANCELADO: "CANCELADA",
    CANCELADA: "CANCELADA",
    CANCELAMENTO: "CANCELADA",
    REPROVADO: "REPROVADA",
    REPROVADA: "REPROVADA",
    NEGADO: "REPROVADA",
    NEGADA: "REPROVADA",
    AVERBADO: "AGUARDANDO AVERBAÇÃO",
    "AGUARDANDO AVERBAÇÃO": "AGUARDANDO AVERBAÇÃO",
    ENVIADA: "ENVIADA",
    ENVIADO: "ENVIADA",
    CRIADA: "EM DIGITAÇÃO",
    INICIADA: "EM DIGITAÇÃO",
    FORMALIZANDO: "FORMALIZANDO",
    FORMALIZAÇÃO: "FORMALIZANDO",
    FORMALIZACAO: "FORMALIZANDO",
    FALHA: "FALHA",
    "FALHA ENVIO": "FALHA",
    "FALHA ENVIO HISTORICO": "FALHA",
    REIMPLANTADA: "ENVIADA",
    "EM VÍDEO CHAMADA": "EM ANÁLISE",
    "EM VIDEO CHAMADA": "EM ANÁLISE",
  };
  return map[status?.toUpperCase()] ?? status;
}

// ─── Dados do Cliente ─────────────────────────────────────────────────────────

export async function getDadosCliente(clienteUuid: string) {
  const res = await gfFetch(`/clientes/${clienteUuid}`);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}
