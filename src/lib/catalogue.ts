/**
 * Suggests the next catalogue number given the latest one for a label.
 * Handles a numeric suffix of any width, e.g.:
 *   MW089  -> MW090
 *   MWH012 -> MWH013
 *   MW099  -> MW100 (width grows naturally, no fixed padding assumption
 *                     beyond preserving at least the original digit count)
 *
 * Manual override is always allowed in the UI — this only provides the
 * suggested default.
 */
export function suggestNextCatalogueNumber(latest: string): string {
  const match = latest.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) {
    throw new Error(
      `Cannot parse catalogue number "${latest}". Expected a letter prefix followed by digits, e.g. "MW089".`
    );
  }
  const prefix = match[1];
  const digits = match[2];
  if (!prefix || !digits) {
    throw new Error(`Cannot parse catalogue number "${latest}".`);
  }
  const width = digits.length;
  const next = (parseInt(digits, 10) + 1).toString().padStart(width, '0');
  return `${prefix}${next}`;
}
