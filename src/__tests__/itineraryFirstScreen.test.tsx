import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  const renderCard = (isAdmin: boolean, importedActivityIds = new Set<string>()) => {
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
        day={day(1, [activity({ type: 'flight', title: 'BR 198' })])}
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

  it('tucks activity edit and remove behind the overflow menu', async () => {
    const user = userEvent.setup();
    const handlers = renderCard(true);

    expect(screen.queryByRole('button', { name: 'edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'remove' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'moreActions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'remove' }));

    expect(handlers.onDeleteActivity).toHaveBeenCalledOnce();
  });

  it('keeps collection import available to non-admin members', async () => {
    const user = userEvent.setup();
    const handlers = renderCard(false);

    expect(screen.queryByRole('button', { name: 'dayActions' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'moreActions' }));
    expect(screen.queryByRole('menuitem', { name: 'edit' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'importToCollections' }));

    expect(handlers.onImportActivity).toHaveBeenCalledOnce();
  });

  it('shows only the imported badge when nothing else is actionable', () => {
    renderCard(false, new Set(['act-1']));

    expect(screen.queryByRole('button', { name: 'moreActions' })).toBeNull();
    expect(screen.getByText('imported')).not.toBeNull();
  });
});
