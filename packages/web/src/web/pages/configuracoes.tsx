import { useEffect, useState } from "react";
import { Shell } from "../components/layout/shell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

interface ConfigData {
  nomeEmpresa: string;
  cnpj: string;
  emailSuporte: string;
  telefoneSuporte: string;
  webhookUrl: string;
  maxPropostasAgente: string;
}

const EMPTY: ConfigData = {
  nomeEmpresa: "Axis Capital",
  cnpj: "",
  emailSuporte: "",
  telefoneSuporte: "",
  webhookUrl: "",
  maxPropostasAgente: "50",
};

export default function ConfiguracoesPage() {
  const { user: me } = useAuth();
  const [form, setForm] = useState<ConfigData>({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password change
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.get("/config");
        if (data.config) {
          setForm({ ...EMPTY, ...data.config });
        }
      } catch {
        // config endpoint may not exist yet — use defaults
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.put("/config", form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (novaSenha !== confirmarSenha) {
      setPasswordMsg({ ok: false, text: "Senhas não conferem" });
      return;
    }
    if (novaSenha.length < 6) {
      setPasswordMsg({ ok: false, text: "Senha deve ter no mínimo 6 caracteres" });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await api.put("/auth/password", { senhaAtual, novaSenha });
      setPasswordMsg({ ok: true, text: "Senha alterada com sucesso" });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (e: any) {
      setPasswordMsg({ ok: false, text: e?.message || "Erro ao alterar senha" });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="p-8 text-center text-gray-500">Carregando...</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-500 text-sm mt-1">Configurações gerais da plataforma</p>
        </div>

        {/* System settings — admin only */}
        {me?.role === "admin" && (
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Configurações do Sistema</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 font-medium block mb-1">Nome da Empresa</label>
                <Input
                  value={form.nomeEmpresa}
                  onChange={(e) => setForm({ ...form, nomeEmpresa: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">CNPJ</label>
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">E-mail de Suporte</label>
                <Input
                  type="email"
                  value={form.emailSuporte}
                  onChange={(e) => setForm({ ...form, emailSuporte: e.target.value })}
                  placeholder="suporte@empresa.com"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Telefone de Suporte</label>
                <Input
                  value={form.telefoneSuporte}
                  onChange={(e) => setForm({ ...form, telefoneSuporte: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Máx. propostas/agente</label>
                <Input
                  type="number"
                  value={form.maxPropostasAgente}
                  onChange={(e) => setForm({ ...form, maxPropostasAgente: e.target.value })}
                  min="1"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 font-medium block mb-1">Webhook URL</label>
                <Input
                  value={form.webhookUrl}
                  onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            {saved && <p className="text-green-600 text-xs">Configurações salvas com sucesso!</p>}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar configurações"}
              </Button>
            </div>
          </Card>
        )}

        {/* Password change — all users */}
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Alterar Senha</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Senha atual</label>
              <Input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Nova senha</label>
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Confirmar nova senha</label>
              <Input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {passwordMsg && (
              <p className={`text-xs ${passwordMsg.ok ? "text-green-600" : "text-red-500"}`}>
                {passwordMsg.text}
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={handleChangePassword} disabled={savingPassword}>
              {savingPassword ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </Card>

        {/* User info */}
        <Card className="p-6 space-y-2">
          <h2 className="font-semibold text-gray-800">Informações da Conta</h2>
          <div className="text-sm text-gray-600 space-y-1">
            <p><span className="text-gray-400">Nome:</span> {me?.name}</p>
            <p><span className="text-gray-400">E-mail:</span> {me?.email}</p>
            <p><span className="text-gray-400">Perfil:</span> {me?.role}</p>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
