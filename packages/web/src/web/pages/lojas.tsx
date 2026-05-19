import { useEffect, useState } from "react";
import { Shell } from "../components/layout/shell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, apiJson } from "../lib/api";
import { formatDate } from "../lib/utils";
import { useAuth } from "../lib/auth-context";

interface Store {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

const EMPTY_FORM = {
  name: "",
};

export default function LojasPage() {
  const { user: me } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchStores = async () => {
    setLoading(true);
    try {
      const data = await apiJson("/stores");
      setStores(data.stores || []);
    } catch {
      setError("Erro ao carregar lojas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const openCreate = () => {
    setEditStore(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
    setShowModal(true);
  };

  const openEdit = (s: Store) => {
    setEditStore(s);
    setForm({ name: s.name });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editStore) {
        await api.put(`/stores/${editStore.id}`, { name: form.name });
      } else {
        await api.post("/stores", { name: form.name });
      }
      setShowModal(false);
      fetchStores();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (s: Store) => {
    try {
      await api.put(`/stores/${s.id}`, { active: !s.active });
      fetchStores();
    } catch {}
  };

  const filtered = stores.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = me?.role === "admin";
  const canManage = me?.role === "admin" || me?.role === "gerente";

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lojas</h1>
            <p className="text-gray-500 text-sm mt-1">Gerencie as lojas parceiras</p>
          </div>
          {canManage && (
            <Button onClick={openCreate}>+ Nova Loja</Button>
          )}
        </div>

        <Card className="p-4">
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </Card>

        <Card>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                    <th className="text-left p-4">Nome</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Criada em</th>
                    {canManage && <th className="text-right p-4">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-8 text-gray-400">
                        Nenhuma loja encontrada
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="p-4 font-medium text-gray-900">{s.name}</td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              s.active
                                ? "bg-green-50 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {s.active ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        <td className="p-4 text-gray-500">{formatDate(s.createdAt)}</td>
                        {canManage && (
                          <td className="p-4 text-right space-x-2">
                            <button
                              onClick={() => openEdit(s)}
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Editar
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleToggle(s)}
                                className={`text-xs hover:underline ${
                                  s.active ? "text-red-500" : "text-green-600"
                                }`}
                              >
                                {s.active ? "Desativar" : "Ativar"}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editStore ? "Editar Loja" : "Nova Loja"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Nome da Loja *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ name: e.target.value })}
                  placeholder="Ex: Loja Centro"
                />
              </div>
              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.name}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
