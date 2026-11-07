import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { projectItineraryContinuations, activityAnchorId } from '@/lib/itineraryContinuations';
import TripContextOverview from '@/components/trips/detail/TripContextOverview';
import { ItineraryDayCard, ItineraryDayNav } from '@/components/trips/detail/itinerary';
import type { Activity, Checklist, ItineraryDay, Trip } from '@/types';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ymd = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const baseTrip: Trip = {
  id: 'trip-1',
  name: 'Kyoto',
  description: '',
  start_date: ymd(10),
  end_date: ymd(14),
  destination_location: null,
  hash_code: 'abc123',
  created_at: '2026-06-01T00:00:00.000Z',
  archived_at: null,
  budget: null,
  legacy_budget: null,
  currency_settings: null,
};

const activity = (overrides: Partial<Activity> = {}): Activity => ({
  revision: 1,
  id: 'act-1',
  time: '23:59',
  end_time: null,
  title: 'Dinner',
  type: 'food',
  location: null,
  note: '',
  confirmation_code: '',
  attachments: [],
  ...overrides,
});

const day = (dayNumber: number, activities: Activity[] = []): ItineraryDay => ({
  revision: 1,
  id: `day-${dayNumber}`,
  trip_id: 'trip-1',
  day_number: dayNumber,
  title: `Day title ${dayNumber}`,
  content: '',
  location: null,
  activities,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
});

const overviewProps = {
  days: [] as ItineraryDay[],
  todaySpent: 0,
  isMember: true,
  isAdmin: false,
  onEdit: vi.fn(),
  onAddExpense: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('itinerary first screen', () => {
  it('condenses the pre-trip state into one line', () => {
    const checklists = [{ items: [{ done: true }, { done: true }] }] as unknown as Checklist[];
    render(<TripContextOverview {...overviewProps} trip={baseTrip} checklists={checklists} />);

    expect(screen.getByText('startsIn · checklistDone')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'viewChecklist' }).getAttribute('href')).toBe(
      '/trips/abc123/checklists'
    );
  });

  it('omits checklist status until checklists have loaded', () => {
    render(<TripContextOverview {...overviewProps} trip={baseTrip} />);

    expect(screen.getByText('startsIn')).not.toBeNull();
  });

  it('points ongoing trips at today and the next activity', () => {
    const trip = { ...baseTrip, start_date: ymd(-1), end_date: ymd(2) };
    render(
      <TripContextOverview {...overviewProps} trip={trip} days={[day(1), day(2, [activity()])]} />
    );

    expect(screen.getByText('ongoingDay · nextActivity · todaySpent')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'viewToday' }).getAttribute('href')).toBe(
      '#itinerary-day-2'
    );
  });

  it('says today is done instead of pointing back at a past activity', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 17, 20, 0));
    try {
      const trip = { ...baseTrip, start_date: ymd(-1), end_date: ymd(2) };
      render(
        <TripContextOverview
          {...overviewProps}
          trip={trip}
          days={[day(2, [activity({ time: '09:00', title: 'Breakfast' })])]}
        />
      );

      expect(screen.getByText('ongoingDay · todayActivitiesDone · todaySpent')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('jumps between days from the sticky day switcher', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const days = [day(1), day(2), day(3)];
    render(
      <>
        <ItineraryDayNav
          days={days}
          datesByDayId={new Map(days.map((d) => [d.id, null]))}
          todayDayNumber={2}
        />
        {days.map((d) => (
          <div key={d.id} id={`itinerary-day-${d.day_number}`} />
        ))}
      </>
    );

    expect(screen.getByRole('navigation', { name: 'dayNav' })).not.toBeNull();
    expect(screen.getByText('today')).not.toBeNull();
    const day3 = screen.getByRole('button', { name: /Day 3/ });
    fireEvent.click(day3);

    expect(scrollTo).toHaveBeenCalledOnce();
    scrollTo.mockRestore();
    expect(day3.getAttribute('aria-current')).toBe('location');
  });
});

