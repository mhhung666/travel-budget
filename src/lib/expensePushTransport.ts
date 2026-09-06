import https from 'node:https';
import type { IncomingMessage, ClientRequest } from 'node:http';
import webpush from 'web-push';
import type { PushPayload } from './webpush';

export interface ExpensePushTransportInput {
  /** Already authorized by prepare; this transport does not query membership or ownership. */
  subscription: webpush.PushSubscription;
  payload: PushPayload;
  vapidDetails: NonNullable<webpush.RequestOptions['vapidDetails']>;
  timeoutMs?: number;
}

/**
 * Dormant server-side single-device transport. No DB, env lookup, retry or subscription cleanup.
 * Uses web-push encryption/signing with a wall-clock HTTP deadline, not a socket idle timeout.
 * accepted means provider acceptance only; an aborted/failed request may still have been accepted.
 */
export async function sendExpensePushDevice({
  subscription,
  payload,
  vapidDetails,
  timeoutMs = 5_000,
}: ExpensePushTransportInput): Promise<'accepted' | 'expired' | 'failed'> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000)
    throw new Error('Invalid push transport timeout');

  try {
    const details = webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
      vapidDetails,
    });
    const endpoint = new URL(details.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return 'failed';

    return await new Promise((resolve) => {
      let request: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      let settled = false;
      const finish = (status: 'accepted' | 'expired' | 'failed') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Destroy, not just Promise.race: stop local network work before handing control back.
        response?.destroy();
        request?.destroy();
        resolve(status);
      };
      const timer = setTimeout(() => finish('failed'), timeoutMs);
      try {
        request = https.request(
          endpoint,
          { method: details.method, headers: details.headers, agent: false },
          (incoming) => {
            response = incoming;
            incoming.on('error', () => finish('failed'));
            incoming.on('aborted', () => finish('failed'));
            incoming.on('end', () => {
              const code = incoming.statusCode;
              finish(
                code !== undefined && code >= 200 && code <= 299
                  ? 'accepted'
                  : code === 404 || code === 410
                    ? 'expired'
                    : 'failed'
              );
            });
            incoming.on('close', () => {
              if (!incoming.complete) finish('failed');
            });
            if (settled) incoming.destroy();
            else incoming.resume(); // Discard provider bodies; never log endpoints, keys or content.
          }
        );
        request.on('error', () => finish('failed'));
        request.end(details.body);
      } catch {
        finish('failed');
      }
    });
  } catch {
    // Invalid crypto/configuration and transport errors are non-terminal, with no sensitive logs.
    return 'failed';
  }
}
