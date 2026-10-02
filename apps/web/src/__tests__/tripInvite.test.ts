import { describe, expect, it } from 'vitest';
import { buildVirtualMemberInvitePath, parseTripInviteInput } from '@/lib/tripInvite';

describe('parseTripInviteInput', () => {
  it('accepts a bare invitation code', () => {
    expect(parseTripInviteInput(' a7x9k2 ')).toBe('a7x9k2');
  });

  it('accepts complete and relative invitation URLs', () => {
    expect(parseTripInviteInput('https://budget.example/join/a7x9k2?from=share')).toBe('a7x9k2');
    expect(parseTripInviteInput('/join/ABC123/')).toBe('abc123');
  });

  it('rejects unrelated paths and invalid codes', () => {
    expect(parseTripInviteInput('https://budget.example/trips/a7x9k2')).toBeNull();
    expect(parseTripInviteInput('not a code')).toBeNull();
    expect(parseTripInviteInput('abc')).toBeNull();
  });
});

describe('buildVirtualMemberInvitePath', () => {
  it('uses the public trip hash code instead of a database trip id', () => {
    expect(buildVirtualMemberInvitePath({ hash_code: 'a7x9k2' }, 'virtual_member')).toBe(
      '/link-virtual/a7x9k2/virtual_member'
    );
  });

  it('escapes path segments', () => {
    expect(buildVirtualMemberInvitePath({ hash_code: 'abc/123' }, 'member name')).toBe(
      '/link-virtual/abc%2F123/member%20name'
    );
  });
});
