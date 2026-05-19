import { useEffect, useState } from "react";
import { Shell } from "../components/layout/shell";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { formatDate } from "../lib/utils";

interface AuditLog {
  id: string;
  userId: string;
  userName?: string;
  action: string;
  payload?: string | Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  create_user: "bg-green-50 text-green-700",
  update_user: "bg-blue-50 text-blue-700",
  delete_user: "bg-red-50 text-red-700",
  create_store: "bg-green-50 text-green-700",
  update_store: "bg-blue-50 text-blue-700",
  login: "bg-purple-50 text-purple-700",
  logout: "bg-gray-100 text-gray-600",
};

function actionLabel(action: string) {
  return action.replace(/_/g, " ");
}

function payloadSummary(payload?: string | Record<string, unknown>): string {
  if (!payload) return "—";
  if (typeof payload === "object") {
    return Object.entries(payload)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
  try {
    const obj = JSON.parse(payload);
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  } catch {
    return payload;
  }
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 50;

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      const data = await api.get(`/reports/audit?${params.toString()}`);
      const fetched: AuditLog[] = data.logs || [];
      if (p === 1) {
        setLogs(fetched);
      } else {
        setLogs((prev) => [...prev, ...fetched]);
      }
      setHasMore(fetched.length === PAGE_SIZE);
      setPage(p);
    } catch {
      setError("Erro ao carregar logs de auditoria");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, []);

  const filtered = logs.filter(
    (l) =>
      (l.userName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.ip ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>
            <p className="text-gray-500 text-sm mt-1">Log de todas as ações do sistema</p>
          </div>
        </div>

        <Card className="p-4">
          <Input
            placeholder="Buscar por usuário, ação ou IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </Card>

        <Card>
          {error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                    <th className="text-left p-4">Data / Hora</th>
                    <th className="text-left p-4">Usuário</th>
                    <th className="text-left p-4">Ação</th>
                    <th className="text-left p-4">IP</th>
                    <th className="text-left p-4">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center p-8 text-gray-400">
                        Carregando...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center p-8 text-gray-400">
                        Nenhum log encontrado
                      </td>
                    </tr>
                  ) : (
                    filtered.map((l) => (
                      <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="p-4 text-gray-500 font-mono text-xs whitespace-nowrap">
                          {formatDate(l.createdAt)}
                        </td>
                        <td className="p-4 font-medium text-gray-900">
                          {l.userName || l.userId.slice(0, 8)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              ACTION_COLORS[l.action] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {actionLabel(l.action)}
                          </span>
                        </td>
                        <td className="p-4 text-gray-500 font-mono text-xs">
                          {l.ip || "—"}
                        </td>
                        <td className="p-4 text-gray-500 text-xs max-w-xs truncate">
                          {payloadSummary(l.payload)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {hasMore && (
                <div className="p-4 text-center">
                  <Button
                    variant="outline"
                    onClick={() => fetchLogs(page + 1)}
                    disabled={loading}
                  >
                    {loading ? "Carregando..." : "Carregar mais"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
