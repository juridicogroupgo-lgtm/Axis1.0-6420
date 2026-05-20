import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Shell } from "../components/layout/shell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import {
  startProposal, pollTerm, getSimulations, selectSimulation, submitProposal, submitTermManual, getTerms,
} from "../lib/api";
import { formatCurrency, formatCPF } from "../lib/utils";
import { useAuth } from "../lib/auth-context";
import { maskTableName } from "../../lib/maskTableName";
import { bankDisplayName, isAllowedBankCode, isPixKeyAllowedForBank, normalizeBankCode } from "../lib/bank-allowed";
import { BankAllowedSidebar } from "../components/bank-allowed-sidebar";

type Step = "cpf" | "polling" | "manual" | "simulations" | "form" | "sending" | "done";

const ESTADOS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "041": "Banrisul", "237": "Bradesco", "104": "Caixa Econômica Federal",
  "341": "Itaú", "033": "Santander", "756": "Sicoob", "748": "Sicredi",
  "077": "Banco Inter", "336": "C6 Bank", "273": "Caixa Tem", "212": "iti",
  "007": "Next", "260": "Nubank",
};

type TermEntry = {
  id: string;
  cpf: string;
  status: string;
  saldoId: string | null;
  digitadorName: string;
  digitadorId: string;
  createdAt: string | null;
  rawPayload: string | null;
  proposal: { id: string; status: string; customerName: string | null } | null;
};

function statusColor(status: string) {
  switch (status) {
    case "elegivel": return "#22C55E";
    case "inelegivel": return "#EF4444";
    case "criada": return "#F59E0B";
    case "processando": return "#A78BFA";
    default: return "#71717A";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "elegivel": return "Elegível";
    case "inelegivel": return "Inelegível";
    case "criada": return "Consultando...";
    case "processando": return "Processando...";
    default: return status;
  }
}

function statusBadgeColor(status: string) {
  switch (status) {
    case "elegivel": return { bg: "#22C55E15", border: "#22C55E40", text: "#22C55E" };
    case "inelegivel": return { bg: "#EF444415", border: "#EF444440", text: "#EF4444" };
    case "criada": return { bg: "#F59E0B15", border: "#F59E0B40", text: "#F59E0B" };
    case "processando": return { bg: "#A78BFA15", border: "#A78BFA40", text: "#A78BFA" };
    default: return { bg: "#71717A15", border: "#71717A40", text: "#71717A" };
  }
}

