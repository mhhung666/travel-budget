import { afterEach, describe, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItineraryImportDialog from '@/components/ai-import/ItineraryImportDialog';
import { expectNoSeriousAxeViolations } from '@/test/axe';

vi.mock('@/actions/itineraryImport.actions', () => ({
  confirmItineraryImport: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AI itinerary import accessibility', () => {
  it('keeps both source and editable preview states axe-clean', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          draft: {
            sourceSummary: 'Five-day sample',
            days: [
              {
                date: '2026-09-01',
                title: 'Day 1',
                activities: [{ time: '09:00', title: 'Museum', type: 'sightseeing' }],
              },
            ],
            warnings: [],
          },
        }),
      })
    );

    render(
      <ItineraryImportDialog
        open
        onClose={vi.fn()}
        tripId="trip-1"
        tripStartDate="2026-09-01"
        tripEndDate="2026-09-05"
      />
    );

    await expectNoSeriousAxeViolations(document.body);
    await user.type(screen.getByLabelText('sourceLabel'), 'Day 1 Museum');
    await user.click(screen.getByRole('button', { name: 'parse' }));
    await screen.findByTestId('ai-import-preview');
    await expectNoSeriousAxeViolations(document.body);
  }, 15_000);
});
