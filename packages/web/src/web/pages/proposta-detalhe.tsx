import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Shell } from "../components/layout/shell";
import { BankAllowedSidebar } from "../components/bank-allowed-sidebar";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatCPF, getStatusColor, getStatusBg } from "../lib/utils";

interface PropostaDetalhe {
  id: string;
  termId?: string;
  customerName?: string;
  cpf: string;
  amount?: number;
  installmentValue?: number;
  installments?: number;
  rate?: number;
  statusPadronizado?: string;
  status: string;
  statusMotivo?: string | null;
  signatureUrl?: string;
  fundName?: string;
  externalUuid?: string;
  contractNumber?: string;
  formData?: string;
  createdAt: string;
  updatedAt: string;
}

interface HistoricoItem {
  id: string;
  oldStatus?: string;
  newStatus?: string;
  motivo?: string | null;
  payload?: string;
  createdAt: string;
}

const TERMINAL = new Set(["PAGA", "CANCELADA", "REPROVADA", "aprovado", "reprovado", "cancelado", "pago", "erro"]);

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "033": "Santander", "104": "Caixa Econômica", "237": "Bradesco",
  "341": "Itaú Unibanco", "077": "Inter", "260": "Nubank", "756": "Sicoob",
  "748": "Sicredi", "422": "Safra", "070": "BRB", "085": "Ailos",
  "336": "C6 Bank", "197": "Stone", "212": "Banco Original", "389": "Mercantil",
};

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    "EM DIGITAÇÃO": "Em Digitação",
    "ENVIADA": "Enviada",
    "EM ANÁLISE": "Em Análise",
    "PENDÊNCIA": "Pendente",
    "PENDENTE": "Pendente",
    "AGUARDANDO ASSINATURA": "Ag. Assinatura",
    "ASSINADA": "Assinada",
    "AGUARDANDO AVERBAÇÃO": "Ag. Averbação",
    "PAGA": "Paga",
    "CANCELADA": "Cancelada",
    "REPROVADA": "Reprovada",
    "INICIADA": "Iniciada",
    "PROCESSANDO": "Processando",
    pendente: "Pendente",
    em_analise: "Em Análise",
    aprovado: "Aprovado",
    reprovado: "Reprovado",
    cancelado: "Cancelado",
    pago: "Pago",
    assinado: "Assinado",
    aguardando_assinatura: "Ag. Assinatura",
    aguardando_avervacao: "Ag. Averbação",
  };
  return map[s] ?? s;
}

function isBancarioPendency(motivo: string | null | undefined): boolean {
  if (!motivo) return false;
  const lower = motivo.toLowerCase();
  return (
    lower.includes("banc") ||
    lower.includes("conta") ||
    lower.includes("agência") ||
    lower.includes("agencia") ||
    lower.includes("pix") ||
    lower.includes("dados bancários") ||
    lower.includes("dados bancarios")
  );
}

function isPendente(status: string): boolean {
  return status === "PENDÊNCIA" || status === "PENDENTE" || status.toLowerCase() === "pendente";
}

function statusDotColor(s: string): string {
  const lower = s.toLowerCase();
  if (lower.includes("paga") || lower.includes("aprovado") || lower.includes("assinada")) return "#22C55E";
  if (lower.includes("pendente") || lower.includes("pendência")) return "#F97316";
  if (lower.includes("reprovad") || lower.includes("cancelad") || lower.includes("erro")) return "#EF4444";
  if (lower.includes("análise") || lower.includes("analise") || lower.includes("enviada") || lower.includes("processando")) return "#8B5CF6";
  return "#71717A";
}

