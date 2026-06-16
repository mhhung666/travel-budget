import { describe, it, expect } from 'vitest';
import {
  generateHashCode,
  isValidHashCode,
  generateUniqueHashCode,
  generateTestHashCode,
} from '@/lib/hashcode';

describe('generateHashCode', () => {
  it('should generate code with default length of 8', () => {
    const code = generateHashCode();
    expect(code).toHaveLength(8);
  });

  it('should generate code with custom length', () => {
    const code = generateHashCode(8);
    expect(code).toHaveLength(8);
  });

  it('should only contain lowercase letters and digits', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateHashCode();
      expect(code).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('should generate different codes on each call', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateHashCode());
    }
    // With 36^6 possible codes, collisions are extremely unlikely
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('isValidHashCode', () => {
  it('should accept valid 6-char code', () => {
    expect(isValidHashCode('a7x9k2')).toBe(true);
  });

  it('should accept valid 8-char code', () => {
    expect(isValidHashCode('a7x9k2b3')).toBe(true);
  });

  it('should accept valid 7-char code', () => {
    expect(isValidHashCode('abc1234')).toBe(true);
  });

  it('should reject too short codes (< 6)', () => {
    expect(isValidHashCode('abc12')).toBe(false);
  });

  it('should accept valid 9 and 10-char codes', () => {
    expect(isValidHashCode('abc123456')).toBe(true);
    expect(isValidHashCode('abc1234567')).toBe(true);
  });

  it('should reject too long codes (> 10)', () => {
    expect(isValidHashCode('abc12345678')).toBe(false); // 11
  });

  it('should reject 12-char codes (would collide with ObjectId detection)', () => {
    expect(isValidHashCode('abcdef123456')).toBe(false);
  });

  it('should reject uppercase letters', () => {
    expect(isValidHashCode('ABC123')).toBe(false);
  });

  it('should reject special characters', () => {
    expect(isValidHashCode('abc-12')).toBe(false);
    expect(isValidHashCode('abc_12')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidHashCode('')).toBe(false);
  });
});

describe('generateUniqueHashCode', () => {
  it('should return first code when no conflicts', async () => {
    const code = await generateUniqueHashCode(async () => false);
    expect(code).toHaveLength(8);
    expect(isValidHashCode(code)).toBe(true);
  });

  it('should retry on conflicts', async () => {
    let attempts = 0;
    const code = await generateUniqueHashCode(async () => {
      attempts++;
      return attempts < 3; // First 2 attempts conflict
    });
    expect(code).toHaveLength(8);
    expect(attempts).toBe(3);
  });

  it('should try longer codes after max attempts with short codes', async () => {
    let attempts = 0;
    const code = await generateUniqueHashCode(async () => {
      attempts++;
      return attempts <= 10; // All 8-char attempts fail
    });
    expect(code).toHaveLength(10); // Falls back to 10-char
    expect(attempts).toBe(11);
  });

  it('should throw after all attempts exhausted', async () => {
    await expect(
      generateUniqueHashCode(async () => true, 5) // Always conflicts
    ).rejects.toThrow('Unable to generate unique hash code');
  });
});

describe('generateTestHashCode', () => {
  it('should generate consistent codes for same seed', () => {
    const code1 = generateTestHashCode('test-seed');
    const code2 = generateTestHashCode('test-seed');
    expect(code1).toBe(code2);
  });

  it('should generate different codes for different seeds', () => {
    const code1 = generateTestHashCode('seed-a');
    const code2 = generateTestHashCode('seed-b');
    expect(code1).not.toBe(code2);
  });

  it('should generate valid 6-char codes', () => {
    const code = generateTestHashCode('any-seed');
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[a-z0-9]+$/);
  });
});
