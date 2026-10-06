import { inviteCodeSchema } from '@travel-budget/contracts';
/** Strict environment origin and path only; never fetch arbitrary links. */
export function parseInvitation(
  value: string,
  apiBaseUrl: string,
  webOrigin?: string
): string | null {
  const bare = inviteCodeSchema.safeParse(value);
  if (bare.success) return bare.data;
  try {
    const url = new URL(value.trim());
    const configured = new URL(webOrigin ?? apiBaseUrl);
    if (
      webOrigin &&
      (configured.pathname !== '/' ||
        configured.search ||
        configured.hash ||
        configured.username ||
        configured.password ||
        !['http:', 'https:'].includes(configured.protocol))
    )
      return null;
    const origin = configured.origin;
    if (url.origin !== origin || url.username || url.password || url.search || url.hash)
      return null;
    const match = /^\/join\/([a-zA-Z0-9]{6,10})\/?$/.exec(url.pathname);
    return match ? inviteCodeSchema.parse(match[1]) : null;
  } catch {
    return null;
  }
}
