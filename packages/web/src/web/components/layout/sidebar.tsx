import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useAuth, useRole } from "../../lib/auth-context";
import { roleLabel } from "../../lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⬛", roles: ["admin", "gerente", "loja", "digitador"] },
  { href: "/esteira", label: "Esteira", icon: "📋", roles: ["admin", "gerente", "loja", "digitador"] },
  { href: "/propostas/nova", label: "Nova Proposta", icon: "➕", roles: ["admin", "gerente", "loja", "digitador"] },
  { href: "/relatorios", label: "Relatórios", icon: "📊", roles: ["admin", "gerente", "loja", "digitador"] },
  { href: "/usuarios", label: "Usuários", icon: "👥", roles: ["admin", "gerente", "loja"] },
  { href: "/lojas", label: "Lojas", icon: "🏪", roles: ["admin", "gerente"] },
  { href: "/auditoria", label: "Auditoria", icon: "🔍", roles: ["admin"] },
  { href: "/configuracoes", label: "Configurações", icon: "⚙️", roles: ["admin"] },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { role } = useRole();

  const visible = navItems.filter(i => role && i.roles.includes(role));

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose();
  }, [location]);

  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 49,
            display: "block",
          }}
          className="sidebar-backdrop"
        />
      )}

      <aside
        className="sidebar"
        style={{
          width: 240,
          minHeight: "100vh",
          background: "#111113",
          borderRight: "1px solid #27272A",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 50,
          transition: "transform 250ms ease",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "24px 20px", borderBottom: "1px solid #27272A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #7C3AED, #4C1D95)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#FAFAFA",
            }}>A</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#FAFAFA", letterSpacing: "-0.5px" }}>
                <span style={{ color: "#8B5CF6" }}>AXIS</span> Capital
              </div>
              <div style={{ fontSize: 11, color: "#52525B" }}>Crédito do Trabalhador</div>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onClose}
            className="sidebar-close-btn"
            style={{
              background: "transparent",
              border: "none",
              color: "#71717A",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: "4px 8px",
              display: "none",
            }}
          >×</button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {visible.map(item => {
            const active = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <a style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 6,
                  marginBottom: 2,
                  cursor: "pointer",
                  textDecoration: "none",
                  background: active ? "rgba(124, 58, 237, 0.15)" : "transparent",
                  color: active ? "#A78BFA" : "#A1A1AA",
                  borderLeft: active ? "2px solid #7C3AED" : "2px solid transparent",
                  fontWeight: active ? 500 : 400,
                  fontSize: 14,
                  transition: "all 150ms",
                }}>
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  {item.label}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div style={{ padding: "16px 12px", borderTop: "1px solid #27272A" }}>
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "#18181B" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#FAFAFA", marginBottom: 2 }}>
              {user?.name}
            </div>
            <div style={{ fontSize: 11, color: "#52525B", marginBottom: 10 }}>
              {roleLabel(user?.role ?? "")}
            </div>
            <button
              onClick={logout}
              style={{
                width: "100%",
                padding: "6px 0",
                background: "transparent",
                border: "1px solid #27272A",
                borderRadius: 4,
                color: "#71717A",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Sair
            </button>
          </div>
        </div>
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .sidebar {
            transform: ${open ? "translateX(0)" : "translateX(-100%)"} !important;
          }
          .sidebar-close-btn {
            display: block !important;
          }
        }
        @media (min-width: 769px) {
          .sidebar-backdrop {
            display: none !important;
          }
          .sidebar {
            transform: translateX(0) !important;
          }
        }
      `}</style>
    </>
  );
}
