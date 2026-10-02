import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationAutocomplete from '@/components/location/LocationAutocomplete';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const place = (name: string) => ({
  display_name: name,
  address: { city: name },
  lat: '35',
  lon: '139',
});
it('distinguishes network failure from no matches, retains the query and retries', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ok: true, json: async () => [place('Tokyo')] });
  vi.stubGlobal('fetch', fetchMock);
  render(<LocationAutocomplete value={null} onChange={vi.fn()} label="Destination" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Destination' }));
  const input = screen.getByPlaceholderText('searchPlaceholder');
  fireEvent.change(input, { target: { value: 'Tokyo' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('searchFailed');
  expect(screen.queryByText('noResults')).toBeNull();
  expect(input).toHaveValue('Tokyo');
  await user.click(screen.getByRole('button', { name: 'retry' }));
  await waitFor(() => expect(screen.getByRole('option')).toHaveTextContent('Tokyo'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not let an older response replace results for the latest query', async () => {
  let resolveOld!: (value: unknown) => void;
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    )
    .mockResolvedValue({ ok: true, json: async () => [place('Osaka')] });
  vi.stubGlobal('fetch', fetchMock);
  render(<LocationAutocomplete value={null} onChange={vi.fn()} label="Destination" />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Destination' }));
  const input = screen.getByPlaceholderText('searchPlaceholder');
  fireEvent.change(input, { target: { value: 'Tokyo' } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'Osaka' } });
  await waitFor(() => expect(screen.getByRole('option')).toHaveTextContent('Osaka'));
  resolveOld({ ok: true, json: async () => [place('Tokyo')] });
  await waitFor(() => expect(input).toHaveValue('Osaka'));
  expect(screen.getByRole('option')).toHaveTextContent('Osaka');
});
