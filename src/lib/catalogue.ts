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

/**
 * Finds the highest catalogue number for a given label key from the live
 * releases list. Returns null if no releases exist for that label yet.
 */
export function latestFromReleases(
  releases: Array<{ label: string; catalogueNumber: string }>,
  labelKey: string
): string | null {
  const candidates = releases
    .filter((r) => r.label === labelKey && r.catalogueNumber)
    .map((r) => {
      const m = r.catalogueNumber.match(/^([A-Za-z]+)(\d+)$/);
      return m ? { cat: r.catalogueNumber, num: parseInt(m[2]!, 10) } : null;
    })
    .filter((x): x is { cat: string; num: number } => x !== null);

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.num >= b.num ? a : b)).cat;
}

/**
 * Suggests the next catalogue number for a label, derived from existing
 * releases. Falls back to {shortCode}001 if no releases exist yet.
 */
export function suggestForLabel(
  releases: Array<{ label: string; catalogueNumber: string }>,
  labelKey: string,
  shortCode: string
): string {
  const latest = latestFromReleases(releases, labelKey);
  if (latest) return suggestNextCatalogueNumber(latest);
  return `${shortCode}001`;
}