describe('itinerary day card actions', () => {
  beforeEach(() => {
    // Radix dropdown relies on pointer capture APIs jsdom lacks.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => {};
  });

  const renderCard = (
    isAdmin: boolean,
    importedActivityIds = new Set<string>(),
    cardDay = day(1, [activity({ type: 'flight', title: 'BR 198' })])
  ) => {
    const handlers = {
      onEdit: vi.fn(),
      onAddActivity: vi.fn(),
      onDelete: vi.fn(),
      onEditActivity: vi.fn(),
      onDeleteActivity: vi.fn(),
      onImportActivity: vi.fn(),
    };
    render(
      <ItineraryDayCard
        day={cardDay}
        tripId="trip-1"
        isAdmin={isAdmin}
        importedActivityIds={importedActivityIds}
        photos={[]}
        onSelectPhoto={vi.fn()}
        {...handlers}
      />
    );
    return handlers;
  };

  it.each([
    { time: '22:25', end_time: '00:20', end_day_offset: 1, shown: ['22:25', '00:20 +1'] },
    { time: '09:00', end_time: null, end_day_offset: 0, shown: ['09:00'] },
    { time: null, end_time: '10:00', end_day_offset: 0, shown: ['10:00'] },
    { time: null, end_time: null, end_day_offset: null, shown: [] },
  ])(
    'renders only supplied clocks with no repeated date paragraph: $shown',
    ({ shown, ...fields }) => {
      renderCard(false, new Set(), day(1, [activity({ ...fields, type: 'other' })]));
      const row = document.getElementById(activityAnchorId('day-1', 'act-1'))!;
      const clock = row.querySelector('[data-activity-clock]');
      if (shown.length) expect(clock?.textContent).toBe(shown.join(''));
      else {
        expect(clock).toBeNull();
        expect(row.className).not.toContain('max-content');
      }
      expect(row.textContent).not.toMatch(/unknown|時間未定|Departure|出發|→/);
      expect(row.textContent).not.toContain('nextDay');
    }
  );
  it('keeps day settings beside the heading in a bounded grid instead of a wrapped full row', () => {
    renderCard(true);
    const control = screen.getByRole('button', { name: 'dayActions' });
    expect(control.parentElement?.className).toContain('max-w-36');
    expect(control.parentElement?.parentElement?.className).toContain(
      'grid-cols-[minmax(0,1fr)_auto]'
    );
  });
  it('offers notes and add activity on an empty day without the Markdown placeholder', async () => {
    const user = userEvent.setup();
    const empty = day(1);
    const handlers = renderCard(true, new Set(), empty);
    expect(screen.queryByText('dayContentPlaceholder')).toBeNull();
    expect(screen.getByText('empty')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'addDayNotes' }));
    expect(handlers.onEdit).toHaveBeenCalledWith(empty, 'notes');
    await user.click(screen.getByRole('button', { name: 'add' }));
    expect(handlers.onAddActivity).toHaveBeenCalledWith(empty);
    await user.click(screen.getByRole('button', { name: 'dayActions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'editDay' }));
    expect(handlers.onEdit).toHaveBeenLastCalledWith(empty);
  });

  it('keeps read-only empty days free of editing prompts', () => {
    renderCard(false, new Set(), day(1));
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('dayContentPlaceholder')).toBeNull();
  });

  it('tucks activity edit and remove behind the overflow menu', async () => {
    const user = userEvent.setup();
    const handlers = renderCard(true);

    expect(screen.queryByRole('button', { name: 'edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'remove' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /moreActions · .*23:59.* · BR 198/ }));
    expect(screen.getByRole('menu')).toHaveTextContent('BR 198');
    await user.click(await screen.findByRole('menuitem', { name: 'remove' }));

    expect(handlers.onDeleteActivity).toHaveBeenCalledOnce();
  });

  it('keeps collection import available to non-admin members', async () => {
    const user = userEvent.setup();
    const handlers = renderCard(false);

    expect(screen.queryByRole('button', { name: 'dayActions' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /moreActions/ }));
    expect(screen.queryByRole('menuitem', { name: 'edit' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'importToCollections' }));

    expect(handlers.onImportActivity).toHaveBeenCalledOnce();
  });

  it('shows only the imported badge when nothing else is actionable', () => {
    renderCard(false, new Set(['act-1']));

    expect(screen.queryByRole('button', { name: /moreActions/ })).toBeNull();
    expect(screen.getByText('imported')).not.toBeNull();
  });
});

it('CD3 preserves actual activity counts and focuses the original row from a continuation-only day', () => {
  const source = day(1, [
    activity({ end_day_offset: 1, end_time: '00:20', title: 'Original flight' }),
  ]);
  const target = day(2);
  const hints = projectItineraryContinuations([source, target]);
  const renderDay = (d: ItineraryDay) => (
    <ItineraryDayCard
      key={d.id}
      day={d}
      continuations={hints.get(d.id)}
      tripId="trip-1"
      isAdmin={false}
      importedActivityIds={new Set()}
      photos={[]}
      onSelectPhoto={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onAddActivity={vi.fn()}
      onEditActivity={vi.fn()}
      onDeleteActivity={vi.fn()}
      onImportActivity={vi.fn()}
    />
  );
  render(
    <>
      {renderDay(source)}
      {renderDay(target)}
    </>
  );
  expect(screen.getByText('0')).toBeDefined();
  expect(screen.getByText('1')).toBeDefined();
  expect(screen.getByText('empty')).toBeDefined();
  const original = document.getElementById(activityAnchorId(source.id, source.activities[0].id))!;
  const scroll = vi.fn();
  original.scrollIntoView = scroll;
  fireEvent.click(screen.getByRole('button', { name: /view · source/ }));
  expect(document.activeElement).toBe(original);
  expect(original.className).toContain('focus:ring-2');
  expect(scroll).toHaveBeenCalledOnce();
});
