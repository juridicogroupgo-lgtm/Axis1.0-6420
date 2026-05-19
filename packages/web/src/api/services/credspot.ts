const CREDSPOT_BASE_URL = process.env.CREDSPOT_BASE_URL ?? "https://api.credspot.net/api/v1";
const CREDSPOT_AUTH_URL = process.env.CREDSPOT_AUTH_URL ?? "https://auth.credspot.net/oauth/token";
const CREDSPOT_CLIENT_ID = process.env.CREDSPOT_CLIENT_ID ?? "";
const CREDSPOT_CLIENT_SECRET = process.env.CREDSPOT_CLIENT_SECRET ?? "";
const CREDSPOT_AUDIENCE = process.env.CREDSPOT_AUDIENCE ?? "https://api.credspot.net/";

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  if (!CREDSPOT_CLIENT_ID || !CREDSPOT_CLIENT_SECRET) throw new Error("Credspot credentials missing");

  const res = await fetch(CREDSPOT_AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: CREDSPOT_CLIENT_ID,
      client_secret: CREDSPOT_CLIENT_SECRET,
      audience: CREDSPOT_AUDIENCE,
      grant_type: "client_credentials",
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Credspot auth failed: ${res.status} ${JSON.stringify(data)}`);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000) };
  return tokenCache.token;
}

async function credFetch(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const headers = {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  };
  return fetch(`${CREDSPOT_BASE_URL}${path}`, { ...options, headers });
}

export async function createCredspotUser(payload: Record<string, unknown>) {
  const res = await credFetch("/users", { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function createConsent(payload: { userUuid: string }) {
  const res = await credFetch("/clt/consent", { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function createMargin(payload: { userUuid: string; eligibilityUuid: string }) {
  const res = await credFetch("/clt/margin", { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function createOffer(payload: Record<string, unknown>) {
  const res = await credFetch("/clt/offer", { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function createContract(payload: Record<string, unknown>) {
  const res = await credFetch("/clt/contract", { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function listWebhookEndpoints() {
  const res = await credFetch("/webhooks/endpoints");
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function registerWebhookEndpoint(url: string, description?: string) {
  const res = await credFetch("/webhooks/endpoints", {
    method: "POST",
    body: JSON.stringify({ url, description }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export function maskCredspotTableName(name?: string | null) {
  const n = (name ?? "").toUpperCase();
  if (n.includes("SMART")) return "É PENTA";
  if (n.includes("RET")) return "HEXA CAMPEÃO";
  if (n.includes("GNAISSE")) return "HEXA-CAMPEÃO (COM SEGURO)";
  if (n.includes("TURQUESA")) return "É PENTA";
  if (n.includes("ARDÓSIA") || n.includes("ARDOSIA")) return "SAI QUE É SUA TAFFAREL";
  return name ?? "—";
}

export const providerDisplayName = "Go Financeira";
