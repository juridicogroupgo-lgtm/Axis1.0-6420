import { ReactNode, CSSProperties } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, style, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#18181B",
        border: "1px solid #27272A",
        borderRadius: 10,
        padding: 20,
        cursor: onClick ? "pointer" : undefined,
        transition: "border-color 150ms",
        ...style,
      }}
      onMouseEnter={onClick ? (e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#3F3F46") : undefined}
      onMouseLeave={onClick ? (e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#27272A") : undefined}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: string;
}

export function StatCard({ label, value, sub, color, icon }: StatCardProps) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "#71717A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: color ?? "#FAFAFA", lineHeight: 1 }}>
            {value}
          </div>
          {sub && <div style={{ fontSize: 12, color: "#52525B", marginTop: 6 }}>{sub}</div>}
        </div>
        {icon && (
          <div style={{
            width: 40, height: 40,
            background: (color ?? "#7C3AED") + "20",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
