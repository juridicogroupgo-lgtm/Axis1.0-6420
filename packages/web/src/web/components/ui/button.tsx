import { ReactNode, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const styles: Record<string, any> = {
    primary: {
      background: "#7C3AED",
      color: "#FAFAFA",
      border: "none",
    },
    secondary: {
      background: "transparent",
      color: "#A1A1AA",
      border: "1px solid #27272A",
    },
    ghost: {
      background: "transparent",
      color: "#A1A1AA",
      border: "none",
    },
    danger: {
      background: "#EF444420",
      color: "#EF4444",
      border: "1px solid #EF444430",
    },
    success: {
      background: "#22C55E20",
      color: "#22C55E",
      border: "1px solid #22C55E30",
    },
  };

  const sizes: Record<string, any> = {
    sm: { padding: "4px 10px", fontSize: 12, borderRadius: 4 },
    md: { padding: "8px 16px", fontSize: 13, borderRadius: 6 },
    lg: { padding: "12px 24px", fontSize: 14, borderRadius: 8 },
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        ...styles[variant],
        ...sizes[size],
        fontWeight: 500,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "all 150ms",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {loading ? "..." : children}
    </button>
  );
}
