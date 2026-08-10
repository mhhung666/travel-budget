import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getAiUsageSummary: vi.fn(),
}));

vi.mock('@/actions', () => ({
  getAiUsageSummary: mocks.getAiUsageSummary,
}));

import { AiUsageCard } from '@/components/settings/AiUsageCard';

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AiUsageCard />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AiUsageCard', () => {
  it('shows the authenticated user daily usage as an accessible progress bar', async () => {
    mocks.getAiUsageSummary.mockResolvedValue({
      success: true,
      data: {
        used_requests: 3,
        request_limit: 5,
        remaining_requests: 2,
        resets_at: '2026-09-11T00:00:00.000Z',
      },
    });

    renderCard();

    const progress = await screen.findByRole('progressbar', { name: 'progressLabel' });
    expect(progress).toHaveAttribute('aria-valuenow', '3');
    expect(progress).toHaveAttribute('aria-valuemax', '5');
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
  });

  it('allows the user to retry after the usage lookup fails', async () => {
    const user = userEvent.setup();
    mocks.getAiUsageSummary
      .mockResolvedValueOnce({ success: false, error: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce({
        success: true,
        data: {
          used_requests: 0,
          request_limit: 5,
          remaining_requests: 5,
          resets_at: '2026-09-11T00:00:00.000Z',
        },
      });

    renderCard();

    await user.click(await screen.findByRole('button', { name: 'retry' }));
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(mocks.getAiUsageSummary).toHaveBeenCalledTimes(2);
  });
});
