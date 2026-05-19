export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR");
}

export function formatRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${rate.toFixed(2)}% a.m.`;
}

export function maskCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  return `***.***.${d.slice(6, 9)}-**`;
}

export function getStatusColor(status: string): string {
  const s = status?.toUpperCase();
  if (["PAGA", "APROVADA", "LIQUIDADO"].some(x => s?.includes(x))) return "#22C55E";
  if (["ASSINADA", "FORMALIZADO", "AGUARDANDO ASSINATURA"].some(x => s?.includes(x))) return "#3B82F6";
  if (["FORMALIZANDO"].some(x => s?.includes(x))) return "#60A5FA";
  if (["EM ANÁLISE", "EM ANALISE", "ANALISE"].some(x => s?.includes(x))) return "#F59E0B";
  if (["PENDÊNCIA", "PENDENTE"].some(x => s?.includes(x))) return "#F97316";
  if (["CANCELADA", "CANCELADO"].some(x => s?.includes(x))) return "#EF4444";
  if (["REPROVADA", "REPROVADO", "NEGADA"].some(x => s?.includes(x))) return "#EF4444";
  if (["AVERBAÇÃO", "AVERBADO"].some(x => s?.includes(x))) return "#8B5CF6";
  if (["ENVIADA", "ENVIADO"].some(x => s?.includes(x))) return "#A78BFA";
  return "#71717A";
}

export function getStatusBg(status: string): string {
  const color = getStatusColor(status);
  return color + "20"; // 12% opacity
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Administrador",
    gerente: "Gerente Comercial",
    loja: "Loja Master",
    digitador: "Digitador",
  };
  return map[role] ?? role;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
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
  return map[status] ?? status;
}

export function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (["aprovado", "pago", "assinado"].includes(status)) return "default";
  if (["pendente", "em_analise", "aguardando_assinatura", "aguardando_avervacao"].includes(status)) return "secondary";
  if (["reprovado", "cancelado"].includes(status)) return "destructive";
  return "outline";
}
