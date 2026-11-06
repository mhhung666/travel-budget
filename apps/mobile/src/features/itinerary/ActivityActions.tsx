import { router } from 'expo-router';
import { NavigationMenu } from '@/components/NavigationMenu';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { Action } from '@/components/ui';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { activityMessages } from '@/i18n/activityMessages';

/** Role and connectivity come from the reader; rows never mount another query. */
export function ActivityActions({
  tripId,
  dayId,
  activityId,
  canEdit,
  online,
  label,
}: {
  tripId: string;
  dayId: string;
  activityId?: string;
  canEdit: boolean;
  online: boolean;
  label?: string;
}) {
  const locale = useAppLocale(),
    t = useMessages();
  const copy = activityMessages[locale],
    labels = itineraryPresentationMessages[locale];
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
  if (!activityId)
    return (
      <Action
        testID="itinerary-add-activity"
        label={copy.add}
        icon="plus"
        disabled={!online}
        onPress={() => open()}
      />
    );
  return (
    <NavigationMenu
      testID={`itinerary-activity-menu-${activityId}`}
      title={labels.more}
      label={label ?? copy.edit}
      context={label}
      closeLabel={t.closeNavigation}
      iconOnly
      icon="more"
      disabled={!online}
      choices={[
        {
          label: copy.edit,
          testID: `itinerary-edit-activity-${activityId}`,
          onPress: () => open(),
        },
        {
          label: copy.remove,
          testID: `itinerary-delete-activity-${activityId}`,
          destructive: true,
          onPress: () => open(true),
        },
      ]}
    />
  );
}
