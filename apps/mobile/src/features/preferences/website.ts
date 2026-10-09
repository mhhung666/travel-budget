import { validateBaseUrl } from '@/api/client';
/** Public environment homepage only; no session, account, trip, or return URL is attached. */
export function websiteUrl(api: string | undefined, web: string | undefined, development: boolean) {
  try {
    const base = validateBaseUrl(api, development);
    if (!web) return new URL(base).origin + '/';
    const url = new URL(web);
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
    validateBaseUrl(url.origin, development);
    return url.origin + '/';
  } catch {
    return null;
  }
}
