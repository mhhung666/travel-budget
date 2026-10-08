/** Known server codes are translated; unknown results direct users to durable recovery. */
export function ledgerErrorMessage(
  error: string,
  t: { (key: string): string; has?: (key: string) => boolean }
) {
  const key = error.replace(/^ledger\./, '');
  return t.has?.(key) ? t(key) : error;
}