function formatDateForInput(dateString: string | null | undefined): string {
  if (!dateString) return "";
  // formato DD/MM/YYYY
  if (dateString.includes("/")) {
    const [day, month, year] = dateString.split("/");
    if (year && month && day) return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  // formato YYYYMMDD
  if (/^\d{8}$/.test(dateString)) {
    return `${dateString.slice(0, 4)}-${dateString.slice(4, 6)}-${dateString.slice(6, 8)}`;
  }
  // já está em YYYY-MM-DD ou outro formato desconhecido
  return dateString;
}

function getClienteName(term: TermEntry) {
  if (term.proposal?.customerName) return term.proposal.customerName;
  if (term.rawPayload) {
    try {
      const p = JSON.parse(term.rawPayload);
      return p?.nome ?? p?.name ?? p?.cliente?.nome ?? null;
    } catch { return null; }
  }
  return null;
}

function getMargemValue(term: TermEntry): number | null {
  if (!term.rawPayload) return null;
  try {
    const p = JSON.parse(term.rawPayload);
    // GF CLT fields: saldo_available_margin_value (termos), saldo_margem (simulacoes)
    const m = p?.saldo_available_margin_value ?? p?.saldo_margem ??
              p?.margem_disponivel ?? p?.margem ?? p?.saldo?.margem_disponivel ?? p?.saldo?.margem ??
              p?.margem_consignavel ?? p?.limite_margem ?? p?.margem_livre;
    if (m == null) return null;
    return Number(m);
  } catch { return null; }
}

function getMargem(term: TermEntry): string | null {
  const v = getMargemValue(term);
  if (v == null) return null;
  return formatCurrency(v);
}

// ─── Core eligibility resolver ────────────────────────────────────────────────
// Single source of truth — must mirror Go Fintech API semantics exactly.
// Returns { eligible, reason, margem } based on rawPayload from GF.
function resolveEligibility(term: TermEntry): { eligible: boolean; reason: string; margem: number | null } {
  const rawPayload = term.rawPayload;

  // If still polling — not determined yet
  if (term.status === "criada" || term.status === "processando") {
    return { eligible: false, reason: "Processando", margem: null };
  }

  // DB status already explicitly inelegível
  if (term.status === "inelegivel") {
    const margem = getMargemValue(term);
    console.log("[Eligibility] Status DB=inelegivel para CPF:", term.cpf, "| Margem:", margem);
    return { eligible: false, reason: "Inelegível conforme retorno da API", margem };
  }

  // Parse rawPayload for deeper checks
  let p: any = null;
  try {
    if (rawPayload) p = JSON.parse(rawPayload);
  } catch { /* ignore */ }

  if (p) {
    console.log("Retorno elegibilidade Go Fintech:", p);
  }

  // 1. Check raw GF status string in payload
  const rawStatus = String(
    p?.solicitacao_status ?? p?.status ?? p?.eligibilityStatus ?? p?.situacao ?? ""
  ).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isApiIneligible =
    rawStatus.includes("ineleg") ||
    rawStatus.includes("falha") ||
    rawStatus.includes("reprov") ||
    rawStatus.includes("sem margem") ||
    rawStatus.includes("sem_margem") ||
    rawStatus.includes("margem insuficiente") ||
    rawStatus.includes("bloqueado") ||
    rawStatus.includes("negad");

  if (isApiIneligible) {
    const margem = p
      ? Number(p?.saldo_available_margin_value ?? p?.saldo_margem ??
                p?.margem_disponivel ?? p?.margem ?? p?.saldo?.margem_disponivel ?? p?.saldo?.margem ??
                p?.margem_consignavel ?? p?.limite_margem ?? p?.margem_livre ?? 0)
      : null;
    console.log("[Eligibility] API status inelegível:", rawStatus, "| CPF:", term.cpf, "| Margem:", margem);
    return { eligible: false, reason: "Inelegível conforme retorno da API", margem };
  }

  // 1b. Check saldo_elegivel boolean (explicit GF field)
  if (p?.saldo_elegivel === false) {
    const margem = getMargemValue(term);
    console.log("[Eligibility] saldo_elegivel=false | CPF:", term.cpf);
    return { eligible: false, reason: "Sem saldo elegível na margem", margem };
  }

  // 2. Check fases array for inelegível
  if (Array.isArray(p?.fases) && p.fases.length > 0) {
    const anyInelegivel = p.fases.some((f: any) =>
      ["inelegivel", "reprovado", "sem margem", "bloqueado"].some(kw =>
        String(f.status ?? "").toLowerCase().includes(kw)
      )
    );
    if (anyInelegivel) {
      const margem = getMargemValue(term);
      console.log("[Eligibility] Inelegível via fases | CPF:", term.cpf);
      return { eligible: false, reason: "Inelegível conforme fases da API", margem };
    }
  }

  // 3. Check margem disponível — GF CLT fields: saldo_available_margin_value (termos), saldo_margem (simulacoes)
  const margem = p
    ? Number(p?.saldo_available_margin_value ?? p?.saldo_margem ??
              p?.margem_disponivel ?? p?.margem ?? p?.saldo?.margem_disponivel ?? p?.saldo?.margem ??
              p?.margem_consignavel ?? p?.limite_margem ?? p?.margem_livre ?? 0)
    : null;

  console.log("Margem identificada:", margem, "| CPF:", term.cpf);

  // Zero or negative margem = inelegível
  if (margem !== null && margem <= 0) {
    return { eligible: false, reason: "Sem margem disponível", margem };
  }

  // 4. Check tabelas / simulações disponíveis
  const hasTables =
    (Array.isArray(p?.tabelas) && p.tabelas.length > 0) ||
    (p?.tabelas && typeof p.tabelas === "object" && Object.keys(p.tabelas).length > 0) ||
    (Array.isArray(p?.simulacoes) && p.simulacoes.length > 0) ||
    (Array.isArray(p?.offers) && p.offers.length > 0);

  console.log("Tabelas disponíveis:", p?.tabelas ?? p?.simulacoes ?? p?.offers ?? "nenhuma");

  // If we have DB status elegível + saldo_id, we trust GF even if tabelas not in rawPayload
  if (term.status === "elegivel" && term.saldoId) {
    // Only mark inelegível if margem is explicitly 0
    if (margem !== null && margem <= 0) {
      return { eligible: false, reason: "Sem margem disponível", margem };
    }
    const result = { eligible: true, reason: "Elegível", margem };
    console.log("Resultado final elegibilidade:", result);
    return result;
  }

  // No saldo_id at all
  return { eligible: false, reason: "Aguardando processamento", margem };
}

function getInitial(name: string | null) {
  if (!name) return "?";
  return name.trim()[0].toUpperCase();
}

function formatDateTime(val: string | null) {
  if (!val) return "—";
  const d = new Date(val);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function NovaProposta() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("cpf");
  const [cpf, setCpf] = useState("");
  const [termId, setTermId] = useState("");
  const [termStatus, setTermStatus] = useState("");
  const [simulations, setSimulations] = useState<any[]>([]);
  const [simMargem, setSimMargem] = useState<number | null>(null);
  const [simProduto, setSimProduto] = useState<string>("");
  const [selectedSim, setSelectedSim] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pollingCount, setPollingCount] = useState(0);
  const [proposalId, setProposalId] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [requiresManual, setRequiresManual] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Esteira de termos
  const [terms, setTerms] = useState<TermEntry[]>([]);
  const [termsLoading, setTermsLoading] = useState(false);
  const [cpfFilter, setCpfFilter] = useState("");
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [form, setForm] = useState({
    nome: "", cpf_form: "", rg: "", rg_emissor: "", rg_uf: "", rg_data_emissao: "", data_nascimento: "",
    nome_mae: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
    banco: "", agencia: "", agencia_digito: "", conta: "", conta_digito: "", tipo_conta: "corrente",
    chave_pix: "", pix_tipo: "CPF",
    telefone: "", email: "",
    empresa: "", matricula: "", salario: "",
  });

  const [manualForm, setManualForm] = useState({
    cpf: "", nome: "", data_nascimento: "", nome_mae: "", empresa: "", matricula: "",
  });

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  const loadTerms = useCallback(async () => {
    try {
      const data = await getTerms();
      setTerms(data);
    } catch (e) {
      console.error("Error loading terms:", e);
    }
  }, []);

  useEffect(() => {
    loadTerms();
    refreshRef.current = setInterval(loadTerms, 5000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [loadTerms]);

  async function handleCPF(e: React.FormEvent) {
    e.preventDefault();
    const clean = cpf.replace(/\D/g, "");
    if (clean.length !== 11) { setError("CPF deve ter 11 dígitos"); return; }
    setError("");
    setLoading(true);
    try {
      const data = await startProposal(clean);
      setTermId(data.termId);
      setTermStatus(data.status);
      setRequiresManual(data.requiresManualData === true);
      if (data.requiresManualData) {
        setManualForm(f => ({ ...f, cpf: clean }));
        setStep("manual");
      } else {
        setStep("polling");
        startPolling(data.termId);
      }
      // Refresh esteira immediately
      setTimeout(loadTerms, 500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startPolling(tid: string) {
    stopPolling();
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollingCount(count);
      try {
        const data = await pollTerm(tid);
        setTermStatus(data.status);
        loadTerms();

        if (data.status === "elegivel") {
          stopPolling();
          const simData = await getSimulations(tid);
          const sims = simData.simulations ?? [];
          setSimulations(sims);
          setSimMargem(simData.margem ?? null);
          setSimProduto(simData.produto ?? "");
          if (sims.length === 0) {
            setError("Cliente sem opções de crédito disponíveis (inelegível).");
            setStep("cpf");
            setCpf("");
          } else {
            setStep("simulations");
          }
        } else if (data.status === "inelegivel") {
          stopPolling();
          setError("Cliente inelegível para crédito consignado.");
          setStep("cpf");
          setCpf("");
        } else if (count >= 120) {
          stopPolling();
          setError("Timeout: consulta demorou mais que o esperado. Tente novamente.");
          setStep("cpf");
        }
      } catch (e) {
        console.error(e);
      }
    }, 2000);
  }

  useEffect(() => () => { stopPolling(); if (refreshRef.current) clearInterval(refreshRef.current); }, []);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await submitTermManual({ ...manualForm, cpf: cpf.replace(/\D/g, "") });
      setTermId(data.termId);
      setStep("polling");
      startPolling(data.termId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectSim(sim: any) {
    setSelectedSim(sim);
    setForm(f => ({ ...f, cpf_form: cpf.replace(/\D/g, "") }));
    const uuid = sim.uuid ?? sim.id;
    // Don't auto-advance to form step — let user see table and click "Continuar"
    try { await selectSimulation(termId, uuid); } catch (e) { console.error("Select sim error:", e); }
  }

  async function handleSubmitProposal(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await submitProposal({
        termId,
        simulacaoUuid: selectedSim?.uuid ?? selectedSim?.id,
        formData: {
          // ── pessoais ──
          nome: form.nome,
          cpf: cpf.replace(/\D/g, ""),
          rg: form.rg,
          rg_documento: form.rg,
          rg_tipo: form.rg ? "RG" : undefined,
          rg_emissor: form.rg_emissor || undefined,
          orgao_emissor: form.rg_emissor || undefined,
          rg_uf: form.rg_uf || undefined,
          uf_documento: form.rg_uf || undefined,
          rg_data_emissao: form.rg_data_emissao || undefined,
          data_emissao: form.rg_data_emissao || undefined,
          data_nascimento: form.data_nascimento,
          nome_mae: form.nome_mae,
          filiacao_mae: form.nome_mae,
          // ── endereço (nomes GF) ──
          cep: form.cep,
          endereco: form.logradouro,
          logradouro: form.logradouro,
          numero: form.numero,
          complemento: form.complemento,
          bairro: form.bairro,
          cidade: form.cidade,
          uf: form.uf,
          // ── bancário (nomes GF) ──
          bancario_tipo: "TED",
          bancario_cod: form.banco,
          bancario_nome: BANCOS[form.banco.padStart(3, "0")] ?? BANCOS[form.banco] ?? undefined,
          bancario_agencia: form.agencia,
          bancario_agencia_digito: form.agencia_digito,
          bancario_conta: form.conta,
          bancario_conta_digito: form.conta_digito,
          bancario_conta_tipo: form.tipo_conta,
          bancario_chave: form.chave_pix || undefined,
          bancario_pix_tipo: form.chave_pix ? form.pix_tipo : undefined,
          // compat aliases
          banco: form.banco,
          agencia: form.agencia,
          conta: form.conta,
          tipo_conta: form.tipo_conta,
          // ── contato ──
          celular: form.telefone,
          telefone: form.telefone,
          email: form.email,
          // ── profissional ──
          empresa: form.empresa,
          matricula: form.matricula,
          salario: form.salario,
          // ── simulação ──
          valor_desembolso: selectedSim?.valor_desembolso,
          valor_liberado: selectedSim?.valor_desembolso ?? selectedSim?.valor_liberado,
          valor_parcela: selectedSim?.valor_parcela,
          valor_financiado: selectedSim?.valor_financiado,
          valor_iof: selectedSim?.valor_iof,
          prazo: selectedSim?.prazo,
          taxa: selectedSim?.taxa_juros_mensal ?? selectedSim?.taxa,
          taxa_juros_mensal: selectedSim?.taxa_juros_mensal,
          nome_tabela: selectedSim?.tabelas?.nome ?? selectedSim?.produto,
          produto: selectedSim?.produto,
        },
      });
      setProposalId(data.proposalId);
      setIsDuplicate(!!data.duplicada);
      setSignatureUrl(data.signatureUrl ?? null);
      setStep("done");
      loadTerms();
    } catch (err: any) {
      // Check if error message contains duplicate proposal info
      const msg = err.message ?? err.detail ?? "";
      setError(msg || "Erro ao enviar proposta");
    } finally {
      setLoading(false);
    }
  }

  function f(key: string, value: string) { setForm(prev => ({ ...prev, [key]: value })); }
  function mf(key: string, value: string) { setManualForm(prev => ({ ...prev, [key]: value })); }

  async function lookupCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.erro) return;
      setForm(prev => ({
        ...prev,
        logradouro: prev.logradouro || data.logradouro || "",
        bairro: prev.bairro || data.bairro || "",
        cidade: prev.cidade || data.localidade || "",
        uf: prev.uf || data.uf || "",
      }));
    } catch { /* silently ignore */ }
  }

  function resetForm() {
    setStep("cpf");
    setCpf("");
    setError("");
    setTermId("");
    setTermStatus("");
    setSimulations([]);
    setSelectedSim(null);
    setSimMargem(null);
    setSimProduto("");
    setPollingCount(0);
    setIsDuplicate(false);
    setSignatureUrl(null);
    stopPolling();
  }

  function handleRetomar(term: TermEntry) {
    // Guard: only allow resuming if resolveEligibility confirms eligible
    const eligibility = resolveEligibility(term);
    if (!eligibility.eligible) {
      console.warn("[Retomar] Bloqueado — term não elegível:", eligibility.reason, "| CPF:", term.cpf);
      return;
    }
    if (term.status === "elegivel") {
      setTermId(term.id);
      setCpf(term.cpf ?? "");
      // Pre-fill all available client fields from rawPayload
      try {
        const p = term.rawPayload ? JSON.parse(term.rawPayload) : null;
        const rawDate = p?.data_nascimento ?? p?.nascimento ?? p?.cliente?.data_nascimento ?? p?.cliente?.nascimento;
        const formattedDate = formatDateForInput(rawDate);
        if (formattedDate) console.log("[Retomar] Birth Date API:", rawDate, "→ Formatted:", formattedDate);
        setForm(f => ({
          ...f,
          cpf_form: (term.cpf ?? "").replace(/\D/g, ""),
          nome: f.nome || getClienteName(term) || "",
          nome_mae: f.nome_mae || p?.nome_mae || p?.filiacao_mae || p?.cliente?.nome_mae || "",
          data_nascimento: f.data_nascimento || formattedDate,
          empresa: f.empresa || p?.empresa || p?.orgao || p?.cliente?.empresa || "",
          matricula: f.matricula || p?.matricula || p?.cliente?.matricula || "",
        }));
      } catch {
        const nome = getClienteName(term);
        if (nome) setForm(f => ({ ...f, nome: f.nome || nome, cpf_form: (term.cpf ?? "").replace(/\D/g, "") }));
      }
      setStep("simulations");
      setError("");
      getSimulations(term.id).then(data => {
        const sims = data.simulations ?? [];
        setSimulations(sims);
        setSimMargem(data.margem ?? null);
        setSimProduto(data.produto ?? "");
        // If backend confirmed inelegível (no simulations or zero margem)
        if (data.inelegivel || sims.length === 0) {
          const reason = data.reason ?? "Sem simulações disponíveis";
          setError(`Inelegível: ${reason}. Verifique na Go Fintech.`);
          // Refresh terms list so status badge updates
          setTimeout(loadTerms, 300);
        }
      }).catch(() => {});
    }
  }

  const stepLabels = ["CPF", "Elegibilidade", "Simulação", "Dados", "Enviada"];
  const stepIndex = { cpf: 0, polling: 1, manual: 1, simulations: 2, form: 3, sending: 4, done: 4 }[step];

  // Left panel: narrow when on cpf step, hidden on wider steps
  const showSplit = ["cpf", "polling", "manual"].includes(step);

  return (
    <Shell title="Nova Proposta">
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", minHeight: "calc(100vh - 140px)" }}>

        {/* LEFT: Form panel */}
        <div style={{
          width: showSplit ? 440 : "100%",
          flexShrink: 0,
          transition: "width 300ms",
        }}>
          {/* Stepper */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
            {stepLabels.map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < stepLabels.length - 1 ? 1 : 0 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: i <= stepIndex ? "#7C3AED" : "#27272A",
                  color: "#FAFAFA", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: i === stepIndex ? "2px solid #A78BFA" : "none",
                  boxShadow: i === stepIndex ? "0 0 10px rgba(124,58,237,0.4)" : "none",
                }}>
                  {i < stepIndex ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 11, color: i <= stepIndex ? "#A78BFA" : "#52525B", marginLeft: 5, marginRight: 6, whiteSpace: "nowrap" }}>
                  {label}
                </span>
                {i < stepLabels.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: i < stepIndex ? "#7C3AED" : "#27272A", margin: "0 6px" }} />
                )}
              </div>
            ))}
          </div>

          {/* STEP: CPF */}
          {step === "cpf" && (
            <Card>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#FAFAFA", marginBottom: 4 }}>
                Consulta de Elegibilidade
              </div>
              <div style={{ fontSize: 13, color: "#71717A", marginBottom: 24 }}>
                Digite o CPF. A consulta entra na esteira ao lado.
              </div>
              <form onSubmit={handleCPF} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, color: "#A1A1AA" }}>CPF do Cliente</label>
                  <input
                    value={cpf}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                      const formatted = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
                        .replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3")
                        .replace(/(\d{3})(\d{1,3})/, "$1.$2");
                      setCpf(formatted);
                    }}
                    placeholder="000.000.000-00"
                    required
                    style={{
                      background: "#111113", border: "1px solid #27272A", borderRadius: 8,
                      padding: "14px 16px", color: "#FAFAFA", fontSize: 20, outline: "none",
                      fontFamily: "monospace", letterSpacing: 2,
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = "#7C3AED"}
                    onBlur={e => e.currentTarget.style.borderColor = "#27272A"}
                  />
                </div>
                {error && (
                  <div style={{ color: "#EF4444", fontSize: 13, padding: "8px 12px", background: "#EF444415", borderRadius: 6 }}>
                    {error}
                  </div>
                )}
                <Button type="submit" loading={loading} size="lg">
                  Consultar Elegibilidade
                </Button>
              </form>
            </Card>
          )}

          {/* STEP: POLLING */}
          {step === "polling" && (
            <Card>
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  border: "3px solid #7C3AED", borderTopColor: "transparent",
                  animation: "spin 1s linear infinite", margin: "0 auto 20px",
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#FAFAFA", marginBottom: 8 }}>
                  Consultando elegibilidade...
                </div>
                <div style={{ fontSize: 13, color: "#71717A", marginBottom: 12 }}>
                  CPF: {formatCPF(cpf.replace(/\D/g, ""))}
                </div>
                <div style={{ fontSize: 12, color: "#52525B" }}>
                  Status: <span style={{ color: "#A78BFA" }}>{termStatus}</span>
                  {" • "}Aguardando ({pollingCount * 2}s)
                </div>
                <div style={{ fontSize: 11, color: "#3F3F46", marginTop: 8 }}>
                  A consulta pode levar até 60 segundos
                </div>
                <div style={{ marginTop: 20 }}>
                  <Button variant="secondary" size="sm" onClick={() => { stopPolling(); resetForm(); }}>
                    Consultar outro CPF
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* STEP: MANUAL DATA */}
          {step === "manual" && (
            <Card>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#FAFAFA", marginBottom: 4 }}>
                Dados Complementares
              </div>
              <div style={{ fontSize: 13, color: "#71717A", marginBottom: 24 }}>
                A consulta automática não localizou todos os dados. Preencha manualmente.
              </div>
              <form onSubmit={handleManualSubmit} className="grid-form-2" style={{ gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Input label="Nome Completo" value={manualForm.nome} onChange={e => mf("nome", e.target.value)} required />
                </div>
                <Input label="Data de Nascimento" type="date" value={manualForm.data_nascimento} onChange={e => mf("data_nascimento", e.target.value)} required />
                <Input label="Nome da Mãe" value={manualForm.nome_mae} onChange={e => mf("nome_mae", e.target.value)} required />
                <Input label="Empresa / Órgão" value={manualForm.empresa} onChange={e => mf("empresa", e.target.value)} required />
                <Input label="Matrícula" value={manualForm.matricula} onChange={e => mf("matricula", e.target.value)} required />
                {error && <div style={{ gridColumn: "1/-1", color: "#EF4444", fontSize: 13 }}>{error}</div>}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                  <Button variant="secondary" type="button" onClick={resetForm}>Voltar</Button>
                  <Button type="submit" loading={loading}>Continuar</Button>
                </div>
              </form>
            </Card>
          )}

          {/* STEP: SIMULATIONS — full width table */}
          {step === "simulations" && (
            <div>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Button variant="secondary" size="sm" onClick={resetForm}>← Nova consulta</Button>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#FAFAFA" }}>Opções de Crédito</div>
                    <div style={{ fontSize: 13, color: "#71717A" }}>
                      CPF: {formatCPF(cpf.replace(/\D/g, "") || "")} — Selecione a melhor opção
                    </div>
                  </div>
                </div>
                {simMargem != null && (
                  <div style={{
                    background: "#22C55E15", border: "1px solid #22C55E30",
                    borderRadius: 8, padding: "8px 16px",
                  }}>
                    <div style={{ fontSize: 11, color: "#71717A" }}>Margem disponível</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#22C55E" }}>
                      {formatCurrency(simMargem)}
                    </div>
                  </div>
                )}
              </div>

              {simulations.length === 0 ? (
                <Card>
                  <div style={{ color: "#52525B", textAlign: "center", padding: "32px 20px" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                    <div style={{ fontSize: 15, color: "#71717A" }}>Nenhuma simulação disponível</div>
                    <div style={{ fontSize: 13, color: "#52525B", marginTop: 4 }}>
                      O cliente pode não ter margem suficiente ou aguarde mais alguns instantes.
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <Button variant="secondary" size="sm" onClick={() => {
                        getSimulations(termId).then(data => {
                          setSimulations(data.simulations ?? []);
                          setSimMargem(data.margem ?? null);
                          setSimProduto(data.produto ?? "");
                        }).catch(() => {});
                      }}>↻ Atualizar</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {/* Produto badge */}
                  {simProduto && (
                    <div style={{ marginBottom: 12 }}>
                      <span style={{
                        display: "inline-block",
                        padding: "4px 12px", borderRadius: 20,
                        background: "#7C3AED20", border: "1px solid #7C3AED40",
                        fontSize: 12, color: "#A78BFA", fontWeight: 600, letterSpacing: 1,
                        textTransform: "uppercase",
                      }}>
                        FUNDO A — {maskTableName(simProduto)}
                      </span>
                    </div>
                  )}

                  {/* Table */}
                  <div className="table-scroll" style={{ borderRadius: 10 }}>
                  <div style={{
                    background: "#18181B", border: "1px solid #27272A", borderRadius: 10,
                    overflow: "hidden",
                    minWidth: 480,
                  }}>
                    {/* Table Header */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 1fr 1fr 1fr 140px",
                      gap: 0,
                      background: "#111113",
                      borderBottom: "1px solid #27272A",
                      padding: "10px 16px",
                    }}>
                      {["Prazo", "Valor Liberado", "Parcela", "Valor Fin.", "Taxa a.m.", ""].map((h, i) => (
                        <div key={i} style={{
                          fontSize: 11, color: "#71717A", fontWeight: 600,
                          textAlign: i > 0 && i < 5 ? "right" : "left",
                          textTransform: "uppercase", letterSpacing: 0.5,
                        }}>
                          {h}
                        </div>
                      ))}
                    </div>

                    {/* Table Rows */}
                    {simulations.map((sim: any, i) => {
                      const isSelected = selectedSim?.uuid === sim.uuid;
                      return (
                        <div
                          key={sim.uuid ?? i}
                          onClick={() => handleSelectSim(sim)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "80px 1fr 1fr 1fr 1fr 140px",
                            gap: 0,
                            padding: "14px 16px",
                            borderBottom: i < simulations.length - 1 ? "1px solid #27272A" : "none",
                            cursor: "pointer",
                            background: isSelected ? "#7C3AED15" : "transparent",
                            borderLeft: isSelected ? "3px solid #7C3AED" : "3px solid transparent",
                            transition: "all 120ms",
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "#27272A40";
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                          }}
                        >
                          {/* Prazo */}
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#FAFAFA" }}>
                            {sim.prazo}x
                          </div>
                          {/* Valor Liberado */}
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#22C55E" }}>
                              {formatCurrency(Number(sim.valor_desembolso ?? sim.valor_liberado ?? 0))}
                            </div>
                          </div>
                          {/* Parcela */}
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA" }}>
                              {formatCurrency(Number(sim.valor_parcela ?? 0))}
                            </div>
                          </div>
                          {/* Valor Financiado */}
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, color: "#A1A1AA" }}>
                              {formatCurrency(Number(sim.valor_financiado ?? 0))}
                            </div>
                          </div>
                          {/* Taxa */}
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, color: "#A78BFA" }}>
                              {Number(sim.taxa_juros_mensal ?? sim.taxa ?? 0).toFixed(2)}%
                            </div>
                          </div>
                          {/* Action */}
                          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                            <div style={{
                              padding: "6px 14px", borderRadius: 6,
                              background: isSelected ? "#7C3AED" : "#7C3AED20",
                              border: `1px solid ${isSelected ? "#7C3AED" : "#7C3AED40"}`,
                              color: isSelected ? "#FAFAFA" : "#A78BFA",
                              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                            }}>
                              {isSelected ? "✓ Selecionada" : "Selecionar →"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>{/* end table-scroll */}

                  {/* Selected summary + proceed */}
                  {selectedSim && (
                    <div style={{
                      marginTop: 16,
                      background: "#7C3AED15", border: "1px solid #7C3AED40",
                      borderRadius: 10, padding: "14px 20px",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
                    }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#A78BFA", marginBottom: 4 }}>Simulação selecionada</div>
                        <div style={{ fontSize: 14, color: "#FAFAFA" }}>
                          <strong>{formatCurrency(Number(selectedSim.valor_desembolso ?? selectedSim.valor_liberado ?? 0))}</strong>
                          {" em "}
                          <strong>{selectedSim.prazo}x</strong>
                          {" de "}
                          <strong>{formatCurrency(Number(selectedSim.valor_parcela ?? 0))}</strong>
                          {" — taxa "}
                          <strong style={{ color: "#A78BFA" }}>
                            {Number(selectedSim.taxa_juros_mensal ?? selectedSim.taxa ?? 0).toFixed(2)}% a.m.
                          </strong>
                        </div>
                      </div>
                      <Button onClick={() => {
                        // Pre-fill all available client fields from term rawPayload
                        const activeTerm = terms.find(t => t.id === termId);
                        if (activeTerm?.rawPayload) {
                          try {
                            const p = JSON.parse(activeTerm.rawPayload);
                            const rawDate = p?.data_nascimento ?? p?.nascimento ?? p?.cliente?.data_nascimento ?? p?.cliente?.nascimento;
                            const formattedDate = formatDateForInput(rawDate);
                            console.log("[Pre-fill] Birth Date API:", rawDate, "→ Formatted:", formattedDate);
                            setForm(f => ({
                              ...f,
                              nome: f.nome || p?.nome || p?.name || p?.cliente?.nome || "",
                              nome_mae: f.nome_mae || p?.nome_mae || p?.filiacao_mae || p?.cliente?.nome_mae || "",
                              data_nascimento: f.data_nascimento || formattedDate,
                              empresa: f.empresa || p?.empresa || p?.orgao || p?.cliente?.empresa || "",
                              matricula: f.matricula || p?.matricula || p?.cliente?.matricula || "",
                            }));
                          } catch { /* silently ignore parse errors */ }
                        }
                        setStep("form");
                      }}>
                        Continuar → Dados do Cliente
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP: FORM */}
          {step === "form" && selectedSim && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <Button variant="secondary" size="sm" onClick={() => setStep("simulations")}>← Voltar</Button>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#FAFAFA" }}>Dados do Cliente</div>
              </div>

              <div style={{
                background: "#18181B", border: "1px solid #7C3AED30",
                borderRadius: 10, padding: 16, marginBottom: 24,
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "#71717A" }}>Valor Liberado</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#22C55E" }}>
                    {formatCurrency(Number(selectedSim.valor_desembolso ?? selectedSim.valor_liberado ?? 0))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#71717A" }}>Parcelas</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#FAFAFA" }}>
                    {selectedSim.prazo}x {formatCurrency(Number(selectedSim.valor_parcela ?? 0))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#71717A" }}>Taxa a.m.</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#A78BFA" }}>
                    {Number(selectedSim.taxa_juros_mensal ?? selectedSim.taxa ?? 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#71717A" }}>Tabela</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#A1A1AA" }}>
                    {maskTableName(selectedSim.tabelas?.nome ?? selectedSim.produto)}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitProposal}>
                <div className="grid-form-2" style={{ gap: 20 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#8B5CF6", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #27272A" }}>
                      Dados Pessoais
                    </div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Input label="Nome Completo" value={form.nome} onChange={e => f("nome", e.target.value)} required />
                  </div>
                  <Input label="CPF" value={formatCPF(cpf.replace(/\D/g, ""))} disabled />
                  <Input label="RG" value={form.rg} onChange={e => f("rg", e.target.value)} />
                  <Input label="Órgão Emissor (ex: SSP)" value={form.rg_emissor} onChange={e => f("rg_emissor", e.target.value)} placeholder="SSP" />
                  <Select label="UF do RG" value={form.rg_uf} onChange={e => f("rg_uf", (e.target as HTMLSelectElement).value)}
                    options={[{ value: "", label: "Selecione" }, ...ESTADOS.map(s => ({ value: s, label: s }))]} />
                  <Input label="Data de Emissão do RG" type="date" value={form.rg_data_emissao} onChange={e => f("rg_data_emissao", e.target.value)} />
                  <Input label="Data de Nascimento" type="date" value={form.data_nascimento} onChange={e => f("data_nascimento", e.target.value)} />
                  <Input label="Nome da Mãe" value={form.nome_mae} onChange={e => f("nome_mae", e.target.value)} />

                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#8B5CF6", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #27272A" }}>
                      Endereço
                    </div>
                  </div>
                  <Input label="CEP" value={form.cep} onChange={e => f("cep", e.target.value)} onBlur={e => lookupCep(e.target.value)} placeholder="00000-000" />
                  <Input label="Logradouro" value={form.logradouro} onChange={e => f("logradouro", e.target.value)} />
                  <Input label="Número" value={form.numero} onChange={e => f("numero", e.target.value)} />
                  <Input label="Complemento" value={form.complemento} onChange={e => f("complemento", e.target.value)} />
                  <Input label="Bairro" value={form.bairro} onChange={e => f("bairro", e.target.value)} />
                  <Input label="Cidade" value={form.cidade} onChange={e => f("cidade", e.target.value)} />
                  <Select label="UF" value={form.uf} onChange={e => f("uf", (e.target as HTMLSelectElement).value)}
                    options={ESTADOS.map(s => ({ value: s, label: s }))} />

                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#8B5CF6", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #27272A" }}>
                      Dados Bancários
                    </div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Input label="Banco (apenas bancos aceitos)" value={form.banco} onChange={e => f("banco", e.target.value)} placeholder="Ex: 341" required />
                    {form.banco && isAllowedBankCode(normalizeBankCode(form.banco)) && (
                      <div style={{ fontSize: 12, color: "#22C55E", marginTop: 4 }}>
                        ✓ {bankDisplayName(form.banco)}
                      </div>
                    )}
                    {form.banco && !isAllowedBankCode(normalizeBankCode(form.banco)) && (
                      <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>
                        Banco não permitido. Use apenas a lista autorizada.
                      </div>
                    )}
                  </div>
                  <Input label="Agência" value={form.agencia} onChange={e => f("agencia", e.target.value)} placeholder="Ex: 1234" required />
                  <Input label="Dígito da Agência" value={form.agencia_digito} onChange={e => f("agencia_digito", e.target.value)} placeholder="Ex: 0" />
                  <Input label="Conta" value={form.conta} onChange={e => f("conta", e.target.value)} placeholder="Ex: 12345" required />
                  <Input label="Dígito da Conta" value={form.conta_digito} onChange={e => f("conta_digito", e.target.value)} placeholder="Ex: 6" required />
                  <Select label="Tipo de Conta" value={form.tipo_conta} onChange={e => f("tipo_conta", (e.target as HTMLSelectElement).value)}
                    options={[{ value: "corrente", label: "Corrente" }, { value: "poupanca", label: "Poupança" }]} />
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Input label="Chave PIX" value={form.chave_pix} onChange={e => f("chave_pix", e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                    {form.chave_pix && isPixKeyAllowedForBank(form.chave_pix, form.banco) && (
                      <div style={{ fontSize: 12, color: "#22C55E", marginTop: 4 }}>
                        ✓ Chave PIX vinculada a banco aceito
                      </div>
                    )}
                    {form.chave_pix && !isPixKeyAllowedForBank(form.chave_pix, form.banco) && (
                      <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>
                        A chave PIX precisa pertencer ao banco selecionado ou a outro banco autorizado.
                      </div>
                    )}
                  </div>

                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#8B5CF6", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #27272A" }}>
                      Contato
                    </div>
                  </div>
                  <Input label="Telefone" value={form.telefone} onChange={e => f("telefone", e.target.value)} placeholder="(00) 00000-0000" />
                  <Input label="E-mail" type="email" value={form.email} onChange={e => f("email", e.target.value)} />

                  <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#8B5CF6", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #27272A" }}>
                      Dados Profissionais
                    </div>
                  </div>
                  <Input label="Empresa / Órgão" value={form.empresa} onChange={e => f("empresa", e.target.value)} />
                  <Input label="Matrícula" value={form.matricula} onChange={e => f("matricula", e.target.value)} />
                  <Input label="Salário" type="number" value={form.salario} onChange={e => f("salario", e.target.value)} placeholder="0.00" />

                  {error && (
                    <div style={{ gridColumn: "1/-1", color: "#EF4444", fontSize: 13, padding: "10px 14px", background: "#EF444415", borderRadius: 6 }}>
                      {error}
                    </div>
                  )}
                  <div style={{ gridColumn: "1/-1", display: "flex", gap: 10, marginTop: 8 }}>
                    <Button variant="secondary" type="button" onClick={() => setStep("simulations")}>Voltar</Button>
                    <Button type="submit" loading={loading} size="lg">Enviar Proposta</Button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* STEP: DONE */}
          {step === "done" && (
            <Card style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{isDuplicate ? "⚠️" : "✅"}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: isDuplicate ? "#F59E0B" : "#22C55E", marginBottom: 8 }}>
                {isDuplicate ? "Proposta já existe" : "Proposta Enviada!"}
              </div>
              <div style={{ fontSize: 14, color: "#71717A", marginBottom: 24 }}>
                {isDuplicate
                  ? "Já existe uma proposta em andamento para este CPF."
                  : "A proposta está em análise. Acompanhe na esteira."}
              </div>
              {signatureUrl && (
                <div style={{ marginBottom: 24, padding: "16px 20px", background: "#0F172A", border: "1px solid #60A5FA40", borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: "#71717A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    🔗 Link de Formalização
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#60A5FA", wordBreak: "break-all", marginBottom: 12 }}>
                    {window.location.origin}{signatureUrl}
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <Button size="sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${signatureUrl!}`)}>Copiar Link</Button>
                    <Button size="sm" variant="secondary" onClick={() => window.open(signatureUrl!, "_blank")}>Abrir</Button>
                  </div>
                </div>
              )}
              {!signatureUrl && !isDuplicate && (
                <div style={{ marginBottom: 24, padding: "12px 16px", background: "#F59E0B10", border: "1px solid #F59E0B30", borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: "#F59E0B" }}>
                    ⚠ Link de assinatura sendo gerado... Acesse a proposta para acompanhar.
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <Button onClick={() => navigate(`/propostas/${proposalId}`)}>
                  {isDuplicate ? "Ver Proposta Existente" : "Ver Proposta"}
                </Button>
                <Button variant="secondary" onClick={resetForm}>Nova Consulta</Button>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: Esteira de consultas */}
        {showSplit && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA" }}>
                Esteira de Consultas
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
                <span style={{ fontSize: 11, color: "#52525B" }}>atualiza a cada 5s</span>
              </div>
            </div>

            {/* Filtro CPF */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <span style={{
                position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                color: "#52525B", fontSize: 13, pointerEvents: "none",
              }}>🔍</span>
              <input
                value={cpfFilter}
                onChange={e => setCpfFilter(e.target.value.replace(/\D/g, ""))}
                placeholder="Filtrar por CPF..."
                maxLength={11}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#18181B", border: "1px solid #27272A", borderRadius: 8,
                  padding: "9px 12px 9px 34px", color: "#FAFAFA", fontSize: 13, outline: "none",
                  fontFamily: "monospace",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#7C3AED"}
                onBlur={e => e.currentTarget.style.borderColor = "#27272A"}
              />
              {cpfFilter && (
                <button
                  onClick={() => setCpfFilter("")}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "#52525B", cursor: "pointer", fontSize: 14,
                  }}
                >✕</button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(() => {
                const filtered = cpfFilter
                  ? terms.filter(t => t.cpf.replace(/\D/g, "").includes(cpfFilter))
                  : terms;

                if (filtered.length === 0) {
                  return (
                    <div style={{ color: "#3F3F46", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
                      {cpfFilter ? "Nenhuma consulta encontrada para este CPF" : "Nenhuma consulta realizada ainda"}
                    </div>
                  );
                }

                return filtered.map(term => {
                  const clienteName = getClienteName(term);
                  const eligibility = resolveEligibility(term);
                  const margemFormatted = eligibility.margem != null ? formatCurrency(eligibility.margem) : null;
                  const initial = getInitial(clienteName);
                  const isPolling = ["criada", "processando"].includes(term.status);
                  // Simular only when truly eligible per resolveEligibility
                  const canSimulate = eligibility.eligible && !term.proposal;

                  // Effective display status — show inelegível when resolveEligibility says so,
                  // even if DB still says elegivel
                  const displayStatus = isPolling
                    ? term.status
                    : eligibility.eligible
                      ? "elegivel"
                      : (term.status === "elegivel" ? "inelegivel" : term.status);

                  return (
                    <div
                      key={term.id}
                      style={{
                        background: "#18181B",
                        border: `1px solid ${term.id === termId ? "#7C3AED50" : "#27272A"}`,
                        borderRadius: 10,
                        padding: "14px 16px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                        boxShadow: term.id === termId ? "0 0 16px rgba(124,58,237,0.1)" : "none",
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                        marginTop: 2,
                        background: isPolling ? "#7C3AED30" : displayStatus === "elegivel" ? "#22C55E20" : displayStatus === "inelegivel" ? "#EF444420" : "#27272A",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, fontWeight: 700,
                        color: isPolling ? "#A78BFA" : displayStatus === "elegivel" ? "#22C55E" : displayStatus === "inelegivel" ? "#EF4444" : "#71717A",
                      }}>
                        {isPolling ? (
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%",
                            border: "2px solid #7C3AED", borderTopColor: "transparent",
                            animation: "spin 1s linear infinite",
                          }} />
                        ) : initial}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Name + CPF row */}
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#FAFAFA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {clienteName ?? formatCPF(term.cpf)}
                          </div>
                          {clienteName && (
                            <div style={{ fontSize: 12, color: "#52525B", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                              {formatCPF(term.cpf)}
                            </div>
                          )}
                        </div>

                        {/* Margem row — always shown when available */}
                        {!isPolling && (
                          <div style={{ marginBottom: 4 }}>
                            {margemFormatted ? (
                              <span style={{
                                fontSize: 13, fontWeight: 700,
                                color: eligibility.margem! > 0 ? "#22C55E" : "#EF4444",
                              }}>
                                Margem: {margemFormatted}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "#52525B" }}>
                                Margem indisponível
                              </span>
                            )}
                            {/* Ineligibility reason */}
                            {!eligibility.eligible && eligibility.reason !== "Processando" && (
                              <span style={{ fontSize: 11, color: "#EF4444", marginLeft: 8 }}>
                                — {eligibility.reason}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Meta row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#52525B" }}>{term.digitadorName}</span>
                          <span style={{ fontSize: 11, color: "#3F3F46" }}>•</span>
                          <span style={{ fontSize: 11, color: "#52525B" }}>{formatDateTime(term.createdAt)}</span>
                        </div>
                      </div>

                      {/* Status + actions */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        <div style={{
                          padding: "3px 10px", borderRadius: 20,
                          background: statusBadgeColor(displayStatus).bg,
                          border: `1px solid ${statusBadgeColor(displayStatus).border}`,
                          color: statusBadgeColor(displayStatus).text,
                          fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                        }}>
                          {isPolling ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: "50%",
                                border: "1.5px solid currentColor", borderTopColor: "transparent",
                                display: "inline-block", animation: "spin 0.8s linear infinite",
                              }} />
                              {statusLabel(term.status)}
                            </span>
                          ) : statusLabel(displayStatus)}
                        </div>
                        {canSimulate && (
                          <button
                            onClick={() => handleRetomar(term)}
                            style={{
                              padding: "3px 10px", borderRadius: 6,
                              background: "#7C3AED", border: "none",
                              color: "#FAFAFA", fontSize: 11, fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            Simular →
                          </button>
                        )}
                        {term.proposal && (
                          <button
                            onClick={() => navigate(`/propostas/${term.proposal!.id}`)}
                            style={{
                              padding: "3px 10px", borderRadius: 6,
                              background: "#18181B", border: "1px solid #27272A",
                              color: "#A1A1AA", fontSize: 11, cursor: "pointer",
                            }}
                          >
                            Ver proposta
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
        <div style={{ flexShrink: 0, width: 220 }}>
          <BankAllowedSidebar />
        </div>
      </div>
    </Shell>
  );
}
