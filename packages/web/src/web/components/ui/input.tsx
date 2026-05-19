import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, style, ...props }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {label && (
          <label style={{ fontSize: 13, fontWeight: 500, color: "#A1A1AA" }}>
            {label}
            {props.required && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
          </label>
        )}
        <input
          ref={ref}
          {...props}
          style={{
            background: "#111113",
            border: `1px solid ${error ? "#EF4444" : "#27272A"}`,
            borderRadius: 6,
            padding: "8px 12px",
            color: "#FAFAFA",
            fontSize: 13,
            outline: "none",
            width: "100%",
            fontFamily: "inherit",
            transition: "border-color 150ms",
            ...style,
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = error ? "#EF4444" : "#7C3AED";
            props.onFocus?.(e);
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = error ? "#EF4444" : "#27272A";
            props.onBlur?.(e);
          }}
        />
        {error && <span style={{ fontSize: 12, color: "#EF4444" }}>{error}</span>}
        {hint && !error && <span style={{ fontSize: 12, color: "#52525B" }}>{hint}</span>}
      </div>
    );
  }
);

interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, options, style, ...props }: SelectProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: "#A1A1AA" }}>
          {label}
          {props.required && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
        </label>
      )}
      <select
        {...props as any}
        style={{
          background: "#111113",
          border: `1px solid ${error ? "#EF4444" : "#27272A"}`,
          borderRadius: 6,
          padding: "8px 12px",
          color: props.value ? "#FAFAFA" : "#52525B",
          fontSize: 13,
          outline: "none",
          width: "100%",
          fontFamily: "inherit",
          cursor: "pointer",
          ...style,
        }}
      >
        <option value="">Selecione...</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <span style={{ fontSize: 12, color: "#EF4444" }}>{error}</span>}
    </div>
  );
}
