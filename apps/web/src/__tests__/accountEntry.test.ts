import { describe, expect, it, vi } from 'vitest';
import {
  registerInput,
  newPasswordSchema,
  loginInput,
  passwordResetInput,
  passwordBytes,
} from '@travel-budget/contracts';
import { registerAccount, trustedAccountSource } from '@/lib/accountEntry';
import { mongo } from 'mongoose';

describe('E2 shared account validation', () => {
  it.each(['a'.repeat(72), '中'.repeat(24), '😀'.repeat(18), ' 密碼123 '])(
    'accepts UTF-8 boundary and preserves spaces',
    (password) => {
      expect(newPasswordSchema.parse(password)).toBe(password);
      expect(passwordBytes(password)).toBe(Buffer.byteLength(password));
    }
  );
  it.each(['a'.repeat(73), '中'.repeat(25), '😀'.repeat(19), 'short'])(
    'rejects invalid new passwords',
    (password) => expect(newPasswordSchema.safeParse(password).success).toBe(false)
  );
  it('existing login still accepts passwords beyond 72 bytes', () =>
    expect(loginInput.safeParse({ username: 'tester', password: '中'.repeat(40) }).success).toBe(
      true
    ));
  it('normalizes account fields and keeps the code string including leading zeros', () => {
    expect(
      registerInput.parse({
        username: '  Abc  ',
        display_name: ' Person ',
        email: ' TEST@EXAMPLE.COM ',
        password: '123456',
      })
    ).toEqual({
      username: 'Abc',
      display_name: 'Person',
      email: 'test@example.com',
      password: '123456',
    });
    expect(
      passwordResetInput.parse({
        email: 'TEST@EXAMPLE.COM',
        code: '000007',
        new_password: '123456',
      }).code
    ).toBe('000007');
  });
  it.each([
    { username: '  ' },
    { display_name: '  ' },
    { username: 'x'.repeat(201) },
    { display_name: 'x'.repeat(101) },
    { confirmation: '123456' },
  ])('rejects invalid account input', (fields) => {
    expect(
      registerInput.safeParse({
        username: 'tester',
        display_name: 'Name',
        email: 'a@example.com',
        password: '123456',
        ...fields,
      }).success
    ).toBe(false);
  });
  it('only accepts a single validated ingress IP on Vercel', () => {
    expect(
      trustedAccountSource(new Headers({ 'x-forwarded-for': '192.0.2.1' }), false)
    ).toBeUndefined();
    expect(trustedAccountSource(new Headers({ 'x-forwarded-for': '192.0.2.1' }), true)).toBe(
      '192.0.2.1'
    );
    for (const value of ['192.0.2.1, 192.0.2.2', 'fake', ''])
      expect(trustedAccountSource(new Headers({ 'x-forwarded-for': value }), true)).toBeUndefined();
    expect(trustedAccountSource(new Headers({ 'x-forwarded-for': '2001:db8::1' }), true)).toBe(
      '[2001:db8::1]'
    );
  });
  it.each(['username', 'email', 'unrelated'])(
    'classifies a late insert collision on %s',
    async (field) => {
      const insert = vi.fn().mockRejectedValue({ code: 11000, keyPattern: { [field]: 1 } });
      const db = {
        collection: (name: string) =>
          name === 'users'
            ? { findOne: async () => null, insertOne: insert }
            : {
                findOneAndUpdate: async (_filter: unknown, pipeline: mongo.Document[]) => ({
                  grant: pipeline[2].$set.grant.$cond[1],
                }),
              },
      } as unknown as mongo.Db;
      await expect(
        registerAccount(
          db,
          {
            username: 'tester',
            display_name: 'Name',
            email: 'test@example.com',
            password: '123456',
          },
          { secret: 'test' }
        )
      ).rejects.toMatchObject({ code: field === 'unrelated' ? 11000 : 'ACCOUNT_CONFLICT' });
    }
  );
});
