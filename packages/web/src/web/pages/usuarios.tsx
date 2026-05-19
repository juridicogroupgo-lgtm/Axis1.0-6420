import { useEffect, useState } from "react";
import { Shell } from "../components/layout/shell";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, apiJson } from "../lib/api";
import { formatDate } from "../lib/utils";
import { useAuth } from "../lib/auth-context";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  storeId?: string;
  storeName?: string;
  active: boolean;
  createdAt: string;
}

interface Store {
  id: string;
  name: string;
}

const roleLabel: Record<string, string> = {
  admin: "Admin",
  gerente: "Gerente",
  loja: "Loja",
  digitador: "Digitador",
};

const roleVariant: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  gerente: "secondary",
  loja: "outline",
  digitador: "outline",
};

const EMPTY_FORM = {
  name: "",
  email: "",
  senha: "",
  role: "digitador",
  storeId: "",
};

export default function UsuariosPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiJson("/users");
      setUsers(data.users || []);
    } catch {
      setError("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const data = await apiJson("/stores");
      setStores(data.stores || []);
    } catch {}
  };

  useEffect(() => {
    fetchUsers();
    fetchStores();
  }, []);

  const openCreate = () => {
    setEditUser(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({
      name: u.name,
      email: u.email,
      senha: "",
      role: u.role,
      storeId: u.storeId || "",
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Nome é obrigatório"); return; }
    if (!form.email.trim()) { setError("E-mail é obrigatório"); return; }
    if (!editUser && !form.senha.trim()) { setError("Senha é obrigatória"); return; }

    setSaving(true);
    setError(null);
    try {
      if (editUser) {
        const body: Record<string, any> = {
          name: form.name,
          email: form.email,
          role: form.role,
          storeId: form.storeId || null,
        };
        if (form.senha) body.password = form.senha;
        const res = await api.put(`/users/${editUser.id}`, body);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erro ao atualizar usuário");
      } else {
        const res = await api.post("/users", {
          name: form.name,
          email: form.email,
          password: form.senha,
          role: form.role,
          storeId: form.storeId || undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erro ao criar usuário");
      }
      setShowModal(false);
      fetchUsers();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      fetchUsers();
    } catch {}
  };

  const handleDeleteUser = async (u: User) => {
    if (!confirm(`Excluir o usuário ${u.name}?`)) return;
    try {
      const res = await api.delete(`/users/${u.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro ao excluir usuário");
      fetchUsers();
    } catch (e: any) {
      setError(e?.message || "Erro ao excluir usuário");
    }
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const canManage = me?.role === "admin" || me?.role === "gerente" || me?.role === "loja";

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
            <p className="text-gray-500 text-sm mt-1">Gerencie os usuários da plataforma</p>
          </div>
          {canManage && (
            <Button onClick={openCreate}>+ Novo Usuário</Button>
          )}
        </div>

        <Card className="p-4">
          <Input
            placeholder="Buscar por nome ou e-mail..."
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
                    <th className="text-left p-4">E-mail</th>
                    <th className="text-left p-4">Perfil</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Criado em</th>
                    {canManage && <th className="text-right p-4">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-gray-400">
                        Nenhum usuário encontrado
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="p-4 font-medium text-gray-900">{u.name}</td>
                        <td className="p-4 text-gray-600">{u.email}</td>
                        <td className="p-4">
                          <Badge variant={roleVariant[u.role] || "outline"}>
                            {roleLabel[u.role] || u.role}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              u.active
                                ? "bg-green-50 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {u.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="p-4 text-gray-500">{formatDate(u.createdAt)}</td>
                        {canManage && (
                          <td className="p-4 text-right space-x-2">
                            <button
                              onClick={() => openEdit(u)}
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Editar
                            </button>
                            {me?.role === "admin" && (
                              <>
                                <button
                                  onClick={() => handleToggleActive(u)}
                                  className={`text-xs hover:underline ${
                                    u.active ? "text-red-500" : "text-green-600"
                                  }`}
                                >
                                  {u.active ? "Desativar" : "Ativar"}
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="text-xs text-red-700 hover:underline"
                                >
                                  Excluir
                                </button>
                              </>
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
              {editUser ? "Editar Usuário" : "Novo Usuário"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Nome</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">E-mail</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">
                  Senha {editUser && "(deixe em branco para não alterar)"}
                </label>
                <Input
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {me?.role === "admin" && <option value="admin">Admin</option>}
                  {(me?.role === "admin") && <option value="gerente">Gerente</option>}
                  {(me?.role === "admin" || me?.role === "gerente") && <option value="loja">Loja</option>}
                  <option value="digitador">Digitador</option>
                </select>
              </div>
              {(form.role === "loja" || form.role === "digitador") && (
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Loja</label>
                  <select
                    value={form.storeId}
                    onChange={(e) => setForm({ ...form, storeId: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sem loja</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
