import { router } from 'expo-router';
import { Action } from '@/components/ui';
import { useAppLocale } from '@/i18n/useMessages';
import { itineraryMessages } from '@/i18n/itineraryMessages';
import { useOnline } from '@/providers/useOnline';

export function DayActions({
  tripId,
  dayId,
  canEdit,
}: {
  tripId: string;
  dayId?: string;
  canEdit: boolean;
}) {
  const online = useOnline();
  const copy = itineraryMessages[useAppLocale()];
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
  return (
    <>
      <Action
        testID="itinerary-add-day"
        variant="secondary"
        label={copy.add}
        disabled={!online}
        onPress={() => open('add')}
      />
      {dayId && (
        <>
          <Action
            testID="itinerary-edit-day"
            variant="secondary"
            label={copy.edit}
            disabled={!online}
            onPress={() => open('edit')}
          />
          <Action
            testID="itinerary-delete-day"
            variant="danger"
            label={copy.remove}
            disabled={!online}
            onPress={() => open('remove')}
          />
        </>
      )}
    </>
  );
}
