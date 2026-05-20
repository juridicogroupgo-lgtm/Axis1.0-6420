import { ALLOWED_BANKS } from "../lib/bank-allowed";

export function BankAllowedSidebar() {
  const items = Object.entries(ALLOWED_BANKS);
  return (
    <aside style={{
      position: "sticky",
      top: 24,
      alignSelf: "flex-start",
      width: 210,
      marginLeft: 16,
      padding: "14px 12px",
      borderRadius: 12,
      border: "1px solid #27272A",
      background: "rgba(24,24,27,0.55)",
      backdropFilter: "blur(6px)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
      opacity: 0.92,
      color: "#A1A1AA",
      fontSize: 11,
      lineHeight: 1.35,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#FAFAFA", marginBottom: 10, letterSpacing: 0.3 }}>
        Bancos aceitos
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(([code, name]) => (
          <div key={code} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: "#71717A", minWidth: 34 }}>{code}</span>
            <span style={{ textAlign: "right" }}>{name}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: "#52525B" }}>
        PIX deve pertencer a um banco desta lista.
      </div>
    </aside>
  );
}
