import { router } from 'expo-router';
import { NavigationMenu } from '@/components/NavigationMenu';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { Action } from '@/components/ui';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { itineraryMessages } from '@/i18n/itineraryMessages';
import { useOnline } from '@/providers/useOnline';

export function DayActions({
  tripId,
  dayId,
  canEdit,
  mode = 'all',
}: {
  tripId: string;
  dayId?: string;
  canEdit: boolean;
  mode?: 'add' | 'settings' | 'notes' | 'all';
}) {
  const online = useOnline();
  const locale = useAppLocale(),
    t = useMessages();
  const copy = itineraryMessages[locale],
    labels = itineraryPresentationMessages[locale];
  if (!canEdit) return null;
  const open = (mode: 'add' | 'edit' | 'remove') => {
    if (!online) return;
    router.push({
      pathname: '/trips/[id]/itinerary/day',
      params: {
        id: tripId,
        ...(mode !== 'add' ? { dayId } : {}),
        ...(mode === 'remove' ? { remove: 'true' } : {}),
      },
    });
  };
  if (mode === 'notes')
    return dayId ? (
      <Action
        testID="itinerary-add-notes"
        variant="ghost"
        label={labels.addNotes}
        disabled={!online}
        onPress={() => open('edit')}
      />
    ) : null;
  return (
    <>
      {(mode === 'add' || mode === 'all') && (
        <Action
          testID="itinerary-add-day"
          variant="secondary"
          label={copy.add}
          disabled={!online}
          onPress={() => open('add')}
        />
      )}
      {dayId && mode !== 'add' && (
        <NavigationMenu
          testID="itinerary-day-settings"
          title={labels.daySettings}
          label={labels.daySettings}
          closeLabel={t.closeNavigation}
          disabled={!online}
          choices={[
            { label: labels.editDay, testID: 'itinerary-edit-day', onPress: () => open('edit') },
            {
              label: labels.deleteDay,
              testID: 'itinerary-delete-day',
              destructive: true,
              onPress: () => open('remove'),
            },
          ]}
        />
      )}
    </>
  );
}
