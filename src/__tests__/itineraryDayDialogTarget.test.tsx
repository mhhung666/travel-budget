import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ItineraryDayDialog from '@/components/trips/detail/itinerary/ItineraryDayDialog';
import { ActionQueryError } from '@/lib/actionQuery';

vi.mock('@/components/location/LocationAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/trips/detail/itinerary/MarkdownRenderer', () => ({ default: () => null }));

afterEach(cleanup);

// next-intl 在測試裡回傳 key 本身，所以斷言看的是 key 與欄位狀態，不是文案。
function open(
  props: Partial<React.ComponentProps<typeof ItineraryDayDialog>> = {},
  onSubmit = vi.fn().mockResolvedValue(undefined)
) {
  render(
    <ItineraryDayDialog
      mode="add"
      open
      onClose={vi.fn()}
      onSubmit={onSubmit}
      tripStartDate="2026-09-01"
      tripEndDate="2026-09-05"
      usedDayNumbers={[1, 3]}
      onViewExistingDay={vi.fn()}
      {...props}
    />
  );
  return { onSubmit, date: () => screen.getByLabelText('dateLabel') as HTMLInputElement };
}

const submit = () => screen.getByRole('button', { name: 'submit' });

it('defaults to the earliest date with no day and bounds the picker to the trip', () => {
  const { date } = open();
  expect(date().value).toBe('2026-09-02');
  expect(date().min).toBe('2026-09-01');
  expect(date().max).toBe('2026-09-05');
});

it('sends the chosen date with the baseline the form was opened on', async () => {
  const { onSubmit, date } = open();
  fireEvent.change(date(), { target: { value: '2026-09-04' } });
  fireEvent.change(screen.getByLabelText('dayTitle'), { target: { value: 'Kyoto' } });
  fireEvent.click(submit());
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Kyoto',
      content: '',
      location: null,
      target: {
        date: '2026-09-04',
        expected_start_date: '2026-09-01',
        expected_end_date: '2026-09-05',
      },
    })
  );
});

it('blocks a date that already has a day and offers a way to view it', () => {
  const { onSubmit, date } = open();
  fireEvent.change(screen.getByLabelText('dayTitle'), { target: { value: 'Dup' } });
  fireEvent.change(date(), { target: { value: '2026-09-03' } });
  expect(screen.getByRole('alert')).toHaveTextContent('errors.dayExists');
  expect(submit()).toBeDisabled();
  expect(date()).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('button', { name: 'viewExistingDay' })).toBeInTheDocument();
  fireEvent.click(submit());
  expect(onSubmit).not.toHaveBeenCalled();
});

it('keeps the draft and shows the server error in the date field when the date is taken', async () => {
  const onSubmit = vi.fn().mockRejectedValue(new ActionQueryError('x', 'DAY_ALREADY_EXISTS'));
  const onClose = vi.fn();
  const { date } = open({ usedDayNumbers: [], onClose }, onSubmit);
  fireEvent.change(screen.getByLabelText('dayTitle'), { target: { value: 'Kyoto' } });
  fireEvent.click(submit());
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('errors.dayExists'));
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText('dayTitle') as HTMLInputElement).value).toBe('Kyoto');
  // 改選日期即清掉錯誤，使用者不必重打草稿。
  fireEvent.change(date(), { target: { value: '2026-09-04' } });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('falls back to a day-number field when the trip has no start date', async () => {
  const { onSubmit } = open({ tripStartDate: null, tripEndDate: null, usedDayNumbers: [1, 2] });
  const dayNumber = screen.getByLabelText('dayNumberLabel') as HTMLInputElement;
  expect(screen.queryByLabelText('dateLabel')).toBeNull();
  expect(dayNumber.value).toBe('3');
  fireEvent.change(screen.getByLabelText('dayTitle'), { target: { value: 'Somewhere' } });
  fireEvent.click(submit());
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { day_number: 3, expected_start_date: null, expected_end_date: null },
      })
    )
  );
});

it('marks quick picks that already have a day and keeps their state readable without colour', () => {
  open();
  const used = screen.getAllByRole('button', { name: 'quickPickUsedA11y' });
  expect(used).toHaveLength(2); // Day 1 與 Day 3 已建立
  expect(used[0]).toHaveTextContent('quickPickUsed');
  const selected = screen.getAllByRole('button', { name: 'quickPickA11y' });
  expect(selected.some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true);
});

it('does not offer a date field when editing an existing day', () => {
  render(
    <ItineraryDayDialog
      mode="edit"
      open
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      day={
        {
          id: 'd1',
          day_number: 2,
          revision: 0,
          title: 'Existing',
          content: '',
          location: null,
          activities: [],
        } as never
      }
      dayNumber={2}
      date="2026-09-02"
      tripStartDate="2026-09-01"
      tripEndDate="2026-09-05"
    />
  );
  expect(screen.queryByLabelText('dateLabel')).toBeNull();
});
