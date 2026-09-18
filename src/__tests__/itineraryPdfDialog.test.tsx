import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ItineraryPdfExportDialog from '@/components/export/ItineraryPdfExportDialog';
import type { ItineraryDay } from '@/types';

const mocks = vi.hoisted(() => ({ read: vi.fn(), isMutating: vi.fn(() => 0) }));
vi.mock('@/actions/tripLanding.actions', () => ({ getTripLanding: vi.fn() }));
vi.mock('@/hooks/queries/fetcher', () => ({ fetchWithPublicFallback: mocks.read }));
vi.mock('@/components/providers/QueryProvider', () => ({ useAuthenticatedSession: () => true }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ isMutating: mocks.isMutating }),
  useIsMutating: () => 0,
}));

const day: ItineraryDay = {
  id: '1',
  trip_id: 'trip',
  revision: 0,
  day_number: 1,
  title: 'Saved day',
  content: '',
  location: null,
  activities: [
    {
      id: 'a',
      revision: 0,
      title: 'Saved activity',
      time: null,
      end_time: null,
      type: 'other',
      location: null,
      note: '',
      confirmation_code: 'PRIVATE',
      attachments: [],
    },
  ],
  created_at: '',
  updated_at: '',
};
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: { blob: Blob } }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  complete() {
    this.onmessage?.({ data: { blob: new Blob(['pdf'], { type: 'application/pdf' }) } });
  }
}
function mount(member = true) {
  return render(
    <ItineraryPdfExportDialog tripId="trip" days={[day]} isMember={member} onClose={vi.fn()} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  URL.createObjectURL = vi.fn(() => 'blob:pdf');
  URL.revokeObjectURL = vi.fn();
  mocks.isMutating.mockReturnValue(0);
  mocks.read.mockResolvedValue({
    trip: { name: 'Saved trip', start_date: null, end_date: null },
    shell: { role: 'member' },
    itinerary: [day],
  });
});

describe('PDF export dialog', () => {
  it('reads fresh data once, defaults to no codes, provides a real download and releases its URL', async () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    expect(mocks.read).toHaveBeenCalledTimes(1);
    const worker = FakeWorker.instances[0];
    expect(JSON.stringify(worker.postMessage.mock.calls)).not.toContain('PRIVATE');
    await act(async () => worker.complete());
    expect(screen.getByRole('link', { name: 'download' })).toHaveAttribute(
      'download',
      'Saved_trip-itinerary.pdf'
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalled();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf');
  });
  it('keeps a public snapshot private even when a formerly-member user selected codes', async () => {
    mocks.read.mockResolvedValue({
      trip: { name: 'Trip', start_date: null, end_date: null },
      shell: { role: null },
      itinerary: [day],
    });
    mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'includeConfirmation' }));
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    expect(JSON.stringify(FakeWorker.instances[0].postMessage.mock.calls)).not.toContain('PRIVATE');
  });
  it('does not offer codes to public viewers and rejects an empty selection', () => {
    mount(false);
    expect(screen.queryByRole('checkbox', { name: 'includeConfirmation' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'allDays' }));
    expect(screen.getByRole('button', { name: 'generate' })).toBeDisabled();
  });
  it('retains options and allows retry after a read failure without using cached days', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Forbidden'));
    mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'includeNotes' }));
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('failed');
    expect(FakeWorker.instances).toHaveLength(0);
    expect(screen.getByRole('checkbox', { name: 'includeNotes' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
  });
  it('terminates active rendering and ignores late completion on unmount', async () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    view.unmount();
    expect(worker.terminate).toHaveBeenCalled();
    await act(async () => worker.complete());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('blocks new exports while saving or offline', async () => {
    mount();
    mocks.isMutating.mockReturnValue(1);
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    expect(screen.getByRole('alert')).toHaveTextContent('saving');
    mocks.isMutating.mockReturnValue(0);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
