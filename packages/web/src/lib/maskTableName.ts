/**
 * Table name masking — SINGLE SOURCE OF TRUTH
 *
 * The internal/API table names are NEVER shown to operators.
 * Always pipe any table name field through maskTableName() before rendering.
 *
 * Internal IDs (id, codigo, tableId) used in API payloads must remain unchanged.
 */

const TABLE_NAME_MASK: Record<string, string> = {
  TURQUESA: "É PENTA",
  "GNAISSE (COM SEGURO)": "HEXA-CAMPEÃO (COM SEGURO)",
  ARDÓSIA: "SAI QUE É SUA TAFFAREL",
  MALAQUITA: "É DO BRASILLL",
  // Keep adding mappings here as new table names appear
};

/**
 * Masks a table/product name from the GF API before displaying to operators.
 * - Known names → masked display name
 * - Unknown / unmapped → "TABELA DISPONÍVEL"
 * - Null / undefined / empty → "TABELA DISPONÍVEL"
 */
export function maskTableName(tableName: unknown): string {
  if (!tableName) return "TABELA DISPONÍVEL";

  const normalized = String(tableName).trim().toUpperCase().normalize("NFC");

  return TABLE_NAME_MASK[normalized] ?? "TABELA DISPONÍVEL";
}

/**
 * Use this when you need the masked name for logging but still want to
 * keep the internal name visible in dev-only debug contexts.
 * In production logs, always call maskTableName().
 */
export function maskTableNameForLog(tableName: unknown): string {
  return maskTableName(tableName);
}
