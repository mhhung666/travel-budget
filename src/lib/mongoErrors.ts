/** Only classify account-key conflicts; unrelated duplicate keys stay internal errors. */
export function isAccountDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) {
    return false;
  }
  if (!('keyPattern' in error) || !error.keyPattern || typeof error.keyPattern !== 'object') {
    return false;
  }
  const fields = Object.keys(error.keyPattern);
  return fields.length === 1 && (fields[0] === 'username' || fields[0] === 'email');
}
