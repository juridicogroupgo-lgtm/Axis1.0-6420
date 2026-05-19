const BASE = "/api";

function getToken() {
  return localStorage.getItem("axis_token");
}

export function setToken(token: string) {
  localStorage.setItem("axis_token", token);
}

export function clearToken() {
  localStorage.removeItem("axis_token");
  localStorage.removeItem("axis_user");
}

export function getStoredUser() {
  try {
    const u = localStorage.getItem("axis_user");
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function setStoredUser(user: any) {
  localStorage.setItem("axis_user", JSON.stringify(user));
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((opts.headers ?? {}) as Record<string, string>),
  };

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  return res;
}

export const api = {
  get: (path: string) => apiFetch(path),
  post: (path: string, body?: any) =>
    apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: any) =>
    apiFetch(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: any) =>
    apiFetch(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: (path: string) => apiFetch(path, { method: "DELETE" }),
};

export async function apiJson<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await apiFetch(path, opts ?? {});
  return res.json();
}

// Auth
export async function login(email: string, password: string) {
  const res = await api.post("/auth/login", { email, password });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Erro ao fazer login");
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
  clearToken();
}

export async function setupAdmin(name: string, email: string, password: string) {
  const res = await api.post("/auth/setup", { name, email, password });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

// Users
export async function getUsers() {
  const data = await apiJson("/users");
  return data.users ?? [];
}

export async function createUser(body: any) {
  const res = await api.post("/users", body);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

export async function updateUser(id: string, body: any) {
  const res = await api.put(`/users/${id}`, body);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

// Stores
export async function getStores() {
  const data = await apiJson("/stores");
  return data.stores ?? [];
}

export async function createStore(body: any) {
  const res = await api.post("/stores", body);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

// Proposals
export async function getProposals() {
  const data = await apiJson("/proposals");
  return data.proposals ?? [];
}

export async function getProposal(id: string) {
  return apiJson(`/proposals/${id}`);
}

export async function getTerms() {
  const data = await apiJson("/proposals/terms");
  return data.terms ?? [];
}

export async function startProposal(cpf: string) {
  const res = await api.post("/proposals/start", { cpf });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.detail);
  return data;
}

export async function submitTermManual(body: any) {
  const res = await api.post("/proposals/term-manual", body);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

export async function pollTerm(termId: string) {
  return apiJson(`/proposals/term/${termId}/poll`);
}

export async function getSimulations(termId: string) {
  const data = await apiJson(`/proposals/term/${termId}/simulations`);
  // Returns { simulations, margem, produto, tabelas }
  return data;
}

export async function selectSimulation(termId: string, simulacaoUuid: string) {
  const res = await api.post(`/proposals/term/${termId}/simulations/select`, { simulacaoUuid });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

export async function submitProposal(body: any) {
  const res = await api.post("/proposals/submit", body);
  const data = await res.json();
  if (!res.ok) {
    // data.detail can be a stringified JSON — extract the human message
    let msg = data.message;
    if (!msg && data.detail) {
      try {
        const parsed = typeof data.detail === "string" ? JSON.parse(data.detail) : data.detail;
        msg = parsed.message ?? data.detail;
      } catch {
        msg = data.detail;
      }
    }
    throw new Error(msg ?? "Erro desconhecido");
  }
  return data;
}

export async function pollProposal(id: string) {
  const res = await api.post(`/proposals/${id}/poll`);
  return res.json();
}

export async function cancelProposal(id: string, motivo?: string) {
  const res = await api.post(`/proposals/${id}/cancel`, { motivo });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

export async function getSignData(id: string) {
  return apiJson(`/proposals/${id}/sign`);
}

// Dashboard
export async function getDashboardStats() {
  return apiJson("/dashboard/stats");
}

export async function getRanking() {
  const data = await apiJson("/dashboard/ranking");
  return data.ranking ?? [];
}

// Reports
export async function getReports(filters?: Record<string, string>) {
  const qs = filters ? "?" + new URLSearchParams(filters).toString() : "";
  const data = await apiJson(`/reports${qs}`);
  return data;
}
