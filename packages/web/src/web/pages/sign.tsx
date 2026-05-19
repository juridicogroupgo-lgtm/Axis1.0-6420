import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/utils";

interface SignData {
  id: string;
  customerName?: string;
  amount?: number | string;
  installmentValue?: number | string;
  installments?: number | string;
  tableName?: string;
  fund?: string;
  signatureUrl: string;
}

export default function SignPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/proposals/${id}/sign`)
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          setError("Link de assinatura não encontrado ou expirado.");
        }
      })
      .catch(() => setError("Erro ao carregar dados de assinatura."))
      .finally(() => setLoading(false));
  }, [id]);

  function handleSign() {
    if (!data?.signatureUrl) return;
    setRedirecting(true);
    window.location.href = data.signatureUrl;
  }

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#0F0F0F",
      }}>
        <div style={{
          width: 32, height: 32, border: "3px solid #27272A",
          borderTopColor: "#7C3AED", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#0F0F0F", padding: "0 16px",
      }}>
        <div style={{
          background: "#18181B", border: "1px solid #27272A", borderRadius: 16,
          padding: 32, maxWidth: 420, width: "100%", textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ color: "#FAFAFA", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Link inválido</h1>
          <p style={{ color: "#71717A", fontSize: 14, margin: 0 }}>{error ?? "Link não encontrado."}</p>
        </div>
      </div>
    );
  }

  const amount = data.amount ? Number(data.amount) : 0;
  const installmentValue = data.installmentValue ? Number(data.installmentValue) : 0;
  const installments = data.installments ? Number(data.installments) : 0;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#0F0F0F", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .sign-btn {
          width: 100%; background: #2563EB; color: #fff;
          border: none; border-radius: 12px; padding: 16px;
          font-size: 16px; font-weight: 600; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.15s;
        }
        .sign-btn:hover:not(:disabled) { background: #1D4ED8; }
        .sign-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <header style={{
        background: "#18181B", borderBottom: "1px solid #27272A",
        padding: "14px 24px",
      }}>
        <div style={{
          maxWidth: 480, margin: "0 auto",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {/* Logo Axis Capital */}
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: "linear-gradient(135deg, #7C3AED, #2563EB)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 13, color: "#fff", letterSpacing: "-0.5px",
          }}>
            AC
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#FAFAFA" }}>Axis Capital</span>
        </div>
      </header>

      <main style={{
        flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "24px 16px",
      }}>
        <div style={{
          background: "#18181B", border: "1px solid #27272A",
          borderRadius: 16, padding: "28px 28px 32px",
          maxWidth: 440, width: "100%",
        }}>

          {/* Title */}
          <h1 style={{
            margin: "0 0 6px", fontSize: 20, fontWeight: 700,
            color: "#FAFAFA", lineHeight: 1.3,
          }}>
            Leia com Atenção!
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#A1A1AA", lineHeight: 1.6 }}>
            Você está contratando um <strong style={{ color: "#FAFAFA" }}>Crédito CLT com DESCONTO em FOLHA DE PAGAMENTO</strong>.
          </p>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#A1A1AA", lineHeight: 1.6 }}>
            Nessa modalidade a empresa empregadora realiza o desconto das parcelas pelo prazo determinado em contrato.
            Fique atento aos valores informados a seguir.
          </p>

          {/* Proposal summary */}
          {(amount > 0 || installmentValue > 0) && (
            <div style={{
              background: "#0F172A", border: "1px solid #1E3A5F",
              borderRadius: 10, padding: "16px 18px", marginBottom: 20,
            }}>
              <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 600, color: "#60A5FA", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Resumo da Proposta
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.customerName && <SummaryRow label="Cliente" value={data.customerName} />}
                {amount > 0 && <SummaryRow label="Valor Solicitado" value={formatCurrency(amount)} />}
                {installmentValue > 0 && installments > 0 && (
                  <SummaryRow label="Parcelas" value={`${installments}x de ${formatCurrency(installmentValue)}`} />
                )}
                {installmentValue > 0 && !installments && (
                  <SummaryRow label="Parcela" value={formatCurrency(installmentValue)} />
                )}
              </div>
            </div>
          )}

          {/* Warning box */}
          <div style={{
            background: "#1C1408", border: "1px solid #78350F",
            borderRadius: 10, padding: "14px 16px", marginBottom: 24,
          }}>
            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#F59E0B", display: "flex", alignItems: "center", gap: 6 }}>
              <span>⚠️</span> Atenção!
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#FCD34D", lineHeight: 1.6 }}>
              A Axis Capital <strong>não cobra nenhuma taxa</strong> pelo serviço antes ou após a contratação.
              Caso o agente de crédito cobre, pedimos que nos informe.
            </p>
          </div>

          {/* CTA Button */}
          <button
            className="sign-btn"
            onClick={handleSign}
            disabled={redirecting}
          >
            {redirecting ? (
              <>
                <span style={{
                  width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff", borderRadius: "50%",
                  animation: "spin 0.7s linear infinite", display: "inline-block",
                }} />
                Redirecionando...
              </>
            ) : (
              <>Continuar →</>
            )}
          </button>

          <p style={{ margin: "16px 0 0", fontSize: 11, color: "#52525B", textAlign: "center", lineHeight: 1.5 }}>
            Ao continuar, você será redirecionado para assinar o contrato digitalmente.
            Leia todos os termos com atenção antes de assinar.
          </p>
        </div>
      </main>

      <footer style={{
        padding: "16px 24px", textAlign: "center",
        fontSize: 12, color: "#3F3F46",
        borderTop: "1px solid #18181B",
      }}>
        © {new Date().getFullYear()} Axis Capital. Todos os direitos reservados.
      </footer>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13, color: "#71717A" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA" }}>{value}</span>
    </div>
  );
}
