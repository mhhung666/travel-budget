import { describe, expect, it } from 'vitest';
import { tripFieldsSchema, tripCreateInput, tripJoinInput } from '@travel-budget/contracts';
import { parseInvitation } from './input';
const api = 'https://test.example/api/v1';
describe('E1 invitation boundary', () => {
  it.each([
    ' ABC123 ',
    'abc1234567',
    'https://test.example/join/ABC123',
    'https://test.example/join/abc123/',
  ])('accepts %s', (value) =>
    expect(parseInvitation(value, api)).toBe(
      value.trim().toLowerCase().includes('abc1234567') ? 'abc1234567' : 'abc123'
    )
  );
  it.each([
    '507f191e810c19729de860ea',
    'https://evil.example/join/abc123',
    'https://test.example.evil/join/abc123',
    'http://test.example/join/abc123',
    'https://user:pass@test.example/join/abc123',
    'https://test.example/link-virtual/abc123/name',
    'https://test.example/join/abc123?x=1',
    'https://test.example/join/abc123#x',
    '/join/abc123',
    'https://test.example/join/%61bc123',
    'https://test.example/album/share/abc123',
    'abc12',
    'abc12345678',
  ])('refuses %s', (value) => expect(parseInvitation(value, api)).toBeNull());
});
describe('E1 shared input', () => {
  it.each([
    [null, null],
    [null, '2026-01-01'],
    ['2026-01-01', null],
    ['2024-02-29', '2025-01-01'],
  ])('accepts optional/real ordered dates %s %s', (start_date, end_date) =>
    expect(tripFieldsSchema.safeParse({ name: ' Trip ', start_date, end_date }).success).toBe(true)
  );
  it.each([
    { name: '   ' },
    { name: 'x'.repeat(101) },
    { name: 'Trip', description: 'x'.repeat(2001) },
    { name: 'Trip', start_date: '2025-02-29' },
    { name: 'Trip', start_date: '2026-01-02', end_date: '2026-01-01' },
    { name: 'Trip', destination: 'Tokyo' },
  ])('rejects invalid fields', (fields) =>
    expect(tripFieldsSchema.safeParse(fields).success).toBe(false)
  );
  it('normalizes UUID and code, rejects unknown input', () => {
    const key = 'AAAA1111-1111-4111-8111-111111111111';
    expect(tripJoinInput.parse({ client_request_id: key, invite_code: ' ABC123 ' })).toEqual({
      client_request_id: key.toLowerCase(),
      invite_code: 'abc123',
    });
    expect(
      tripCreateInput.safeParse({ client_request_id: key, name: 'Trip', destination_location: {} })
        .success
    ).toBe(false);
  });
});

it('a separately configured environment Web origin permits only its canonical join links', () => {
  expect(parseInvitation('https://web.example/join/abc123', api, 'https://web.example')).toBe(
    'abc123'
  );
  expect(
    parseInvitation('https://test.example/join/abc123', api, 'https://web.example')
  ).toBeNull();
  expect(
    parseInvitation('https://web.example/join/abc123', api, 'https://web.example/path')
  ).toBeNull();
});
