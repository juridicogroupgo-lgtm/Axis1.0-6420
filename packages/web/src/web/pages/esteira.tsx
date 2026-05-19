import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Shell } from "../components/layout/shell";
import { StatusBadge } from "../components/ui/badge";
import { getProposals } from "../lib/api";
import { formatCurrency, formatCPF, formatDate } from "../lib/utils";
import { maskTableName } from "../../lib/maskTableName";
import { useAuth } from "../lib/auth-context";

const COLUMNS = [
  { id: "EM DIGITAÇÃO", label: "Em Digitação", color: "#71717A" },
  { id: "ENVIADA", label: "Enviada", color: "#A78BFA" },
  { id: "EM ANÁLISE", label: "Em Análise", color: "#F59E0B" },
  { id: "PENDÊNCIA", label: "Pendência", color: "#F97316" },
  { id: "AGUARDANDO ASSINATURA", label: "Ag. Assinatura", color: "#60A5FA" },
  { id: "FORMALIZANDO", label: "Formalizando", color: "#60A5FA" },
  { id: "ASSINADA", label: "Assinada", color: "#3B82F6" },
  { id: "AGUARDANDO AVERBAÇÃO", label: "Ag. Averbação", color: "#8B5CF6" },
  { id: "PAGA", label: "Paga", color: "#22C55E" },
  { id: "CANCELADA", label: "Cancelada", color: "#EF4444" },
  { id: "REPROVADA", label: "Reprovada", color: "#EF4444" },
];

type ViewMode = "kanban" | "lista";

function getViewPrefKey(userId: string) {
  return `esteira_view_${userId}`;
}

function loadViewPref(userId: string): ViewMode {
  try {
    const v = localStorage.getItem(getViewPrefKey(userId));
    if (v === "kanban" || v === "lista") return v;
  } catch {}
  return "kanban";
}

function saveViewPref(userId: string, mode: ViewMode) {
  try {
    localStorage.setItem(getViewPrefKey(userId), mode);
  } catch {}
}

// ─── Toggle component ────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div style={{
      display: "flex",
      background: "#18181B",
      border: "1px solid #27272A",
      borderRadius: 8,
      padding: 3,
      gap: 2,
    }}>
      {(["kanban", "lista"] as ViewMode[]).map(mode => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={mode === "kanban" ? "Visão Kanban" : "Visão Lista"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: view === mode ? "#27272A" : "transparent",
            border: "none",
            borderRadius: 6,
            padding: "5px 12px",
            cursor: "pointer",
            color: view === mode ? "#FAFAFA" : "#71717A",
            fontSize: 12,
            fontWeight: 500,
            transition: "all 150ms",
          }}
        >
          {mode === "kanban" ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="4" height="14" rx="1.5" fill="currentColor" opacity="0.9"/>
              <rect x="6" y="1" width="4" height="10" rx="1.5" fill="currentColor" opacity="0.9"/>
              <rect x="11" y="1" width="4" height="12" rx="1.5" fill="currentColor" opacity="0.9"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="2.5" rx="1.25" fill="currentColor" opacity="0.9"/>
              <rect x="1" y="6.75" width="14" height="2.5" rx="1.25" fill="currentColor" opacity="0.9"/>
              <rect x="1" y="11.5" width="14" height="2.5" rx="1.25" fill="currentColor" opacity="0.9"/>
            </svg>
          )}
          {mode === "kanban" ? "Kanban" : "Lista"}
        </button>
      ))}
    </div>
  );
}

// ─── Kanban view ─────────────────────────────────────────────────────────────

