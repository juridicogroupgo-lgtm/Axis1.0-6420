/**
 * Table name masking — backend side
 *
 * Internal API names are NEVER exposed to operators in logs, responses,
 * exports or any user-facing output.
 *
 * Internal IDs used in API payloads must remain unchanged — only mask before
 * sending to frontend or writing to user-visible logs/exports.
 */

const TABLE_NAME_MASK: Record<string, string> = {
  TURQUESA: "É PENTA",
  "GNAISSE (COM SEGURO)": "HEXA-CAMPEÃO (COM SEGURO)",
  ARDÓSIA: "SAI QUE É SUA TAFFAREL",
  MALAQUITA: "É DO BRASILLL",
  // Add new mappings here as new table names surface
};

/**
 * Masks a table/product name before exposing to operators.
 * - Known names → masked display name
 * - Unknown / unmapped → "TABELA DISPONÍVEL"
 * - Null / undefined / empty → "TABELA DISPONÍVEL"
 */
export function maskTableName(tableName: unknown): string {
  if (!tableName) return "TABELA DISPONÍVEL";

  const normalized = String(tableName).trim().toUpperCase().normalize("NFC");

  return TABLE_NAME_MASK[normalized] ?? "TABELA DISPONÍVEL";
}