export default function PropostaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [proposta, setProposta] = useState<PropostaDetalhe | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Bancário modal
  const [showBancModal, setShowBancModal] = useState(false);
  const [bancForm, setBancForm] = useState({
    banco: "", agencia: "", agencia_digito: "", conta: "", conta_digito: "",
    tipo_conta: "corrente", chave_pix: "", pix_tipo: "CPF",
  });
  const [savingBanc, setSavingBanc] = useState(false);
  const [bancError, setBancError] = useState<string | null>(null);
  const [bancSuccess, setBancSuccess] = useState(false);
  const [goFinanceira, setGoFinanceira] = useState<any>(null);
  const [selectingOfferId, setSelectingOfferId] = useState<string | null>(null);

  function bf(key: string, value: string) {
    setBancForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleCancel() {
    if (!cancelMotivo.trim()) { setCancelError("Informe o motivo do cancelamento."); return; }
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await api.post(`/proposals/${id}/cancel`, { motivo: cancelMotivo.trim() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCancelError(data.message ?? "Erro ao cancelar."); setCancelling(false); return; }
      setShowCancelModal(false);
      setCancelMotivo("");
      await fetchProposta();
    } catch {
      setCancelError("Erro de conexão.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleFixBancario() {
    setSavingBanc(true);
    setBancError(null);
    setBancSuccess(false);
    try {
      const res = await api.patch(`/proposals/${id}/bancario`, bancForm);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setBancError(data.message ?? data.detail ?? "Erro ao atualizar."); setSavingBanc(false); return; }
      setBancSuccess(true);
      setTimeout(() => {
        setShowBancModal(false);
        setBancSuccess(false);
        fetchProposta();
      }, 1500);
    } catch {
      setBancError("Erro de conexão.");
    } finally {
      setSavingBanc(false);
    }
  }

  async function fetchGoFinanceira() {
    if (!id) return;
    try {
      const res = await api.get(`/credspot/proposals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setGoFinanceira(data.goFinanceira ?? null);
      }
    } catch {}
  }

  async function fetchProposta() {
    if (!id) return;
    try {
      const res = await api.get(`/proposals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProposta(data.proposal ?? data);
        setHistorico(data.history ?? []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message ?? "Proposta não encontrada.");
      }
    } catch {
      setError("Erro ao carregar proposta.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProposta(); fetchGoFinanceira(); }, [id]);

  useEffect(() => {
    if (!proposta) return;
    const s = proposta.statusPadronizado ?? proposta.status;
    if (TERMINAL.has(s)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      if (!id) return;
      try {
        const res = await api.post(`/proposals/${id}/poll`);
        if (res.ok) {
          const data = await res.json();
          if (data.status !== s) await fetchProposta();
        }
      } catch { /* silent */ }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [proposta?.statusPadronizado, proposta?.status, id]);

  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/credspot/proposals/${id}/stream`);
    es.addEventListener("update", async () => {
      await fetchGoFinanceira();
    });
    return () => es.close();
  }, [id]);

  // Pre-fill bank form from formData when modal opens
  function openBancModal() {
    if (proposta?.formData) {
      try {
        const fd = JSON.parse(proposta.formData);
        setBancForm({
          banco: fd.banco ?? fd.bancario_cod ?? "",
          agencia: fd.agencia ?? fd.bancario_agencia ?? "",
          agencia_digito: fd.agencia_digito ?? fd.bancario_agencia_digito ?? "",
          conta: fd.conta ?? fd.bancario_conta ?? "",
          conta_digito: fd.conta_digito ?? fd.bancario_conta_digito ?? "",
          tipo_conta: fd.tipo_conta ?? fd.bancario_conta_tipo ?? "corrente",
          chave_pix: fd.bancario_chave ?? "",
          pix_tipo: fd.bancario_pix_tipo ?? "CPF",
        });
      } catch { /* ignore */ }
    }
    setBancError(null);
    setBancSuccess(false);
    setShowBancModal(true);
  }

  if (loading) {
    return (
      <Shell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #27272A", borderTopColor: "#7C3AED", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      </Shell>
    );
  }

  if (error || !proposta) {
    return (
      <Shell>
        <div style={{ padding: 24 }}>
          <p style={{ color: "#F87171", fontSize: 14 }}>{error ?? "Proposta não encontrada."}</p>
          <button onClick={() => setLocation("/esteira")} style={{ marginTop: 16, background: "#7C3AED", color: "#FAFAFA", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Voltar à Esteira
          </button>
        </div>
      </Shell>
    );
  }

  const currentStatus = proposta.statusPadronizado ?? proposta.status ?? "";
  const sColor = getStatusColor(currentStatus);
  const sBg = getStatusBg(currentStatus);
  const isTerminal = TERMINAL.has(currentStatus);
  const isCancelled = currentStatus === "CANCELADA";
  const hasBancPendency = isPendente(currentStatus) && isBancarioPendency(proposta.statusMotivo);
  const gfOffers = Array.isArray(goFinanceira?.offers) ? goFinanceira.offers : [];

  async function selectGoFinanceiraOffer(offerId: string) {
    if (!id) return;
    setSelectingOfferId(offerId);
    try {
      const res = await api.post(`/credspot/proposals/${id}/select`, { offerId });
      if (res.ok) await fetchGoFinanceira();
    } finally {
      setSelectingOfferId(null);
    }
  }

  let customerPhone: string | undefined;
  try { if (proposta.formData) { const fd = JSON.parse(proposta.formData); customerPhone = fd.telefone ?? fd.phone ?? fd.customerPhone; } } catch { /**/ }

  const dotColor = statusDotColor(currentStatus);

  return (
    <Shell>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.75);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
        }
        .modal-box {
          background: #18181B; border: 1px solid #3F3F46; border-radius: 14px;
          padding: 28px; width: 100%; max-width: 480px;
        }
        .modal-input {
          width: 100%; background: #0F172A; border: 1px solid #3F3F46;
          border-radius: 8px; padding: 9px 12px; color: #FAFAFA; font-size: 14px;
          outline: none; box-sizing: border-box; font-family: inherit;
        }
        .modal-input:focus { border-color: #8B5CF6; }
        .modal-select {
          width: 100%; background: #0F172A; border: 1px solid #3F3F46;
          border-radius: 8px; padding: 9px 12px; color: #FAFAFA; font-size: 14px;
          outline: none; cursor: pointer; font-family: inherit;
        }
        .modal-select:focus { border-color: #8B5CF6; }
        .modal-label { font-size: 12px; font-weight: 500; color: #A1A1AA; display: block; margin-bottom: 5px; }
        .btn-primary { background: #7C3AED; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
        .btn-primary:hover:not(:disabled) { background: #6D28D9; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { background: #27272A; color: #A1A1AA; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; cursor: pointer; }
        .btn-secondary:hover { background: #3F3F46; }
        .btn-danger { background: #EF4444; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .btn-danger:hover:not(:disabled) { background: #DC2626; }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
        .cancel-textarea { width: 100%; min-height: 96px; background: #0F172A; border: 1px solid #3F3F46; border-radius: 8px; padding: 10px 12px; color: #FAFAFA; font-size: 14px; resize: vertical; outline: none; box-sizing: border-box; margin-top: 8px; font-family: inherit; }
        .cancel-textarea:focus { border-color: #EF4444; }
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; }
        @media (max-width: 640px) { .grid-2col { grid-template-columns: 1fr; } .modal-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCancelModal(false); }}>
          <div className="modal-box">
            <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#FAFAFA" }}>Cancelar Proposta</h2>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#71717A" }}>Esta ação não pode ser desfeita.</p>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#A1A1AA", display: "block", marginTop: 16 }}>Motivo do cancelamento *</label>
            <textarea className="cancel-textarea" placeholder="Descreva o motivo..." value={cancelMotivo} onChange={e => { setCancelMotivo(e.target.value); setCancelError(null); }} />
            {cancelError && <p style={{ color: "#F87171", fontSize: 12, marginTop: 6 }}>{cancelError}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => { setShowCancelModal(false); setCancelMotivo(""); setCancelError(null); }}>Voltar</button>
              <button className="btn-danger" disabled={cancelling || !cancelMotivo.trim()} onClick={handleCancel}>{cancelling ? "Cancelando..." : "Confirmar Cancelamento"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bancário Modal */}
      {showBancModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowBancModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F9731620", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏦</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#FAFAFA" }}>Corrigir Dados Bancários</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#71717A" }}>Após salvar, a proposta será reenviada automaticamente para análise.</p>
              </div>
            </div>

            {bancSuccess ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#22C55E" }}>Dados atualizados!</div>
                <div style={{ fontSize: 13, color: "#71717A", marginTop: 6 }}>Proposta reenviada para análise.</div>
              </div>
            ) : (
              <>
                <div className="modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label className="modal-label">Banco (código Compe)</label>
                    <input className="modal-input" placeholder="Ex: 341 → Itaú" value={bancForm.banco} onChange={e => bf("banco", e.target.value)} />
                    {bancForm.banco && (BANCOS[bancForm.banco.padStart(3, "0")] ?? BANCOS[bancForm.banco]) && (
                      <div style={{ fontSize: 11, color: "#22C55E", marginTop: 4 }}>✓ {BANCOS[bancForm.banco.padStart(3, "0")] ?? BANCOS[bancForm.banco]}</div>
                    )}
                  </div>
                  <div>
                    <label className="modal-label">Agência</label>
                    <input className="modal-input" placeholder="Ex: 1234" value={bancForm.agencia} onChange={e => bf("agencia", e.target.value)} />
                  </div>
                  <div>
                    <label className="modal-label">Dígito da Agência</label>
                    <input className="modal-input" placeholder="Ex: 0" value={bancForm.agencia_digito} onChange={e => bf("agencia_digito", e.target.value)} />
                  </div>
                  <div>
                    <label className="modal-label">Conta</label>
                    <input className="modal-input" placeholder="Ex: 12345" value={bancForm.conta} onChange={e => bf("conta", e.target.value)} />
                  </div>
                  <div>
                    <label className="modal-label">Dígito da Conta</label>
                    <input className="modal-input" placeholder="Ex: 6" value={bancForm.conta_digito} onChange={e => bf("conta_digito", e.target.value)} />
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label className="modal-label">Tipo de Conta</label>
                    <select className="modal-select" value={bancForm.tipo_conta} onChange={e => bf("tipo_conta", e.target.value)}>
                      <option value="corrente">Corrente</option>
                      <option value="poupanca">Poupança</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label className="modal-label">Chave PIX (opcional)</label>
                    <input className="modal-input" placeholder="CPF, e-mail, telefone ou chave aleatória" value={bancForm.chave_pix} onChange={e => bf("chave_pix", e.target.value)} />
                  </div>
                  {bancForm.chave_pix && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <label className="modal-label">Tipo da Chave PIX</label>
                      <select className="modal-select" value={bancForm.pix_tipo} onChange={e => bf("pix_tipo", e.target.value)}>
                        <option value="CPF">CPF</option>
                        <option value="email">E-mail</option>
                        <option value="telefone">Telefone</option>
                        <option value="aleatoria">Chave aleatória</option>
                      </select>
                      <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 4 }}>
                        Confirme se essa chave PIX pertence a um banco autorizado.
                      </div>
                    </div>
                  )}
                </div>

                {bancError && (
                  <div style={{ marginTop: 14, padding: "10px 14px", background: "#EF444415", border: "1px solid #EF444440", borderRadius: 8, fontSize: 13, color: "#F87171" }}>
                    {bancError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                  <button className="btn-secondary" onClick={() => setShowBancModal(false)}>Cancelar</button>
                  <button className="btn-primary" disabled={savingBanc || !bancForm.banco || !bancForm.conta} onClick={handleFixBancario}>
                    {savingBanc ? "Enviando..." : "Salvar e reenviar para análise"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, maxWidth: 860, margin: "0 auto", padding: "8px 0" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => setLocation("/esteira")} style={{ background: "none", border: "none", color: "#A78BFA", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}>
            ← Esteira
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#FAFAFA" }}>Proposta</h1>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717A", fontFamily: "monospace" }}>{proposta.id}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {!isTerminal && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#71717A" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#22C55E", animation: "pulse 1.5s ease-in-out infinite" }} />
                  Atualizando...
                </span>
              )}
              {!isCancelled && !TERMINAL.has(currentStatus.toLowerCase()) && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  style={{ background: "transparent", color: "#EF4444", border: "1px solid #EF444460", borderRadius: 8, padding: "5px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#EF444415")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  Cancelar Proposta
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Card — destaque visual */}
        <div style={{
          marginBottom: 20,
          background: isPendente(currentStatus) ? "#F9731608" : `${sBg}`,
          border: `1.5px solid ${dotColor}40`,
          borderRadius: 12,
          padding: "18px 22px",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: proposta.statusMotivo ? 8 : 0 }}>
                <span style={{
                  background: `${dotColor}20`, color: dotColor,
                  border: `1px solid ${dotColor}50`,
                  borderRadius: 20, padding: "4px 14px",
                  fontSize: 13, fontWeight: 700, letterSpacing: "0.03em",
                }}>
                  {statusLabel(currentStatus).toUpperCase()}
                </span>
              </div>
              {proposta.statusMotivo && (
                <div style={{ fontSize: 14, color: "#E4E4E7", fontWeight: 500, marginBottom: 4 }}>
                  {proposta.statusMotivo}
                </div>
              )}
              {proposta.statusMotivo && isBancarioPendency(proposta.statusMotivo) && (
                <div style={{ fontSize: 12, color: "#A1A1AA" }}>
                  Verifique os dados bancários do cliente e corrija antes de prosseguir.
                </div>
              )}
            </div>
            {hasBancPendency && (
              <button
                onClick={openBancModal}
                style={{
                  background: "#F97316", color: "#fff", border: "none",
                  borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#EA6C0A")}
                onMouseLeave={e => (e.currentTarget.style.background = "#F97316")}
              >
                🏦 Corrigir dados bancários
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="grid-2col" style={{ gap: 16 }}>

          <InfoCard title="Cliente">
            <Row label="Nome" value={proposta.customerName ?? "—"} />
            <Row label="CPF" value={formatCPF(proposta.cpf)} />
            {customerPhone ? <Row label="Telefone" value={customerPhone} /> : null}
          </InfoCard>

          <InfoCard title="Dados da Proposta">
            {proposta.amount != null ? <Row label="Valor Solicitado" value={formatCurrency(proposta.amount)} /> : null}
            {proposta.installmentValue != null ? <Row label="Parcela" value={formatCurrency(proposta.installmentValue)} /> : null}
            {proposta.installments != null ? <Row label="Prazo" value={`${proposta.installments} meses`} /> : null}
            {proposta.rate != null ? <Row label="Taxa Mensal" value={`${Number(proposta.rate).toFixed(2)}%`} /> : null}
            {proposta.fundName ? <Row label="Fundo" value={proposta.fundName} /> : null}
            {proposta.contractNumber ? <Row label="Contrato" value={proposta.contractNumber} /> : null}
            {proposta.externalUuid ? <Row label="ID Externo" value={proposta.externalUuid.slice(0, 8) + "..."} /> : null}
          </InfoCard>

          {goFinanceira?.contract ? (
            <InfoCard title="Go Financeira - Contrato">
              <Row label="Status" value={goFinanceira.contract.status ?? "—"} />
              <Row label="Número" value={goFinanceira.contract.contractNumber ?? "—"} />
              {goFinanceira.contract.signatureUrl ? <Row label="Assinatura" value="Disponível" /> : null}
            </InfoCard>
          ) : goFinanceira?.consent ? (
            <InfoCard title="Go Financeira - Contrato">
              <Row label="Status" value="Aguardando criação" />
              <Row label="Consentimento" value={goFinanceira.consent.accepted ? "Aceito" : "Processando"} />
            </InfoCard>
          ) : null}

          <InfoCard title="Informações">
            <Row label="Criada em" value={formatDate(proposta.createdAt)} />
            <Row label="Atualizada em" value={formatDate(proposta.updatedAt)} />
          </InfoCard>

          {goFinanceira ? (
            <InfoCard title="Go Financeira">
              <Row label="Status" value={goFinanceira.consent?.accepted ? "Consentimento aceito" : "Processando"} />
              {goFinanceira.margin?.availableMarginValue != null ? (
                <Row label="Margem disponível" value={formatCurrency(goFinanceira.margin.availableMarginValue)} />
              ) : null}
              {gfOffers.length > 0 ? (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {gfOffers.slice(0, 3).map((o: any, idx: number) => (
                    <div key={o.id ?? idx} style={{ padding: "10px 12px", borderRadius: 8, background: "#0F172A", border: "1px solid #27272A" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#FAFAFA" }}>
                            {formatCurrency(o.amount ?? o.valor ?? 0)}
                          </div>
                          <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 4 }}>
                            {o.installments ?? o.parcelas ?? "—"}x • {o.cet ?? "—"} CET • {o.tableName ?? "—"}
                          </div>
                        </div>
                        <button
                          onClick={() => selectGoFinanceiraOffer(o.id)}
                          disabled={selectingOfferId === o.id}
                          style={{
                            background: o.selected ? "#22C55E" : "#7C3AED",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 11,
                            cursor: "pointer",
                            opacity: selectingOfferId === o.id ? 0.7 : 1,
                          }}
                        >
                          {o.selected ? "Selecionada" : selectingOfferId === o.id ? "Salvando..." : "Selecionar"}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: "#60A5FA", marginTop: 6 }}>
                        Go Financeira
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </InfoCard>
          ) : null}

          {proposta.signatureUrl ? (
            <InfoCard title="Link de Formalização">
              <p style={{ fontSize: 13, color: "#A1A1AA", marginBottom: 8 }}>
                Envie este link ao cliente para assinar o contrato:
              </p>
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#22C55E", wordBreak: "break-all", marginBottom: 12, padding: "8px 10px", background: "#0F172A", borderRadius: 6 }}>
                {window.location.origin}{proposta.signatureUrl}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${proposta.signatureUrl}`)} style={{ flex: 1, background: "#18181B", color: "#FAFAFA", border: "1px solid #27272A", borderRadius: 6, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>
                  Copiar Link
                </button>
                <button onClick={() => window.open(proposta.signatureUrl!, "_blank")} style={{ flex: 1, background: "#7C3AED", color: "#FAFAFA", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>
                  Abrir Link
                </button>
              </div>
            </InfoCard>
          ) : null}

        </div>

        {/* Timeline / Histórico */}
        {historico.length > 0 ? (
          <div style={{ marginTop: 20, background: "#111113", border: "1px solid #27272A", borderRadius: 12, padding: "20px 24px" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 600, color: "#FAFAFA", borderBottom: "1px solid #27272A", paddingBottom: 12 }}>
              Histórico de Status
            </h2>
            <div style={{ position: "relative" }}>
              {/* vertical line */}
              <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 2, background: "#27272A" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {historico.map((h, idx) => {
                  const prev = h.oldStatus;
                  const next = h.newStatus ?? "";
                  const dotC = statusDotColor(next);
                  const motivo = h.motivo ?? (() => {
                    try { return JSON.parse(h.payload ?? "{}").note ?? JSON.parse(h.payload ?? "{}").message ?? null; } catch { return null; }
                  })();
                  return (
                    <div key={h.id} style={{ display: "flex", gap: 16, paddingBottom: idx < historico.length - 1 ? 20 : 0 }}>
                      {/* dot */}
                      <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${dotC}20`, border: `2px solid ${dotC}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotC }} />
                        </div>
                      </div>
                      {/* content */}
                      <div style={{ flex: 1, paddingTop: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          {prev ? (
                            <>
                              <StatusChip status={prev} />
                              <span style={{ color: "#52525B", fontSize: 12 }}>→</span>
                            </>
                          ) : null}
                          <StatusChip status={next} />
                        </div>
                        {motivo && (
                          <div style={{ fontSize: 13, color: "#A1A1AA", marginBottom: 4, lineHeight: 1.5 }}>{motivo}</div>
                        )}
                        <div style={{ fontSize: 11, color: "#52525B" }}>{formatDate(h.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

      </div>
        );

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#111113", border: "1px solid #27272A", borderRadius: 10, padding: 20 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 600, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #27272A", paddingBottom: 10 }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
      <span style={{ fontSize: 13, color: "#71717A" }}>{label}</span>
      <span style={{ fontSize: 13, color: "#FAFAFA", fontWeight: 500, textAlign: "right" }}>{value ?? "—"}</span>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const color = getStatusColor(status);
  const bg = getStatusBg(status);
  return (
    <span style={{ background: bg, color, border: `1px solid ${color}40`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
      {statusLabel(status)}
    </span>
  );
}


