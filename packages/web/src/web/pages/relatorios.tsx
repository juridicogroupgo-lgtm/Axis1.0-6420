import { useEffect, useState } from "react";
import { Shell } from "../components/layout/shell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { StatusBadge } from "../components/ui/badge";
import { api, apiJson } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";

interface ReportRow {
  id: string;
  contractNumber: string;
  customerName: string;
  cpf: string;
  amount: number;
  installmentValue?: number;
  installments?: number;
  rate?: number;
  tableName: string;
  fund: string;
  status: string;
  digitador: string;
  store: string;
  manager: string;
  paidAt: string;
  createdAt: string;
}

export default function RelatoriosPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  const fetchStores = async () => {
    try {
      const data = await apiJson("/stores");
      setStores(data.stores || []);
    } catch {}
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.set("from", dataInicio);
      if (dataFim) params.set("to", dataFim);
      if (status) params.set("status", status);
      if (storeId) params.set("storeId", storeId);
      const data = await apiJson(`/reports?${params.toString()}`);
      setRows(data.rows || []);
    } catch {
      setError("Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
    fetchReport();
  }, []);

  const exportCSV = () => {
    if (rows.length === 0) return;
    const headers = ["Cliente","CPF","Loja","Digitador","Valor","Parcela","Prazo","Status","Data"];
    const lines = rows.map((r) =>
      [
        r.customerName,
        r.cpf,
        r.store,
        r.digitador,
        r.amount,
        r.installmentValue ?? "",
        r.installments ? `${r.installments}x` : "",
        r.status,
        r.createdAt,
      ].join(";")
    );
    const csv = [headers.join(";"), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_axis_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary computed client-side
  const total = rows.length;
  const aprovadas = rows.filter(r => ["APROVADA","PAGA","ASSINADA"].includes(r.status?.toUpperCase())).length;
  const reprovadas = rows.filter(r => r.status?.toUpperCase().includes("REPROV")).length;
  const valorTotal = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
            <p className="text-gray-500 text-sm mt-1">Análise de propostas e conversão</p>
          </div>
          <Button onClick={exportCSV} variant="outline" disabled={rows.length === 0}>
            ↓ Exportar CSV
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data início</label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-36"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data fim</label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-36"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Loja</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={fetchReport} disabled={loading}>
              {loading ? "Carregando..." : "Filtrar"}
            </Button>
          </div>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{total}</p>
            <p className="text-xs text-gray-500 mt-1">Total</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{aprovadas}</p>
            <p className="text-xs text-gray-500 mt-1">Aprovadas</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{reprovadas}</p>
            <p className="text-xs text-gray-500 mt-1">Reprovadas</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xl font-bold text-blue-600">{formatCurrency(valorTotal)}</p>
            <p className="text-xs text-gray-500 mt-1">Valor Total</p>
          </Card>
        </div>

        {/* Table */}
        <Card>
          {error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                    <th className="text-left p-4">Cliente</th>
                    <th className="text-left p-4">CPF</th>
                    <th className="text-left p-4">Loja</th>
                    <th className="text-left p-4">Digitador</th>
                    <th className="text-left p-4">Valor</th>
                    <th className="text-left p-4">Parcela</th>
                    <th className="text-left p-4">Prazo</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center p-8 text-gray-400">
                        Nenhum dado encontrado para os filtros aplicados
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="p-4 font-medium text-gray-900">{r.customerName}</td>
                        <td className="p-4 text-gray-500 font-mono text-xs">{r.cpf}</td>
                        <td className="p-4 text-gray-600">{r.store}</td>
                        <td className="p-4 text-gray-600">{r.digitador}</td>
                        <td className="p-4 text-gray-900">{formatCurrency(r.amount)}</td>
                        <td className="p-4 text-gray-600">
                          {r.installmentValue ? formatCurrency(r.installmentValue) : "—"}
                        </td>
                        <td className="p-4 text-gray-600">
                          {r.installments ? `${r.installments}x` : "—"}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={r.status} size="sm" />
                        </td>
                        <td className="p-4 text-gray-500">{r.createdAt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
