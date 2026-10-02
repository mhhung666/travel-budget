/**
 * Normalize a user-entered decimal while preserving editable intermediate
 * states such as an empty string, `12.` or `.5`.
 *
 * Returning null means the input contains unsupported syntax. In particular,
 * scientific notation and signs are rejected so browser-specific
 * `<input type="number">` behavior cannot silently turn `1e3` into 1000.
 */
export function normalizeUnsignedDecimalInput(value: string): string | null {
  const normalized = value.replace(',', '.');

  if (!/^\d*(?:\.\d*)?$/.test(normalized)) {
    return null;
  }

  return normalized;
}
