import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { DayActions } from './DayActions';
import { ActivityActions } from './ActivityActions';
const h = vi.hoisted(() => ({ push: vi.fn(), online: true }));
vi.mock('expo-router', () => ({ router: { push: h.push } }));
vi.mock('@/components/NavigationMenu', () => ({ NavigationMenu: 'NavigationMenu' }));
vi.mock('@/components/ui', () => ({ Action: 'Action' }));
vi.mock('@/i18n/useMessages', () => ({
  useAppLocale: () => 'en',
  useMessages: () => ({ closeNavigation: 'Close' }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
type Node = ReactElement<{
  children?: ReactNode;
  testID: string;
  disabled?: boolean;
  destructive: boolean;
  choices?: Node['props'][];
  onPress: () => void;
}>;
function nodes(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const n = node as Node;
  return [
    n,
    ...nodes(n.props.children),
    ...(n.props.choices ?? []).map((props) => ({ type: 'Choice', props }) as unknown as Node),
  ];
}
const tripId = 'a'.repeat(24),
  dayId = 'b'.repeat(24),
  activityId = 'c'.repeat(24);
beforeEach(() => {
  h.push.mockClear();
  h.online = true;
});
it('does not expose day or activity writes to non-admin readers', () => {
  expect(DayActions({ tripId, dayId, canEdit: false })).toBeNull();
  expect(ActivityActions({ tripId, dayId, activityId, canEdit: false, online: true })).toBeNull();
});
it('routes create, update and dangerous delete to the selected day and activity', () => {
  const add = nodes(ActivityActions({ tripId, dayId, canEdit: true, online: true })).find(
    (n) => n.props.testID === 'itinerary-add-activity'
  )!;
  add.props.onPress();
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/itinerary/activity',
    params: { id: tripId, dayId },
  });
  const actions = nodes(
    ActivityActions({ tripId, dayId, activityId, canEdit: true, online: true })
  );
  actions.find((n) => n.props.testID === `itinerary-edit-activity-${activityId}`)!.props.onPress();
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/itinerary/activity',
    params: { id: tripId, dayId, activityId },
  });
  const remove = actions.find((n) => n.props.testID === `itinerary-delete-activity-${activityId}`)!;
  expect(remove.props.destructive).toBe(true);
  remove.props.onPress();
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/itinerary/activity',
    params: { id: tripId, dayId, activityId, remove: 'true' },
  });
});
it('keeps offline controls disabled and their callbacks do not navigate', () => {
  const actions = ActivityActions({
    tripId,
    dayId,
    activityId,
    canEdit: true,
    online: false,
  }) as Node;
  expect(actions.props.disabled).toBe(true);
  for (const choice of actions.props.choices ?? []) choice.onPress();
  expect(h.push).not.toHaveBeenCalled();
});
it('CD2 puts day settings and empty-note entry in the day card while retaining deletion confirmation routes', () => {
  const settings = nodes(DayActions({ tripId, dayId, canEdit: true, mode: 'settings' }));
  expect(settings.find((n) => n.props.testID === 'itinerary-add-day')).toBeUndefined();
  const remove = settings.find((n) => n.props.testID === 'itinerary-delete-day')!;
  expect(remove.props.destructive).toBe(true);
  remove.props.onPress();
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/itinerary/day',
    params: { id: tripId, dayId, remove: 'true' },
  });
  const note = nodes(DayActions({ tripId, dayId, canEdit: true, mode: 'notes' })).find(
    (n) => n.props.testID === 'itinerary-add-notes'
  )!;
  note.props.onPress();
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/itinerary/day',
    params: { id: tripId, dayId },
  });
});
