// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withLedgerV2 } from '@/lib/ledger';
import { receiptList, receiptView, receiptAttachmentId } from '@/lib/receiptRead';
const storage = vi.hoisted(() => ({ head: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  headObject: storage.head,
  presignGet: storage.sign,
  GET_TTL_SECONDS: 300,
}));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed)) throw new Error('Isolated URI and opt-in required');
describe.skipIf(!uri || !allowed)('G6a private receipt reads', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    stranger = new mongo.ObjectId(),
    trip = new mongo.ObjectId(),
    expense = new mongo.ObjectId();
  const key = `receipts/${trip}/${randomUUID()}.png`;
  const id = receiptAttachmentId(key);
  const attached = { key, contentType: 'image/png', size: 123 };
  const list = (user = actor, exp = expense) =>
    withLedgerV2(() => receiptList(db, String(user), String(trip), String(exp)));
  const view = (attachment = id) =>
    withLedgerV2(() => receiptView(db, String(actor), String(trip), String(expense), attachment));
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_receipts_${randomUUID().replaceAll('-', '')}`);
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
  });
  afterAll(async () => {
    if (owned) await db.dropDatabase();
    await client?.close();
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    storage.head.mockResolvedValue({ contentType: 'image/png', size: 123 });
    storage.sign.mockResolvedValue('https://receipts.example.test/object?signature=private');
    await db.collection('trips').deleteMany({});
    await db.collection('expenses').deleteMany({});
    await db.collection('trips').insertOne({
      _id: trip,
      baseCurrency: 'USD',
      members: [{ user: actor, role: 'member', budget: { total: 999, baseCurrency: 'USD' } }],
    });
    await db.collection('expenses').insertOne({
      _id: expense,
      trip,
      baseCurrency: 'USD',
      attachments: [attached],
      description: 'secret description',
      tags: ['secret'],
    });
  });
  it('returns whitelisted attached metadata, supports empty lists, and never signs for listing', async () => {
    expect(await list()).toEqual({
      ledger: { baseCurrency: 'USD', moneyScale: 2 },
      items: [{ id, contentType: 'image/png', size: 123 }],
    });
    expect(storage.head).not.toHaveBeenCalled();
    expect(storage.sign).not.toHaveBeenCalled();
    await db.collection('expenses').updateOne({ _id: expense }, { $unset: { attachments: '' } });
    expect((await list()).items).toEqual([]);
  });
  it('rejects nonmembers, foreign expenses and unattached keys before contacting storage', async () => {
    await expect(list(stranger)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(list(actor, new mongo.ObjectId())).rejects.toMatchObject({
      code: 'EXPENSE_NOT_FOUND',
    });
    await expect(view('f'.repeat(64))).rejects.toMatchObject({ code: 'ATTACHMENT_UNAVAILABLE' });
    await expect(view('../x')).rejects.toMatchObject({ code: 'ATTACHMENT_UNAVAILABLE' });
    expect(storage.head).not.toHaveBeenCalled();
    expect(storage.sign).not.toHaveBeenCalled();
  });
  it('reuses the private signer, no-store and five-minute expiry without returning internal keys', async () => {
    const start = Date.now();
    const result = await view();
    expect(result).toMatchObject({
      id,
      size: 123,
      contentType: 'image/png',
      ledger: { baseCurrency: 'USD' },
    });
    expect(result.expiresAt).toBeGreaterThanOrEqual(start + 300_000);
    expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
    expect(result).not.toHaveProperty('key');
    expect(storage.sign).toHaveBeenCalledWith('receipts', key, { noStore: true });
  });
  it('distinguishes missing objects and metadata mismatch from an outage', async () => {
    storage.head.mockResolvedValueOnce(null);
    await expect(view()).rejects.toMatchObject({ code: 'ATTACHMENT_UNAVAILABLE' });
    storage.head.mockResolvedValueOnce({ contentType: 'text/html', size: 123 });
    await expect(view()).rejects.toMatchObject({ code: 'ATTACHMENT_UNAVAILABLE' });
    storage.head.mockRejectedValueOnce(new Error('storage down'));
    await expect(view()).rejects.toThrow('storage down');
    expect(storage.sign).not.toHaveBeenCalled();
  });
  it('refuses to publish a signed link if membership changes while storage waits', async () => {
    storage.sign.mockImplementationOnce(async () => {
      await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [] } });
      return 'https://receipts.example.test/object?signature=private';
    });
    await expect(view()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('refuses a detached receipt or deleted expense after signing', async () => {
    storage.sign.mockImplementationOnce(async () => {
      await db.collection('expenses').updateOne({ _id: expense }, { $set: { attachments: [] } });
      return 'https://receipts.example.test/object';
    });
    await expect(view()).rejects.toMatchObject({ code: 'ATTACHMENT_UNAVAILABLE' });
    await db
      .collection('expenses')
      .updateOne({ _id: expense }, { $set: { attachments: [attached] } });
    storage.sign.mockImplementationOnce(async () => {
      await db.collection('expenses').deleteOne({ _id: expense });
      return 'https://receipts.example.test/object';
    });
    await expect(view()).rejects.toMatchObject({ code: 'EXPENSE_NOT_FOUND' });
  });
  it('rejects invalid/foreign keys, unsupported MIME and oversized data', async () => {
    for (const attachment of [
      { ...attached, key: `receipts/${stranger}/${randomUUID()}.png` },
      { ...attached, contentType: 'image/svg+xml' },
      { ...attached, size: 9 * 1024 * 1024 },
    ]) {
      await db
        .collection('expenses')
        .updateOne({ _id: expense }, { $set: { attachments: [attachment] } });
      await expect(list()).rejects.toMatchObject({ code: 'ATTACHMENT_DATA_INVALID' });
    }
    expect(storage.sign).not.toHaveBeenCalled();
  });
});
