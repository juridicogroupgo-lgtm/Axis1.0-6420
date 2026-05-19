import { ReactNode, useState } from "react";
import { Sidebar } from "./sidebar";

interface ShellProps {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
}

export function Shell({ children, title, actions }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="shell-main" style={{
        flex: 1,
        minHeight: "100vh",
        background: "#09090B",
        transition: "margin-left 250ms ease",
      }}>
        {/* Top bar */}
        <div style={{
          padding: "0 16px",
          borderBottom: "1px solid #27272A",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#111113",
          position: "sticky",
          top: 0,
          zIndex: 40,
          minHeight: 56,
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
            {/* Hamburger — mobile only */}
            <button
              className="hamburger-btn"
              onClick={() => setSidebarOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "#A1A1AA",
                cursor: "pointer",
                padding: "6px",
                borderRadius: 6,
                display: "none",
                flexShrink: 0,
                fontSize: 20,
                lineHeight: 1,
              }}
              aria-label="Menu"
            >
              ☰
            </button>

            {title && (
              <h1 style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 600,
                color: "#FAFAFA",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>{title}</h1>
            )}
          </div>

          {actions && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="shell-content" style={{ padding: "24px 28px" }}>
          {children}
        </div>
      </main>

      <style>{`
        @media (min-width: 769px) {
          .shell-main {
            margin-left: 240px !important;
          }
          .hamburger-btn {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .shell-main {
            margin-left: 0 !important;
          }
          .hamburger-btn {
            display: flex !important;
          }
          .shell-content {
            padding: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
