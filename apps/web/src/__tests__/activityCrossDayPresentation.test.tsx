import { useState } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';
import cn from '@/i18n/messages/zh-CN.json';
import jp from '@/i18n/messages/jp.json';
import { activityTimingText } from '@/lib/activityTiming';
import { dayActivitiesToDrafts, draftsToPayload, makeEmptyActivity } from '@/lib/activityDraft';
import { exportItinerary } from '@/lib/exporters/itinerary';
import { buildItineraryPdfModel } from '@/lib/exporters/itineraryPdfModel';
import ActivityFormDialog from '@/components/trips/detail/itinerary/ActivityFormDialog';
import ActivityTimeFields from '@/components/trips/detail/itinerary/ActivityTimeFields';
import type { Activity, ItineraryDay } from '@/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof en.itinerary.timing) => en.itinerary.timing[key] ?? key,
}));
vi.mock('@/components/location/LocationAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({ TicketUploader: () => null }));
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);
const activity: Activity = {
  id: 'a'.repeat(24),
  revision: 2,
  title: 'Flight',
  type: 'flight',
  time: '22:25',
  end_time: '00:20',
  end_day_offset: 1,
  location: null,
  location_name: '',
  note: '',
  confirmation_code: '',
  attachments: [],
};
const day: ItineraryDay = {
  id: 'b'.repeat(24),
  trip_id: 'c'.repeat(24),
  revision: 1,
  day_number: 2,
  title: 'Travel',
  content: '',
  location: null,
  activities: [activity],
  created_at: '',
  updated_at: '',
};

