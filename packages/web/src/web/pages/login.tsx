import { useState } from "react";
import { useLocation } from "wouter";
import { login, setupAdmin } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export function LoginPage() {
  const [, navigate] = useLocation();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupName, setSetupName] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(email, password);
      setUser(data.user);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await setupAdmin(setupName, email, password);
      const data = await login(email, password);
      setUser(data.user);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Erro ao criar admin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090B",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}>
      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.08) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      <div className="fade-in" style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56, height: 56,
            background: "linear-gradient(135deg, #7C3AED, #4C1D95)",
            borderRadius: 14,
            marginBottom: 16,
            fontSize: 28, fontWeight: 700,
            boxShadow: "0 0 40px rgba(124, 58, 237, 0.4)",
          }}>A</div>
          <h1 style={{
            margin: 0, fontSize: 28, fontWeight: 700,
            color: "#FAFAFA", letterSpacing: "-0.5px",
          }}>
            <span style={{ color: "#8B5CF6" }}>AXIS</span> Capital
          </h1>
          <p style={{ margin: "8px 0 0", color: "#52525B", fontSize: 14 }}>
            Crédito do Trabalhador
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "#111113",
          border: "1px solid #27272A",
          borderRadius: 14,
          padding: 32,
        }}>
          <h2 style={{ margin: "0 0 24px", fontSize: 16, fontWeight: 600, color: "#FAFAFA" }}>
            {setupMode ? "Configuração Inicial" : "Entrar na plataforma"}
          </h2>

          <form onSubmit={setupMode ? handleSetup : handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {setupMode && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, color: "#A1A1AA" }}>Nome completo</label>
                <input
                  value={setupName}
                  onChange={e => setSetupName(e.target.value)}
                  placeholder="Seu nome"
                  required
                  style={{
                    background: "#18181B", border: "1px solid #27272A", borderRadius: 6,
                    padding: "10px 14px", color: "#FAFAFA", fontSize: 14, outline: "none", fontFamily: "inherit",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = "#7C3AED"}
                  onBlur={e => e.currentTarget.style.borderColor = "#27272A"}
                />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#A1A1AA" }}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                style={{
                  background: "#18181B", border: "1px solid #27272A", borderRadius: 6,
                  padding: "10px 14px", color: "#FAFAFA", fontSize: 14, outline: "none", fontFamily: "inherit",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#7C3AED"}
                onBlur={e => e.currentTarget.style.borderColor = "#27272A"}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#A1A1AA" }}>Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  background: "#18181B", border: "1px solid #27272A", borderRadius: 6,
                  padding: "10px 14px", color: "#FAFAFA", fontSize: 14, outline: "none", fontFamily: "inherit",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#7C3AED"}
                onBlur={e => e.currentTarget.style.borderColor = "#27272A"}
              />
            </div>

            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 6,
                background: "#EF444415", border: "1px solid #EF444430",
                color: "#EF4444", fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? "#4C1D95" : "#7C3AED",
                color: "#FAFAFA",
                border: "none",
                borderRadius: 8,
                padding: "12px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: "background 150ms",
                marginTop: 4,
              }}
            >
              {loading ? "Aguarde..." : setupMode ? "Criar Admin" : "Entrar"}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button
              onClick={() => { setSetupMode(!setupMode); setError(""); }}
              style={{
                background: "none", border: "none", color: "#52525B",
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {setupMode ? "Já tenho conta" : "Primeiro acesso? Configurar admin"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
