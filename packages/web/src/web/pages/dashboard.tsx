import { useEffect, useState } from "react";
import { Shell } from "../components/layout/shell";
import { Card, StatCard } from "../components/ui/card";
import { getDashboardStats, getRanking } from "../lib/api";
import { formatCurrency } from "../lib/utils";

interface Stats {
  cards: {
    paidToday: { count: number; amount: number };
    paidMonth: { count: number; amount: number };
    paidYear: { count: number; amount: number };
    total: number;
    byStatus: Record<string, number>;
  };
  daily: { date: string; count: number; amount: number }[];
  monthly: { month: string; count: number; amount: number }[];
  funnel: { stage: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  "PAGA": "Desembolsadas",
  "ASSINADA": "Assinadas",
  "EM ANÁLISE": "Em Análise",
  "PENDÊNCIA": "Pendências",
  "CANCELADA": "Canceladas",
  "REPROVADA": "Reprovadas",
  "AGUARDANDO AVERBAÇÃO": "Ag. Averbação",
  "AGUARDANDO ASSINATURA": "Ag. Assinatura",
  "ENVIADA": "Enviadas",
};

const STATUS_COLORS: Record<string, string> = {
  "PAGA": "#22C55E",
  "ASSINADA": "#3B82F6",
  "EM ANÁLISE": "#F59E0B",
  "PENDÊNCIA": "#F97316",
  "CANCELADA": "#EF4444",
  "REPROVADA": "#EF4444",
  "AGUARDANDO AVERBAÇÃO": "#8B5CF6",
  "AGUARDANDO ASSINATURA": "#60A5FA",
  "ENVIADA": "#A78BFA",
};

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  async function fetchData() {
    try {
      const [s, r] = await Promise.all([getDashboardStats(), getRanking()]);
      setStats(s);
      setRanking(r);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <Shell title="Dashboard">
      <div style={{ color: "#52525B", padding: 40, textAlign: "center" }}>Carregando...</div>
    </Shell>
  );

  const s = stats;

  return (
    <Shell
      title="Dashboard"
      actions={
        <span style={{ fontSize: 12, color: "#52525B" }}>
          Atualizado: {lastUpdate.toLocaleTimeString("pt-BR")}
        </span>
      }
    >
      {/* Top KPI Cards */}
      <div className="grid-stats-4">
        <StatCard
          label="Desembolsadas Hoje"
          value={s?.cards.paidToday.count ?? 0}
          sub={formatCurrency(s?.cards.paidToday.amount ?? 0)}
          color="#22C55E"
          icon="💰"
        />
        <StatCard
          label="Desembolsadas no Mês"
          value={s?.cards.paidMonth.count ?? 0}
          sub={formatCurrency(s?.cards.paidMonth.amount ?? 0)}
          color="#3B82F6"
          icon="📅"
        />
        <StatCard
          label="Desembolsadas no Ano"
          value={s?.cards.paidYear.count ?? 0}
          sub={formatCurrency(s?.cards.paidYear.amount ?? 0)}
          color="#8B5CF6"
          icon="📈"
        />
        <StatCard
          label="Total Propostas"
          value={s?.cards.total ?? 0}
          sub="todas as propostas"
          icon="📋"
        />
      </div>

      {/* Status breakdown */}
      <div className="grid-status-4">
        {Object.entries(s?.cards.byStatus ?? {}).map(([status, count]) => (
          <div key={status} style={{
            background: "#18181B",
            border: "1px solid #27272A",
            borderRadius: 8,
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 13, color: "#A1A1AA" }}>
              {STATUS_LABELS[status] ?? status}
            </span>
            <span style={{
              fontSize: 16, fontWeight: 700,
              color: STATUS_COLORS[status] ?? "#FAFAFA",
            }}>
              {count}
            </span>
          </div>
        ))}
      </div>

      <div className="grid-2col" style={{ marginBottom: 24 }}>
        {/* Daily Chart (simple bars) */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", marginBottom: 16 }}>
            Produção Diária (30 dias)
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
            {(s?.daily ?? []).slice(-30).map((d, i) => {
              const max = Math.max(...(s?.daily ?? []).map(x => x.count), 1);
              const h = Math.max((d.count / max) * 90, 2);
              return (
                <div key={i} title={`${d.date}: ${d.count} propostas`} style={{ flex: 1 }}>
                  <div style={{
                    height: h,
                    background: d.count > 0 ? "#7C3AED" : "#27272A",
                    borderRadius: "2px 2px 0 0",
                    transition: "height 300ms",
                    opacity: d.count > 0 ? 1 : 0.3,
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 11, color: "#52525B" }}>30 dias atrás</span>
            <span style={{ fontSize: 11, color: "#52525B" }}>Hoje</span>
          </div>
        </Card>

        {/* Monthly Chart */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", marginBottom: 16 }}>
            Produção Mensal (12 meses)
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
            {(s?.monthly ?? []).map((m, i) => {
              const max = Math.max(...(s?.monthly ?? []).map(x => x.count), 1);
              const h = Math.max((m.count / max) * 90, 2);
              const label = m.month.slice(5);
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: "100%",
                    height: h,
                    background: m.count > 0 ? "#8B5CF6" : "#27272A",
                    borderRadius: "2px 2px 0 0",
                    opacity: m.count > 0 ? 1 : 0.3,
                  }} />
                  <span style={{ fontSize: 9, color: "#52525B", marginTop: 3 }}>{label}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid-2col">
        {/* Funnel */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", marginBottom: 16 }}>
            Funil de Conversão
          </div>
          {(s?.funnel ?? []).map((f, i) => {
            const max = Math.max(...(s?.funnel ?? []).map(x => x.count), 1);
            const w = Math.max((f.count / max) * 100, 4);
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#A1A1AA" }}>{f.stage}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#FAFAFA" }}>{f.count}</span>
                </div>
                <div style={{ height: 6, background: "#27272A", borderRadius: 3 }}>
                  <div style={{
                    height: "100%",
                    width: `${w}%`,
                    background: `hsl(${265 - i * 15}, 70%, 60%)`,
                    borderRadius: 3,
                    transition: "width 500ms",
                  }} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Ranking */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", marginBottom: 16 }}>
            Ranking de Produção
          </div>
          {ranking.length === 0 ? (
            <div style={{ color: "#52525B", fontSize: 13 }}>Nenhuma produção ainda.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ranking.map((r, i) => (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 12px", borderRadius: 6,
                  background: i === 0 ? "rgba(124, 58, 237, 0.1)" : "transparent",
                }}>
                  <span style={{
                    width: 24, height: 24,
                    borderRadius: "50%",
                    background: i === 0 ? "#7C3AED" : "#27272A",
                    color: "#FAFAFA",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#FAFAFA" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#52525B" }}>{r.count} proposta{r.count !== 1 ? "s" : ""}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#22C55E" }}>
                    {formatCurrency(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
