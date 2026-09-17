import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FlightRecordDialog } from '@/components/collections/FlightRecordDialog';
import type { FlightRecordItem } from '@/types';

const { createFlight, updateFlight } = vi.hoisted(() => ({
  createFlight: { isPending: false, mutateAsync: vi.fn() },
  updateFlight: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock('@/hooks/queries', () => ({
  useAirlines: () => ({ data: [] }),
  useCollectionMutations: () => ({ createFlight, updateFlight }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));
// 目錄型下拉換成原生輸入，測試只關心起訖相同的判斷。
vi.mock('@/components/collections/AirportCombobox', () => ({
  AirportCombobox: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  ),
}));
vi.mock('@/components/collections/AirlineCombobox', () => ({
  AirlineCombobox: () => null,
}));
vi.mock('@/components/collections/RecordFormFields', () => ({
  DatePrecisionInput: () => null,
  LockedTripField: () => null,
  TripLinkSelect: () => null,
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

const legacyFlight: FlightRecordItem = {
  id: 'f1',
  trip_id: null,
  source_activity_id: null,
  date: '2024-05-01',
  date_precision: 'day',
  airline: 'BR',
  flight_no: 'BR182',
  from_airport: 'TPE',
  to_airport: 'TPE',
  cabin: null,
  note: '',
  created_at: '2024-05-01T00:00:00.000Z',
};

const saveButton = () => screen.getByRole('button', { name: 'common.save' });
const toInput = () => screen.getByLabelText('flights.toPlaceholder');

describe('FlightRecordDialog same departure and arrival airport', () => {
  it('allows closing an invalid existing record without saving', async () => {
    const onOpenChange = vi.fn();
    render(<FlightRecordDialog open onOpenChange={onOpenChange} editing={legacyFlight} />);

    await waitFor(() => expect(saveButton()).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(updateFlight.mutateAsync).not.toHaveBeenCalled();
    expect(createFlight.mutateAsync).not.toHaveBeenCalled();
  });

  it('warns and disables save as soon as both airports match', async () => {
    render(
      <FlightRecordDialog
        open
        onOpenChange={vi.fn()}
        editing={null}
        defaults={{ airline: 'BR', from_airport: 'TPE', to_airport: 'HND' }}
      />
    );

    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(toInput(), { target: { value: 'TPE' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/^flights\.sameAirport$/);
    expect(saveButton()).toBeDisabled();
  });

  it('shows the same warning for a one-click import parsed as TPE-TPE', async () => {
    render(
      <FlightRecordDialog
        open
        onOpenChange={vi.fn()}
        editing={null}
        defaults={{ airline: 'BR', from_airport: 'TPE', to_airport: 'TPE' }}
        lockedTrip={{ id: 'trip1', name: 'Tokyo' }}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/^flights\.sameAirport$/)
    );
    expect(saveButton()).toBeDisabled();
  });

  it('requires fixing an existing same-airport record before saving', async () => {
    const onOpenChange = vi.fn();
    updateFlight.mutateAsync.mockResolvedValue({ ...legacyFlight, to_airport: 'HND' });
    render(<FlightRecordDialog open onOpenChange={onOpenChange} editing={legacyFlight} />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('flights.sameAirportExisting')
    );
    expect(saveButton()).toBeDisabled();

    // 儲存鈕在表單外（footer 以 form 屬性連結），直接送出表單確認 handler 也會擋下
    fireEvent.submit(document.getElementById('flight-record-form')!);
    expect(updateFlight.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(toInput(), { target: { value: 'HND' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(updateFlight.mutateAsync).toHaveBeenCalledWith({
        id: 'f1',
        input: expect.objectContaining({ from_airport: 'TPE', to_airport: 'HND' }),
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
