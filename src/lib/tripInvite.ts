import { isValidHashCode } from './hashcode';

/**
 * Accepts either a bare invitation code or a complete `/join/{code}` URL.
 * The returned value is always a validated lowercase code, never a URL.
 */
export function parseTripInviteInput(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  const bareCode = input.toLowerCase();
  if (isValidHashCode(bareCode)) return bareCode;

  try {
    const url = new URL(input, 'https://invitation.local');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 'join') return null;

    const code = decodeURIComponent(segments[1]).toLowerCase();
    return isValidHashCode(code) ? code : null;
  } catch {
    return null;
  }
}
