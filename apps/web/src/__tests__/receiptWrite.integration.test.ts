// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withLedgerV2 } from '@/lib/ledger';
import {
  beginReceiptWrite,
  commandReceiptWrite,
  receiptWriteStatus,
  expireReceiptWrites,
  RECEIPT_WRITES,
} from '@/lib/receiptWrite';
import { receiptAttachmentId } from '@/lib/receiptRead';
const storage = vi.hoisted(() => ({ head: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/storage', () => ({ headObject: storage.head, presignPut: storage.sign }));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed)) throw new Error('Isolated URI and opt-in required');
describe.skipIf(!uri || !allowed)('G6b receipt transactions', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    trip = new mongo.ObjectId(),
    expense = new mongo.ObjectId();
  const input = (uuid = randomUUID()) => ({
    action: 'add',
    client_request_id: uuid,
    contentType: 'image/jpeg',
    size: 100,
  });
  const begin = (body: unknown, exp = expense, user = actor) =>
    withLedgerV2(() => beginReceiptWrite(db, String(user), String(trip), String(exp), body));
  const command = (uuid: string, action: 'upload' | 'finish' | 'cancel') =>
    withLedgerV2(() =>
      commandReceiptWrite(db, String(actor), String(trip), String(expense), uuid, action)
    );
  const lookup = (uuid: string) =>
    withLedgerV2(() => receiptWriteStatus(db, String(actor), String(trip), String(expense), uuid));
  const row = () => db.collection('expenses').findOne({ _id: expense });
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_receiptwrites_${randomUUID().replaceAll('-', '')}`);
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
    storage.head.mockResolvedValue({ size: 100, contentType: 'image/jpeg' });
    storage.sign.mockResolvedValue('https://receipt.test/put');
    for (const c of ['trips', 'expenses', RECEIPT_WRITES, 'blobcleanupjobs'])
      await db.collection(c).deleteMany({});
    await db
      .collection('trips')
      .insertOne({ _id: trip, baseCurrency: 'USD', members: [{ user: actor, role: 'member' }] });
    await db.collection('expenses').insertOne({
      _id: expense,
      trip,
      baseCurrency: 'USD',
      amount: 12,
      description: 'meal',
      splits: [{ user: actor, shareAmount: 12 }],
      attachments: [],
    });
  });
  it('commits one reference and terminal receipt together; replay keeps original result after removal', async () => {
    const body = input();
    expect((await begin(body)).status).toBe('pending');
    expect(await command(body.client_request_id, 'upload')).toHaveProperty('upload.url');
    expect(storage.sign).toHaveBeenCalledWith('receipts', expect.any(String), 'image/jpeg', {
      immutable: true,
    });
    await Promise.all([
      command(body.client_request_id, 'finish'),
      command(body.client_request_id, 'finish'),
    ]);
    const written = await row();
    expect(written!.attachments).toHaveLength(1);
    expect(written).toMatchObject({ amount: 12, splits: [{ shareAmount: 12 }] });
    const key = written!.attachments[0].key;
    const remove = {
      action: 'remove',
      client_request_id: randomUUID(),
      attachmentId: receiptAttachmentId(key),
    };
    expect((await begin(remove)).status).toBe('committed');
    expect((await row())!.attachments).toEqual([]);
    expect(await db.collection('blobcleanupjobs').countDocuments({ _id: key })).toBe(1);
    expect((await command(body.client_request_id, 'finish')).status).toBe('committed');
    expect((await begin(body)).status).toBe('committed');
    expect((await row())!.attachments).toEqual([]);
  });
  it('binds UUID to frozen input, actor, trip and expense and authorizes every replay', async () => {
    const body = input();
    await begin(body);
    await expect(begin({ ...body, size: 101 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(begin(body, new mongo.ObjectId())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(begin(body, expense, new mongo.ObjectId())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect((await lookup(randomUUID())).status).toBe('not_found');
    await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [] } });
    await expect(lookup(body.client_request_id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(storage.head).not.toHaveBeenCalled();
  });
  it('rejects oversized/unknown inputs and missing resources without storage; enforces ten-file cap at finish', async () => {
    await expect(begin({ ...input(), size: 8388609 })).rejects.toThrow();
    await expect(begin({ ...input(), contentType: 'text/html' })).rejects.toThrow();
    await expect(begin({ ...input(), key: 'foreign' })).rejects.toThrow();
    expect((await begin(input(), new mongo.ObjectId())).status).toBe('rejected');
    const body = input();
    await begin(body);
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $set: {
          attachments: Array.from({ length: 10 }, (_, i) => ({
            key: `receipts/${trip}/${i}.jpg`,
            contentType: 'image/jpeg',
            size: 100,
          })),
        },
      }
    );
    expect(await command(body.client_request_id, 'finish')).toMatchObject({
      status: 'rejected',
      code: 'ATTACHMENT_LIMIT',
    });
    expect((await row())!.attachments).toHaveLength(10);
  });
  it('missing/mismatched storage is retryable and outages never become success', async () => {
    const body = input();
    await begin(body);
    storage.head
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ size: 101, contentType: 'image/jpeg' })
      .mockRejectedValueOnce(new Error('R2 down'));
    await expect(command(body.client_request_id, 'finish')).rejects.toMatchObject({
      code: 'UPLOAD_INCOMPLETE',
    });
    await expect(command(body.client_request_id, 'finish')).rejects.toMatchObject({
      code: 'UPLOAD_INCOMPLETE',
    });
    await expect(command(body.client_request_id, 'finish')).rejects.toThrow('R2 down');
    expect((await lookup(body.client_request_id)).status).toBe('pending');
    expect((await row())!.attachments).toEqual([]);
    expect((await command(body.client_request_id, 'finish')).status).toBe('committed');
  });
  it('rechecks membership and live expense after storage waits', async () => {
    const body = input();
    await begin(body);
    storage.head.mockImplementationOnce(async () => {
      await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [] } });
      return { size: 100, contentType: 'image/jpeg' };
    });
    await expect(command(body.client_request_id, 'finish')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect((await row())!.attachments).toEqual([]);
    await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [{ user: actor }] } });
    storage.head.mockImplementationOnce(async () => {
      await db.collection('expenses').deleteOne({ _id: expense });
      return { size: 100, contentType: 'image/jpeg' };
    });
    expect(await command(body.client_request_id, 'finish')).toMatchObject({
      status: 'rejected',
      code: 'RESOURCE_GONE',
    });
  });
  it('cancels and expires orphan uploads through durable cleanup, even after membership loss', async () => {
    const a = input(),
      b = input();
    await begin(a);
    await begin(b);
    expect((await command(a.client_request_id, 'cancel')).status).toBe('rejected');
    expect((await command(a.client_request_id, 'finish')).status).toBe('rejected');
    await db.collection(RECEIPT_WRITES).updateMany({}, { $set: { expiresAt: new Date(0) } });
    await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [] } });
    expect(await expireReceiptWrites(db)).toBe(1);
    expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(2);
    expect(await expireReceiptWrites(db)).toBe(0);
  });
  it('preserves shared references on remove and cannot resurrect a retired upload', async () => {
    const body = input();
    await begin(body);
    await command(body.client_request_id, 'finish');
    const attached = (await row())!.attachments[0];
    await db
      .collection('expenses')
      .insertOne({ _id: new mongo.ObjectId(), trip, baseCurrency: 'USD', attachments: [attached] });
    await begin({
      action: 'remove',
      client_request_id: randomUUID(),
      attachmentId: receiptAttachmentId(attached.key),
    });
    expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(0);
    expect((await row())!.attachments).toEqual([]);
  });
  it('rolls back attachment and terminal state together on transaction failure', async () => {
    const body = input();
    await begin(body);
    await db.command({
      collMod: RECEIPT_WRITES,
      validator: { 'state.status': { $ne: 'committed' } },
      validationLevel: 'strict',
    });
    try {
      await expect(command(body.client_request_id, 'finish')).rejects.toThrow();
    } finally {
      await db.command({ collMod: RECEIPT_WRITES, validator: {} });
    }
    expect((await row())!.attachments).toEqual([]);
    expect((await lookup(body.client_request_id)).status).toBe('pending');
  });
});