function KanbanView({ grouped, navigate }: { grouped: any[]; navigate: (path: string) => void }) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      overflowX: "auto",
      paddingBottom: 16,
      minHeight: "calc(100vh - 180px)",
    }}>
      {grouped.map(col => (
        <div
          key={col.id}
          style={{
            minWidth: 240,
            maxWidth: 240,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Column header */}
          <div style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "#18181B",
            border: `1px solid ${col.color}30`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, display: "inline-block" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#FAFAFA" }}>{col.label}</span>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: col.color,
              background: col.color + "20",
              padding: "1px 7px",
              borderRadius: 999,
            }}>{col.items.length}</span>
          </div>

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            {col.items.map((p: any) => (
              <div
                key={p.id}
                className="fade-in"
                onClick={() => navigate(`/propostas/${p.id}`)}
                style={{
                  background: "#18181B",
                  border: "1px solid #27272A",
                  borderRadius: 8,
                  padding: "12px 14px",
                  cursor: "pointer",
                  transition: "border-color 150ms, transform 150ms",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#3F3F46";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#27272A";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA", marginBottom: 6 }}>
                  {p.customerName ?? formatCPF(p.cpf)}
                </div>
                <div style={{ fontSize: 11, color: "#52525B", marginBottom: 6 }}>
                  CPF: {formatCPF(p.cpf)}
                </div>
                {p.amount && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#22C55E", marginBottom: 4 }}>
                    {formatCurrency(p.amount)}
                  </div>
                )}
                {p.installments && (
                  <div style={{ fontSize: 11, color: "#71717A", marginBottom: 8 }}>
                    {p.installments}x {formatCurrency(p.installmentValue)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#52525B" }}>
                  {p.tableName && <span style={{ color: "#A78BFA" }}>{maskTableName(p.tableName)}</span>}
                </div>
                {p.signatureUrl && (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      marginTop: 8, fontSize: 11, color: "#60A5FA",
                      cursor: "pointer",
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      window.open(p.signatureUrl!, "_blank");
                    }}
                  >
                    <span>🔗</span>
                    <span style={{ textDecoration: "underline" }}>Link Formalização</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#52525B", marginTop: 6 }}>
                  {formatDate(p.createdAt)}
                </div>
              </div>
            ))}

            {col.items.length === 0 && (
              <div style={{
                padding: "20px 14px",
                borderRadius: 8,
                border: "1px dashed #27272A",
                textAlign: "center",
                color: "#3F3F46",
                fontSize: 12,
              }}>
                Nenhuma proposta
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Lista view ───────────────────────────────────────────────────────────────

function ListaView({ proposals, navigate }: { proposals: any[]; navigate: (path: string) => void }) {
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const filtered = proposals
    .filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (p.customerName ?? "").toLowerCase().includes(q) ||
        (p.cpf ?? "").includes(q) ||
        (p.statusPadronizado ?? p.status ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let av = a[sortField] ?? "";
      let bv = b[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 600,
    color: "#71717A",
    textAlign: "left",
    borderBottom: "1px solid #27272A",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    background: "#18181B",
  };

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF ou status..."
          style={{
            background: "#18181B",
            border: "1px solid #27272A",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            color: "#FAFAFA",
            outline: "none",
            width: 320,
          }}
        />
        <span style={{ fontSize: 12, color: "#52525B" }}>
          {filtered.length} proposta{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={{
        background: "#18181B",
        border: "1px solid #27272A",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => toggleSort("customerName")}>
                Cliente <SortIcon field="customerName" />
              </th>
              <th style={thStyle} onClick={() => toggleSort("cpf")}>
                CPF <SortIcon field="cpf" />
              </th>
              <th style={thStyle} onClick={() => toggleSort("statusPadronizado")}>
                Status <SortIcon field="statusPadronizado" />
              </th>
              <th style={{ ...thStyle, textAlign: "right" }} onClick={() => toggleSort("amount")}>
                Valor <SortIcon field="amount" />
              </th>
              <th style={thStyle} onClick={() => toggleSort("installments")}>
                Parcelas <SortIcon field="installments" />
              </th>
              <th style={thStyle} onClick={() => toggleSort("tableName")}>
                Tabela <SortIcon field="tableName" />
              </th>
              <th style={thStyle} onClick={() => toggleSort("createdAt")}>
                Data <SortIcon field="createdAt" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "32px 14px", textAlign: "center", color: "#3F3F46", fontSize: 13 }}>
                  Nenhuma proposta encontrada
                </td>
              </tr>
            )}
            {filtered.map((p, i) => {
              const status = p.statusPadronizado ?? p.status ?? "";
              const col = COLUMNS.find(c => c.id === status);
              const color = col?.color ?? "#52525B";
              return (
                <tr
                  key={p.id}
                  className="fade-in"
                  onClick={() => navigate(`/propostas/${p.id}`)}
                  style={{
                    cursor: "pointer",
                    borderTop: i === 0 ? "none" : "1px solid #27272A",
                    transition: "background 120ms",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#1C1C1F"}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                >
                  <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, color: "#FAFAFA" }}>
                    {p.customerName ?? "—"}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#71717A", fontVariantNumeric: "tabular-nums" }}>
                    {formatCPF(p.cpf)}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color,
                      background: color + "18",
                      padding: "3px 9px",
                      borderRadius: 999,
                      border: `1px solid ${color}30`,
                    }}>
                      {col?.label ?? status}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#22C55E", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {p.amount ? formatCurrency(p.amount) : "—"}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#71717A" }}>
                    {p.installments ? `${p.installments}x ${formatCurrency(p.installmentValue)}` : "—"}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#A78BFA" }}>
                    {p.tableName ? maskTableName(p.tableName) : "—"}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#52525B", whiteSpace: "nowrap" }}>
                    {formatDate(p.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function EsteiraPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();
  const prevIds = useRef(new Set<string>());

  // Load view preference per user
  const [view, setView] = useState<ViewMode>(() =>
    user ? loadViewPref(user.id) : "kanban"
  );

  function handleViewChange(mode: ViewMode) {
    setView(mode);
    if (user) saveViewPref(user.id, mode);
  }

  async function fetchProposals() {
    try {
      const data = await getProposals();
      setProposals(data);
      prevIds.current = new Set(data.map((p: any) => p.id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProposals();
    const interval = setInterval(fetchProposals, 5000);
    return () => clearInterval(interval);
  }, []);

  // Sync pref when user loads
  useEffect(() => {
    if (user) setView(loadViewPref(user.id));
  }, [user?.id]);

  const grouped = COLUMNS.map(col => ({
    ...col,
    items: proposals.filter(p => {
      const s = p.statusPadronizado ?? p.status;
      return s === col.id;
    }),
  }));

  return (
    <Shell
      title="Esteira Operacional"
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ViewToggle view={view} onChange={handleViewChange} />
          <button
            onClick={() => navigate("/propostas/nova")}
            style={{
              background: "#7C3AED", color: "#FAFAFA", border: "none",
              borderRadius: 6, padding: "8px 16px", fontSize: 13,
              fontWeight: 500, cursor: "pointer",
            }}
          >
            + Nova Proposta
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ color: "#52525B", textAlign: "center", padding: 60 }}>Carregando esteira...</div>
      ) : view === "kanban" ? (
        <KanbanView grouped={grouped} navigate={navigate} />
      ) : (
        <ListaView proposals={proposals} navigate={navigate} />
      )}
    </Shell>
  );
}