it.each([en, zh, cn, jp])(
  'formats explicit dates consistently with translated relation words',
  (messages) => {
    const text = activityTimingText(activity, 2, '2028-02-29', messages.itinerary.timing);
    expect(text.end).toBe(`${messages.itinerary.timing.nextDay} 00:20`);
    expect(text.summary).toContain('2028-02-29 22:25');
    expect(text.summary).toContain('2028-03-01 00:20');
    expect(text.summary).toContain(messages.itinerary.timing.arrival);
    expect(text.warning).toBe(false);
  }
);
it.each([null, undefined])('does not infer an unknown legacy end date %s', (offset) => {
  const text = activityTimingText(
    { ...activity, end_day_offset: offset },
    2,
    '2028-02-29',
    en.itinerary.timing
  );
  expect(text.summary).toContain('End date unconfirmed');
  expect(text.summary).not.toContain('2028-03-01');
  expect(text.warning).toBe(true);
});
it('preserves signed dates, undated Day N and explicit same-day earlier clocks', () => {
  expect(
    activityTimingText({ ...activity, end_day_offset: -1 }, 2, '2028-02-29', en.itinerary.timing)
      .summary
  ).toContain('2028-02-28');
  expect(
    activityTimingText({ ...activity, end_day_offset: 3 }, 4, null, en.itinerary.timing).summary
  ).toContain('Day 7');
  const same = activityTimingText(
    { ...activity, end_day_offset: 0 },
    2,
    '2028-02-29',
    en.itinerary.timing
  );
  expect(same.warning).toBe(false);
  expect(same.summary).toContain('2028-02-29 00:20');
  expect(
    activityTimingText(
      { ...activity, time: null, end_time: null },
      2,
      '2028-02-29',
      en.itinerary.timing
    ).summary
  ).not.toContain('00:00');
});
it('uses zero only for new drafts; old edits remain unknown and signed values round-trip', () => {
  expect(makeEmptyActivity().endDayOffset).toBe(0);
  for (const offset of [undefined, null, 0, 1, -1, 3]) {
    const [draft] = dayActivitiesToDrafts([{ ...activity, end_day_offset: offset }]);
    expect(draftsToPayload([draft])[0].end_day_offset).toBe(offset ?? null);
  }
});
function Editor({
  date = '2028-02-29',
  offset = null,
  supported = true,
}: {
  date?: string | null;
  offset?: number | null;
  supported?: boolean;
}) {
  const [value, setValue] = useState({
    ...makeEmptyActivity(),
    title: 'Flight',
    type: 'flight' as const,
    time: '22:25',
    endTime: '00:20',
    endDayOffset: offset,
  });
  const [valid, setValid] = useState(true);
  return (
    <>
      <ActivityTimeFields
        value={value}
        onChange={(fields) => setValue((v) => ({ ...v, ...fields }))}
        date={date}
        dayNumber={4}
        supported={supported}
        onValidityChange={setValid}
      />
      <button disabled={!valid}>Save</button>
      <output>{JSON.stringify(value.endDayOffset)}</output>
    </>
  );
}
async function chooseEnd(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Ends on' }));
  await user.click(await screen.findByRole('option', { name: label }));
}
it('requires adopting the next-day suggestion; other dates support negative offsets and reject invalid/oversized input', async () => {
  render(<Editor />);
  expect(screen.getByRole('combobox')).toHaveTextContent(en.itinerary.timing.unconfirmed);
  expect(screen.getByRole('combobox').tagName).toBe('BUTTON');
  expect(screen.getByRole('combobox')).toHaveClass('min-h-11', 'border-input');
  expect(screen.getByText(/Departure 2028-02-29/)).toHaveTextContent('End date unconfirmed');
  fireEvent.click(screen.getByRole('button', { name: en.itinerary.timing.suggestNextDay }));
  expect(screen.getByRole('combobox')).toHaveTextContent(en.itinerary.timing.nextDay);
  expect(screen.getByText(/Departure 2028-02-29/)).toHaveTextContent('2028-03-01');
  await chooseEnd(en.itinerary.timing.otherDate);
  const input = screen.getByLabelText('End date');
  fireEvent.change(input, { target: { value: '2028-02-28' } });
  expect(screen.getByRole('status')).toHaveTextContent('-1');
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '2040-01-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent(en.itinerary.timing.invalidDate);
  await chooseEnd(en.itinerary.timing.sameDay);
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent('0');
});
it('supports relative negative days without inventing a date, and disables new controls without capability', async () => {
  const ui = render(<Editor date={null} offset={3} />);
  expect(screen.getByLabelText('End day number')).toHaveValue(7);
  fireEvent.change(screen.getByLabelText('End day number'), { target: { value: '2' } });
  expect(screen.getByRole('status')).toHaveTextContent('-2');
  expect(screen.getByText(/Departure Day 4/)).toHaveTextContent('Arrival Day 2');
  ui.rerender(<Editor date={null} supported={false} />);
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByLabelText('End day number')).toBeDisabled();
  expect(screen.getByText(en.itinerary.timing.unsupported)).toBeInTheDocument();
});
it('CSV, Markdown and PDF export one source activity with the same explicit or unknown calendar summary', () => {
  const labels = {
    heading: 'Itinerary',
    day: (n: number) => `Day ${n}`,
    columns: { day: 'Day', title: 'Title', content: 'Content' },
    timing: en.itinerary.timing,
    startDate: '2028-02-28',
    activityColumn: 'Activity',
    startColumn: 'Start date',
    endColumn: 'End date',
  };
  const pdfLabels = {
    timing: labels.timing,
    day: 'Day {n}',
    generated: 'Generated',
    range: 'Range',
    outsideRange: 'Outside',
    end: 'End',
    confirmation: 'Code',
    imageOmitted: 'Omitted',
    types: {} as Record<Activity['type'], string>,
  };
  for (const offset of [1, 3, -1, null]) {
    const source = { ...day, activities: [{ ...activity, end_day_offset: offset }] };
    const summary = activityTimingText(
      source.activities[0],
      2,
      '2028-02-29',
      labels.timing
    ).summary;
    const csv = exportItinerary([source], 'csv', labels).content;
    const md = exportItinerary([source], 'markdown', labels).content;
    const pdf = buildItineraryPdfModel(
      { name: 'Trip', start_date: '2028-02-28', end_date: null },
      [source],
      { dayIds: [day.id], includeNotes: false, includeConfirmation: false },
      false,
      'en',
      pdfLabels
    );
    for (const part of summary.split(' → ')) {
      expect(csv).toContain(part);
      expect(md).toContain(part);
    }
    expect(pdf.days[0].activities).toHaveLength(1);
    expect(pdf.days[0].activities[0].time).toBe(summary);
    expect(csv.match(/Flight/g)).toHaveLength(1);
  }
});

