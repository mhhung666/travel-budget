// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('MongoDB index verification write opt-in', () => {
  it.each([
    { MONGODB_INDEX_TEST_URI: '', MONGODB_INDEX_TEST_ALLOW_WRITES: '1' },
    {
      MONGODB_INDEX_TEST_URI: 'mongodb://127.0.0.1:1/never_connect',
      MONGODB_INDEX_TEST_ALLOW_WRITES: '',
    },
  ])('refuses incomplete configuration without falling back to app URI (%j)', (configuration) => {
    try {
      execFileSync(process.execPath, ['scripts/verify-mongodb-indexes.mjs'], {
        env: {
          ...process.env,
          MONGODB_URI: 'mongodb://secret:secret@127.0.0.1:1/app',
          ...configuration,
        },
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 5000,
      });
      throw new Error('Expected refusal');
    } catch (error) {
      expect(error.status).toBe(1);
      expect(error.stderr).toContain('Set MONGODB_INDEX_TEST_URI');
      expect(error.stderr).not.toContain('secret');
    }
  });
});
