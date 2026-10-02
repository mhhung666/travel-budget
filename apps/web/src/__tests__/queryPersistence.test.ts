import { QueryClient } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { describe, expect, it, vi } from 'vitest';
import { clearQueryState } from '@/components/providers/QueryProvider';
import { getQueryPersistKey } from '@/lib/queryPersister';

describe('query persistence isolation', () => {
  it('uses a different IndexedDB key for every authenticated user and guest', () => {
    expect(getQueryPersistKey('guest')).not.toBe(getQueryPersistKey('user:abc'));
    expect(getQueryPersistKey('user:abc')).not.toBe(getQueryPersistKey('user:def'));
    expect(getQueryPersistKey('user:abc')).toContain('user%3Aabc');
  });

  it('clears queries, queued mutations and persisted state on logout', async () => {
    const client = new QueryClient();
    client.setQueryData(['trips'], [{ id: 'private-trip' }]);
    client.getMutationCache().build(client, {
      mutationKey: ['expenses', 'create'],
      mutationFn: vi.fn(),
    });
    const removeClient = vi.fn().mockResolvedValue(undefined);
    const persister = { removeClient } as unknown as Persister;

    await clearQueryState(client, persister);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(removeClient).toHaveBeenCalledOnce();
  });
});
