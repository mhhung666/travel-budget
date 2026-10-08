import { expect, it, vi } from 'vitest';
import {
  tripArchiveInput,
  tripUpdateInput,
  mutationRequestSchema,
  type TripSettings,
} from '@travel-budget/contracts';
import {
  settingsFields,
  settingsChanges,
  prepareTripSettings,
  restoreSettings,
} from './settingsForm';
const tripId = 'a'.repeat(24),
  revision = 'b'.repeat(64);
const context: TripSettings = {
  tripId,
  name: 'Trip',
  description: 'Note',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  destination: {
    name: 'Tokyo',
    display_name: 'Tokyo, Japan',
    lat: 35.68,
    lon: 139.75,
    names: { jp: '東京' },
    country: 'Japan',
    country_code: 'JP',
  },
  role: 'admin',
  archived: false,
  revision,
  archiveRevision: 'c'.repeat(64),
};
it('basic edit omits location and dates; historical metadata is untouched', () => {
  expect(settingsChanges(context, { ...settingsFields(context), name: 'Renamed' })).toEqual({
    name: 'Renamed',
  });
});
it('empty optional dates clear explicitly; no edits do not produce a write', () => {
  expect(settingsChanges(context, { ...settingsFields(context), start: '' })).toEqual({
    start_date: null,
  });
  expect(() => settingsChanges(context, settingsFields(context))).toThrow();
});
it.each(['2026-02-30', '2026-13-01', '2026-01-00'])('date-only %s is invalid', (date) => {
  expect(() => settingsChanges(context, { ...settingsFields(context), start: date })).toThrow();
});
it('an inverted date range must not pass validation', () => {
  expect(() =>
    settingsChanges(context, { ...settingsFields(context), start: '2026-10-04', end: '2026-10-03' })
  ).toThrow();
});
it('name correction retains coordinates/country but not obsolete localized names', () => {
  const changes = settingsChanges(context, {
    ...settingsFields(context),
    destination: 'Tokyo city',
  });
  expect(changes.destination_location).toMatchObject({
    lat: 35.68,
    lon: 139.75,
    country_code: 'JP',
    name: 'Tokyo city',
  });
  expect(changes.destination_location?.names).toBeUndefined();
});
it('changing coordinates drops country metadata belonging to the old place', () => {
  const changes = settingsChanges(context, {
    ...settingsFields(context),
    destination: 'Taipei',
    address: 'Taipei, Taiwan',
    latitude: '25.03',
    longitude: '121.56',
  });
  expect(changes.destination_location).toEqual({
    name: 'Taipei',
    display_name: 'Taipei, Taiwan',
    lat: 25.03,
    lon: 121.56,
  });
});
it.each(['', 'Infinity', '0x10', '90.1'])(
  'invalid latitude %s cannot become a real location',
  (value) => {
    expect(() =>
      settingsChanges(context, { ...settingsFields(context), latitude: value })
    ).toThrow();
  }
);
it('clear destination is explicit and omits unrelated changes', () => {
  expect(
    settingsChanges(context, {
      ...settingsFields(context),
      destination: '',
      address: '',
      latitude: '',
      longitude: '',
    })
  ).toEqual({ destination_location: null });
});
it.each(['revision', 'role'])(
  'fresh %s change retains input and produces no confirmed body',
  async (field) => {
    const current = { ...context, [field]: field === 'revision' ? 'd'.repeat(64) : 'member' };
    const request = vi.fn(async () => current);
    const fields = { ...settingsFields(context), description: 'User edit' };
    const check = vi.fn();
    expect(
      await prepareTripSettings(request as never, 'account', tripId, context, fields, check)
    ).toEqual({ current });
    expect(fields.description).toBe('User edit');
    expect(check).toHaveBeenCalled();
  }
);
it('fresh confirmation carries current revision and only user changes', async () => {
  const request = vi.fn(async () => context);
  expect(
    (
      await prepareTripSettings(
        request as never,
        'account',
        tripId,
        context,
        { ...settingsFields(context), name: 'Updated' },
        () => {}
      )
    ).body
  ).toEqual({ expected_revision: revision, changes: { name: 'Updated' } });
});
it('rebase keeps intended changes and adopts others latest changes', () => {
  const changes = settingsChanges(context, {
    ...settingsFields(context),
    description: 'User edit',
  });
  expect(
    restoreSettings({ ...context, name: 'Web name', endDate: '2026-10-05' }, changes)
  ).toMatchObject({ name: 'Web name', description: 'User edit', end: '2026-10-05' });
});
it('contracts reject private/unknown fields, empty edits and incorrect result shapes', () => {
  const identity = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expected_revision: revision,
  };
  expect(tripUpdateInput.safeParse({ ...identity, changes: { budget: 100 } }).success).toBe(false);
  expect(tripUpdateInput.safeParse({ ...identity, changes: {} }).success).toBe(false);
  expect(tripArchiveInput.safeParse({ ...identity, archived: false }).success).toBe(true);
  expect(
    mutationRequestSchema.safeParse({
      status: 'committed',
      operation: 'trip.archive',
      resourceId: tripId,
      result: { tripId, archived: false },
    }).success
  ).toBe(true);
  expect(
    mutationRequestSchema.safeParse({
      status: 'committed',
      operation: 'trip.create',
      resourceId: tripId,
      result: { tripId, revision },
    }).success
  ).toBe(false);
});

it('historical long names and descriptions remain untouched when another field changes', () => {
  const historical = { ...context, name: 'N'.repeat(120), description: 'D'.repeat(2200) };
  expect(settingsChanges(historical, { ...settingsFields(historical), end: '2026-10-06' })).toEqual(
    { end_date: '2026-10-06' }
  );
});
