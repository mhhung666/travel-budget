import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItineraryImportDialog from '@/components/ai-import/ItineraryImportDialog';

const mocks = vi.hoisted(() => ({ confirmItineraryImport: vi.fn() }));

vi.mock('@/actions/itineraryImport.actions', () => ({
  confirmItineraryImport: mocks.confirmItineraryImport,
}));

function successfulResponse(title: string, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      draft: {
        sourceSummary: 'summary',
        days: [
          {
            date: '2026-09-10',
            title: 'Day title',
            activities: [
              {
                title,
                type: 'sightseeing',
                confirmationCode: 'SECRET-123',
                ...overrides,
              },
            ],
          },
        ],
        warnings: [],
      },
    }),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ItineraryImportDialog', { timeout: 15_000 }, () => {
  it('keeps failed source text editable and focuses it when opened', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, error: { code: 'RATE_LIMITED' } }),
      })
    );

    render(<ItineraryImportDialog open onClose={vi.fn()} tripId="trip-1" />);
    const source = screen.getByLabelText('sourceLabel');
    await waitFor(() => expect(source).toHaveFocus());
    await user.type(source, 'Day 1 Tokyo');
    await user.click(screen.getByRole('button', { name: 'parse' }));

    expect(await screen.findByText('errors.RATE_LIMITED')).toBeInTheDocument();
    expect(source).toHaveValue('Day 1 Tokyo');
  });

  it('masks confirmation codes and enables review after fixing a blocking time', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    mocks.confirmItineraryImport.mockResolvedValue({
      success: true,
      data: {
        operationId: 'operation-id',
        days: [{ date: '2026-09-10', status: 'success', addedActivities: 1 }],
        summary: {
          successfulDays: 1,
          addedActivities: 1,
          alreadyImportedDays: 0,
          failedDays: 0,
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(successfulResponse('Airport train', { time: '14:00', endTime: '13:00' }))
    );

    render(
      <ItineraryImportDialog
        open
        onClose={vi.fn()}
        tripId="trip-1"
        tripStartDate="2026-09-01"
        tripEndDate="2026-09-30"
        onImported={onImported}
      />
    );
    await user.type(screen.getByLabelText('sourceLabel'), 'Day 1 Tokyo');
    await user.click(screen.getByRole('button', { name: 'parse' }));

    const confirm = await screen.findByRole('button', { name: 'confirmImport' });
    expect(confirm).toBeDisabled();
    const code = screen.getByLabelText('confirmationCode');
    expect(code).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'showCode' }));
    expect(code).toHaveAttribute('type', 'text');

    const endTime = screen.getByLabelText('endTime');
    await user.clear(endTime);
    await user.type(endTime, '15:00');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(screen.getByText('resultSuccessTitle')).toBeInTheDocument();
  });

  it('replaces the previous draft completely when parsing again', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(successfulResponse('First activity'))
      .mockResolvedValueOnce(successfulResponse('Second activity'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ItineraryImportDialog open onClose={vi.fn()} tripId="trip-1" />);
    await user.type(screen.getByLabelText('sourceLabel'), 'Original source');
    await user.click(screen.getByRole('button', { name: 'parse' }));
    expect(await screen.findByDisplayValue('First activity')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'backToSource' }));
    await user.clear(screen.getByLabelText('sourceLabel'));
    await user.type(screen.getByLabelText('sourceLabel'), 'Replacement source');
    await user.click(screen.getByRole('button', { name: 'parse' }));

    expect(await screen.findByDisplayValue('Second activity')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('First activity')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/ai/itinerary-import',
      expect.objectContaining({
        body: JSON.stringify({ tripId: 'trip-1', sourceText: 'Replacement source' }),
      })
    );
  });

  it('keeps only failed dates for retry and reuses the operation id', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          draft: {
            sourceSummary: 'summary',
            days: [
              {
                date: '2026-09-10',
                title: 'First day',
                activities: [{ title: 'Imported activity', type: 'sightseeing' }],
              },
              {
                date: '2026-09-11',
                title: 'Second day',
                activities: [{ title: 'Retry activity', type: 'food' }],
              },
            ],
            warnings: [],
          },
        }),
      })
    );
    mocks.confirmItineraryImport
      .mockResolvedValueOnce({
        success: true,
        data: {
          operationId: 'operation-id',
          days: [
            { date: '2026-09-10', status: 'success', addedActivities: 1 },
            {
              date: '2026-09-11',
              status: 'failed',
              addedActivities: 0,
              errorCode: 'INTERNAL_ERROR',
            },
          ],
          summary: {
            successfulDays: 1,
            addedActivities: 1,
            alreadyImportedDays: 0,
            failedDays: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          operationId: 'operation-id',
          days: [{ date: '2026-09-11', status: 'success', addedActivities: 1 }],
          summary: {
            successfulDays: 1,
            addedActivities: 1,
            alreadyImportedDays: 0,
            failedDays: 0,
          },
        },
      });

    render(
      <ItineraryImportDialog
        open
        onClose={vi.fn()}
        tripId="trip-1"
        tripStartDate="2026-09-01"
        tripEndDate="2026-09-30"
      />
    );
    await user.type(screen.getByLabelText('sourceLabel'), 'Two days');
    await user.click(screen.getByRole('button', { name: 'parse' }));
    await user.click(await screen.findByRole('button', { name: 'confirmImport' }));

    expect(await screen.findByText('resultPartialTitle')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByDisplayValue('Imported activity')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('Retry activity')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'retryFailed' }));
    await waitFor(() => expect(mocks.confirmItineraryImport).toHaveBeenCalledTimes(2));

    const firstInput = mocks.confirmItineraryImport.mock.calls[0][1];
    const retryInput = mocks.confirmItineraryImport.mock.calls[1][1];
    expect(retryInput.operationId).toBe(firstInput.operationId);
    expect(retryInput.draft.days).toHaveLength(1);
    expect(retryInput.draft.days[0].date).toBe('2026-09-11');
  });
});
