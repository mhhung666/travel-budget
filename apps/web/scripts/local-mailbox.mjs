import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';

/** Resend-compatible, authenticated loopback sink; never forwards or logs mail. */
export async function createLocalMailbox() {
  const token = randomBytes(32).toString('hex');
  const messages = [];
  const server = createServer(async (request, response) => {
    const reply = (status, value) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (request.headers.authorization !== `Bearer ${token}`)
      return reply(401, { error: 'Unauthorized' });
    if (request.url === '/messages' && request.method === 'GET') return reply(200, { messages });
    if (request.url === '/messages' && request.method === 'DELETE') {
      messages.length = 0;
      return reply(200, { cleared: true });
    }
    if (request.method !== 'POST' || !['/emails', '/emails/batch'].includes(request.url))
      return reply(404, { error: 'Not found' });
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1024 * 1024) return reply(413, { error: 'Too large' });
      }
      const input = JSON.parse(body);
      const batch = request.url === '/emails/batch' ? input : [input];
      if (
        !Array.isArray(batch) ||
        !batch.length ||
        batch.length > 100 ||
        batch.some((mail) => !mail || !mail.to || typeof mail.subject !== 'string')
      )
        return reply(400, { error: 'Invalid mail' });
      const saved = batch.map((mail) => ({ ...mail, id: randomUUID() }));
      messages.push(...saved);
      if (messages.length > 100) messages.splice(0, messages.length - 100);
      return reply(
        200,
        request.url === '/emails/batch'
          ? { data: saved.map(({ id }) => ({ id })) }
          : { id: saved[0].id }
      );
    } catch {
      return reply(400, { error: 'Invalid mail' });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      messages.length = 0;
    },
  };
}
