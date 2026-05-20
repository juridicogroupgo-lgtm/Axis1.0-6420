export const ALLOWED_BANKS: Record<string, string> = {
  "001": "Banco do Brasil",
  "041": "Banrisul",
  "237": "Bradesco",
  "104": "Caixa Econômica Federal",
  "341": "Itaú",
  "033": "Santander",
  "756": "Sicoob",
  "748": "Sicredi",
  "077": "Banco Inter",
  "336": "C6 Bank",
  "1041": "Caixa Tem",
  "273": "iti",
  "212": "Next",
  "260": "Nubank",
};

const ALLOWED_NAME_HINTS = [
  "BANCO DO BRASIL",
  "BANRISUL",
  "BRADESCO",
  "CAIXA ECONÔMICA FEDERAL",
  "CAIXA ECONOMICA FEDERAL",
  "CAIXA TEM",
  "ITAU",
  "ITAU",
  "SANTANDER",
  "SICOOB",
  "SICREDI",
  "INTER",
  "C6 BANK",
  "ITI",
  "NEXT",
  "NUBANK",
];

export function normalizeBankCode(input: string) {
  return String(input ?? "").replace(/\D/g, "").padStart(3, "0");
}

export function isAllowedBankCode(code: string) {
  const normalized = normalizeBankCode(code);
  return Boolean(ALLOWED_BANKS[normalized]);
}

export function bankDisplayName(code: string) {
  const normalized = normalizeBankCode(code);
  return ALLOWED_BANKS[normalized] ?? "Banco não autorizado";
}

export function isPixKeyAllowedForBank(key: string, bankCode: string) {
  const code = normalizeBankCode(bankCode);
  const value = String(key ?? "").trim().toUpperCase();
  if (!value) return false;

  const allowed = ALLOWED_NAME_HINTS;
  if (code === "260" && value.includes("NUBANK")) return true;
  if (code === "077" && value.includes("INTER")) return true;
  if (code === "336" && value.includes("C6")) return true;
  if (code === "212" && value.includes("NEXT")) return true;
  if (code === "273" && value.includes("ITI")) return true;
  if (code === "001" && value.includes("BANCO DO BRASIL")) return true;
  if (code === "041" && value.includes("BANRISUL")) return true;
  if (code === "237" && value.includes("BRADESCO")) return true;
  if (code === "104" && (value.includes("CAIXA") || value.includes("ECONOMICA") || value.includes("ECONÔMICA"))) return true;
  if (code === "341" && (value.includes("ITAU") || value.includes("ITAU"))) return true;
  if (code === "033" && value.includes("SANTANDER")) return true;
  if (code === "756" && value.includes("SICOOB")) return true;
  if (code === "748" && value.includes("SICREDI")) return true;

  return allowed.some(h => value.includes(h));
}

export function validatePixKeyAgainstAllowedBanks(pixKey: string) {
  const value = String(pixKey ?? "").trim();
  if (!value) return { ok: false, reason: "Chave PIX obrigatória" };
  return { ok: true as const };
}