it('blocks an invalid end date, submits the chosen offset, and retains the draft when saving fails', async () => {
  const submit = vi.fn().mockRejectedValue(new Error('CONFLICT'));
  const close = vi.fn();
  render(
    <ActivityFormDialog
      open
      onClose={close}
      onSubmit={submit}
      tripId={day.trip_id}
      dayNumber={2}
      date="2028-02-29"
      activity={activity}
    />
  );
  await chooseEnd(en.itinerary.timing.otherDate);
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2028-02-28' } });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ end_day_offset: -1, id: activity.id })
    )
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'save' })).toBeEnabled());
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('End date')).toHaveValue('2028-02-28');
});

it.each([undefined, null, 0])(
  'treats a start-only activity as a point without inventing an unknown end (%s)',
  (offset) => {
    const text = activityTimingText(
      { ...activity, end_time: null, end_day_offset: offset },
      2,
      '2028-02-29',
      en.itinerary.timing
    );
    expect(text.compactStart).toBe('22:25');
    expect(text.compactEnd).toBeNull();
    expect(text.summary).toBe('2028-02-29 22:25');
    expect(text.summary).not.toMatch(/→|Time not set|unconfirmed/);
  }
);
it.each([1, 3, -1])(
  'shows compact signed day offsets without losing the full date in confirmations (%s)',
  (offset) => {
    const text = activityTimingText(
      { ...activity, end_day_offset: offset },
      2,
      '2028-02-29',
      en.itinerary.timing
    );
    expect(text.compactEnd).toBe(`00:20 ${offset > 0 ? '+' : ''}${offset}`);
    expect(text.summary).toContain(en.itinerary.timing.arrival);
  }
);

it('blocks refreshed calendar bases until acknowledged, then keeps displayed and submitted dates aligned', async () => {
  const submit = vi.fn().mockRejectedValue(new Error('CONFLICT'));
  const props = {
    open: true,
    onClose: vi.fn(),
    onSubmit: submit,
    tripId: day.trip_id,
    dayNumber: 2,
    activity,
  };
  const ui = render(<ActivityFormDialog {...props} date="2027-01-12" />);
  await chooseEnd(en.itinerary.timing.otherDate);
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-01-13' } });
  ui.rerender(<ActivityFormDialog {...props} date="2027-01-14" />);
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('End date')).toHaveValue('2027-01-13');
  expect(screen.getByText(/Departure/)).toHaveTextContent('Arrival 2027-01-13');
  fireEvent.click(screen.getByRole('button', { name: 'confirmDates' }));
  // Confirmation retains the relative day choice and resets only the timing control.
  await chooseEnd(en.itinerary.timing.otherDate);
  expect(screen.getByLabelText('End date')).toHaveValue('2027-01-15');
  expect(screen.getByText(/Departure/)).toHaveTextContent('Arrival 2027-01-15');
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ end_day_offset: 1, title: activity.title })
    )
  );
});
it('keeps invalid custom input blocked through a date refresh and requires it to be corrected', async () => {
  const props = { open: true, onClose: vi.fn(), onSubmit: vi.fn(), tripId: day.trip_id, activity };
  const ui = render(<ActivityFormDialog {...props} date="2027-01-12" />);
  await chooseEnd(en.itinerary.timing.otherDate);
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '' } });
  ui.rerender(<ActivityFormDialog {...props} date={null} />);
  expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'confirmDates' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-01-14' } });
  fireEvent.click(screen.getByRole('button', { name: 'confirmDates' }));
  expect(screen.getByLabelText('End day number')).toHaveValue(3);
  expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
});
