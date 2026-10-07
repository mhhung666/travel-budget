import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalMailbox } from './local-mailbox.mjs';
import { Resend } from 'resend';

test('installed Resend SDK delivers only to the configured local sink', async () => {
  const mailbox = await createLocalMailbox();
  const previous = process.env.RESEND_BASE_URL;
  try {
    process.env.RESEND_BASE_URL = mailbox.url;
    const client = new Resend(mailbox.token);
    const result = await client.emails.send({
      from: 'acceptance@example.test',
      to: 'test@example.test',
      subject: 'Reset',
      text: '000007',
    });
    assert.equal(result.error, null);
    assert.ok(result.data.id);
    const saved = await (
      await fetch(mailbox.url + '/messages', {
        headers: { authorization: `Bearer ${mailbox.token}` },
      })
    ).json();
    assert.equal(saved.messages[0].text, '000007');
  } finally {
    if (previous === undefined) delete process.env.RESEND_BASE_URL;
    else process.env.RESEND_BASE_URL = previous;
    await mailbox.close();
  }
});

test('loopback mail sink requires its token, accepts Resend mail, and clears secrets', async () => {
  const mailbox = await createLocalMailbox();
  try {
    assert.match(mailbox.url, /^http:\/\/127\.0\.0\.1:/);
    assert.equal((await fetch(mailbox.url + '/messages')).status, 401);
    const headers = {
      authorization: `Bearer ${mailbox.token}`,
      'content-type': 'application/json',
    };
    const send = await fetch(mailbox.url + '/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: 'test@example.test', subject: 'Reset', text: '000007' }),
    });
    assert.equal(send.status, 200);
    const { id } = await send.json();
    const stored = await (await fetch(mailbox.url + '/messages', { headers })).json();
    assert.equal(stored.messages[0].id, id);
    assert.equal(stored.messages[0].text, '000007');
    assert.equal(
      (await fetch(mailbox.url + '/messages', { method: 'DELETE', headers })).status,
      200
    );
    assert.deepEqual(
      (await (await fetch(mailbox.url + '/messages', { headers })).json()).messages,
      []
    );
    assert.equal(
      (await fetch(mailbox.url + '/emails', { method: 'POST', headers, body: '{}' })).status,
      400
    );
    const batch = await fetch(mailbox.url + '/emails/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify([{ to: 'test@example.test', subject: 'Batch' }]),
    });
    assert.equal((await batch.json()).data.length, 1);
  } finally {
    await mailbox.close();
  }
});
