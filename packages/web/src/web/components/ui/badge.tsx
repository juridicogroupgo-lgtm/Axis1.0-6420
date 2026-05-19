import React from "react";
import { getStatusColor, getStatusBg } from "../../lib/utils";

interface BadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_LABELS: Record<string, string> = {
  "PAGA": "Paga",
  "APROVADA": "Aprovada",
  "ASSINADA": "Assinada",
  "EM ANÁLISE": "Em Análise",
  "PENDÊNCIA": "Pendência",
  "CANCELADA": "Cancelada",
  "REPROVADA": "Reprovada",
  "AGUARDANDO AVERBAÇÃO": "Ag. Averbação",
  "AGUARDANDO ASSINATURA": "Ag. Assinatura",
  "FORMALIZANDO": "Formalizando",
  "ENVIADA": "Enviada",
  "EM DIGITAÇÃO": "Em Digitação",
};

export function StatusBadge({ status, size = "md" }: BadgeProps) {
  const color = getStatusColor(status);
  const bg = getStatusBg(status);
  const label = STATUS_LABELS[status] ?? status;
  const isPulsing = ["EM ANÁLISE", "AGUARDANDO ASSINATURA", "AGUARDANDO AVERBAÇÃO", "FORMALIZANDO"].includes(status);

  return (
    <span
      className={isPulsing ? "pulse" : ""}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        borderRadius: 999,
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 500,
        color,
        background: bg,
        border: `1px solid ${color}30`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{
        width: 5, height: 5,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
      }} />
      {label}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { color: string; label: string }> = {
    admin: { color: "#8B5CF6", label: "Admin" },
    gerente: { color: "#3B82F6", label: "Gerente" },
    loja: { color: "#F59E0B", label: "Loja" },
    digitador: { color: "#71717A", label: "Digitador" },
  };
  const { color, label } = map[role] ?? { color: "#71717A", label: role };
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      color,
      background: color + "20",
    }}>
      {label}
    </span>
  );
}

// Generic Badge with variant support
interface GenericBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
}

export function Badge({ children, variant = "default", className }: GenericBadgeProps) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: "#1D4ED8", color: "#fff" },
    secondary: { background: "#F3F4F6", color: "#374151" },
    outline: { background: "transparent", color: "#374151", border: "1px solid #D1D5DB" },
    destructive: { background: "#FEF2F2", color: "#DC2626" },
  };
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </span>
  );
}
