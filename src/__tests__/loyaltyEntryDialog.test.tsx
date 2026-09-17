import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { LoyaltyEntryDialog } from '@/components/collections/LoyaltyEntryDialog';

const { createEntry, updateEntry } = vi.hoisted(() => ({
  createEntry: { isPending: false, mutateAsync: vi.fn() },
  updateEntry: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock('@/hooks/queries', () => ({
  useLoyaltyMutations: () => ({ createEntry, updateEntry }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LoyaltyEntryDialog', () => {
  it('帶入積分制航空會籍的積分與獎勵里數', async () => {
    render(
      <LoyaltyEntryDialog
        open
        onOpenChange={vi.fn()}
        program="CX"
        editing={null}
        defaults={{ status_points: 25, award_miles: 2500 }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'loyalty.statusPoints' })).toHaveValue(25);
      expect(screen.getByRole('spinbutton', { name: 'loyalty.awardMiles' })).toHaveValue(2500);
      expect(screen.getByLabelText('common.date')).toBeRequired();
      expect(screen.getByRole('combobox', { name: 'loyalty.entryType' })).toBeInTheDocument();
    });
  });

  it('帶入哩程制航空會籍的卡籍哩程與獎勵里數', async () => {
    render(
      <LoyaltyEntryDialog
        open
        onOpenChange={vi.fn()}
        program="BR"
        editing={null}
        defaults={{ qualifying_miles: 1200, award_miles: 1800 }}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'loyalty.qualifyingMiles' })).toHaveValue(1200);
      expect(screen.getByRole('spinbutton', { name: 'loyalty.awardMiles' })).toHaveValue(1800);
    });
  });
});
