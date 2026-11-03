import { router } from 'expo-router';
import { Action } from '@/components/ui';
import { useAppLocale } from '@/i18n/useMessages';
import { activityMessages } from '@/i18n/activityMessages';

/** Role and connectivity come from the reader; rows never mount another query. */
export function ActivityActions({
  tripId,
  dayId,
  activityId,
  canEdit,
  online,
}: {
  tripId: string;
  dayId: string;
  activityId?: string;
  canEdit: boolean;
  online: boolean;
}) {
  const copy = activityMessages[useAppLocale()];
  if (!canEdit) return null;
  const open = (remove = false) => {
    if (!online) return;
    router.push({
      pathname: '/trips/[id]/itinerary/activity',
      params: {
        id: tripId,
        dayId,
        ...(activityId ? { activityId } : {}),
        ...(remove ? { remove: 'true' } : {}),
      },
    });
  };
  return (
    <>
      <Action
        testID={activityId ? `itinerary-edit-activity-${activityId}` : 'itinerary-add-activity'}
        variant="secondary"
        label={activityId ? copy.edit : copy.add}
        disabled={!online}
        onPress={() => open()}
      />
      {activityId && (
        <Action
          testID={`itinerary-delete-activity-${activityId}`}
          variant="danger"
          label={copy.remove}
          disabled={!online}
          onPress={() => open(true)}
        />
      )}
    </>
  );
}
