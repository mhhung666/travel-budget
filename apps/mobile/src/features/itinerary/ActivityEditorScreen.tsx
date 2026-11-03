import { itineraryActivityInput } from '@travel-budget/contracts';
import { Action, Copy, DetailRow, Section, TextField } from '@/components/ui';
import { NavigationMenu } from '@/components/NavigationMenu';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { activityMessages, activityRejection } from '@/i18n/activityMessages';
import {
  ItineraryEditorScreen,
  type EditorTarget,
  type EditorDefinition,
} from './ItineraryEditorScreen';
import {
  activityFields,
  prepareActivity,
  restoreActivityFields,
  sameActivitySnapshot,
  type ActivityFields,
  type ActivityCommand,
} from './activityForm';
import { activityType, dayLabel } from './presentation';
const definition: EditorDefinition<ActivityFields, ActivityCommand> = {
  messages: activityMessages,
  rejection: (code, locale) => activityRejection(code, activityMessages[locale]),
  testId: 'itinerary-activity',
  editing: (t) => !!t.activityId,
  exists: (c, t) =>
    c.days.some(
      (d) => d.id === t.dayId && (!t.activityId || d.activities.some((a) => a.id === t.activityId))
    ),
  fields: (c, t) =>
    activityFields(
      c.days.find((d) => d.id === t.dayId)?.activities.find((a) => a.id === t.activityId)
    ),
  prepare: (c, f, t) => prepareActivity(c, f, t.dayId!, t.activityId, t.remove),
  restore: (c, command) => restoreActivityFields(command, c),
  accepts: (c, t): c is ActivityCommand =>
    c.operation.startsWith('activity.') &&
    'dayId' in c &&
    c.dayId === t.dayId &&
    ('activityId' in c ? c.activityId === t.activityId : !t.activityId) &&
    (c.operation === 'activity.delete') === !!t.remove,
  same: (a, b, t) => sameActivitySnapshot(a, b, t.dayId!, t.activityId),
  Fields: ActivityFieldsForm,
  renderLatest: (context, target) => <ActivityDetails context={context} target={target} />,
  renderReview: (context, target) =>
    target.remove ? <ActivityDeletion context={context} target={target} /> : null,
};
export function ActivityEditorScreen(props: EditorTarget & { dayId: string }) {
  return <ItineraryEditorScreen {...props} definition={definition} />;
}
function ActivityFieldsForm({
  fields,
  context,
  target,
  frozen,
  change,
  clearPlace,
}: Parameters<typeof definition.Fields>[0]) {
  const locale = useAppLocale(),
    copy = activityMessages[locale],
    t = useMessages();
  const day = context.days.find((d) => d.id === target.dayId);
  const disabled = frozen || !!target.remove;
  return (
    <>
      <DetailRow
        label={t.itineraryChooseDay}
        value={day ? `${dayLabel(day.dayNumber, t)} · ${day.title}` : copy.missing}
      />
      <TextField
        label={copy.title}
        value={fields.title}
        maxLength={1000}
        editable={!disabled}
        onChangeText={(v) => change('title', v)}
      />
      {!target.remove && (
        <>
          {frozen ? (
            <DetailRow
              label={copy.type}
              value={activityType(itineraryActivityInput.shape.type.parse(fields.type), t)}
            />
          ) : (
            <NavigationMenu
              title={copy.type}
              label={activityType(itineraryActivityInput.shape.type.parse(fields.type), t)}
              closeLabel={t.closeNavigation}
              testID="itinerary-activity-type"
              choices={itineraryActivityInput.shape.type.options.map((type) => ({
                label: activityType(type, t),
                selected: fields.type === type,
                testID: `itinerary-type-${type}`,
                onPress: () => change('type', type),
              }))}
            />
          )}
          <Copy>{copy.timeHint}</Copy>
          {(['time', 'endTime'] as const).map((key) => (
            <TextField
              key={key}
              label={copy[key]}
              value={fields[key]}
              editable={!frozen}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              onChangeText={(v) => change(key, v)}
            />
          ))}
          <TextField
            label={copy.locationName}
            value={fields.locationName}
            maxLength={300}
            editable={!frozen}
            onChangeText={(v) => change('locationName', v)}
          />
          <Section title={copy.place}>
            <Copy>{copy.coordinates}</Copy>
            {(['place', 'address', 'latitude', 'longitude'] as const).map((key) => (
              <TextField
                key={key}
                label={copy[key]}
                value={fields[key]}
                editable={!frozen}
                keyboardType={
                  key === 'latitude' || key === 'longitude' ? 'numbers-and-punctuation' : 'default'
                }
                onChangeText={(v) => change(key, v)}
              />
            ))}
            <Action
              variant="ghost"
              label={copy.clearPlace}
              disabled={frozen}
              onPress={clearPlace}
            />
          </Section>
          <TextField
            label={copy.content}
            value={fields.note}
            multiline
            maxLength={50000}
            editable={!frozen}
            onChangeText={(v) => change('note', v)}
          />
          <TextField
            label={copy.confirmationCode}
            value={fields.confirmationCode}
            maxLength={1000}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!frozen}
            onChangeText={(v) => change('confirmationCode', v)}
          />
        </>
      )}
    </>
  );
}
type ContextProps = {
  context: Parameters<typeof definition.renderLatest>[0];
  target: EditorTarget;
};
function ActivityDetails({ context, target }: ContextProps) {
  const copy = activityMessages[useAppLocale()],
    t = useMessages();
  const day = context.days.find((d) => d.id === target.dayId);
  const activity = day?.activities.find((a) => a.id === target.activityId);
  return (
    <>
      <DetailRow
        label={t.itineraryChooseDay}
        value={
          day ? `${dayLabel(day.dayNumber, t)} · ${day.date ?? '—'} · ${day.title}` : copy.missing
        }
      />
      {target.activityId && (
        <DetailRow label={copy.title} value={activity?.title ?? copy.missing} />
      )}
      {activity && (
        <>
          <DetailRow label={copy.type} value={activityType(activity.type, t)} />
          <DetailRow label={copy.time} value={activity.time ?? '—'} />
          <DetailRow label={copy.endTime} value={activity.endTime ?? '—'} />
          <DetailRow label={copy.locationName} value={activity.locationName || '—'} />
          <DetailRow label={copy.place} value={activity.location?.name || '—'} />
          {activity.location && (
            <>
              <DetailRow label={copy.address} value={activity.location.display_name || '—'} />
              <DetailRow label={copy.latitude} value={String(activity.location.lat)} />
              <DetailRow label={copy.longitude} value={String(activity.location.lon)} />
            </>
          )}
          <DetailRow label={copy.content} value={activity.note || '—'} />
          <DetailRow label={copy.confirmationCode} value={activity.confirmationCode || '—'} />
        </>
      )}
    </>
  );
}
function ActivityDeletion({ context, target }: ContextProps) {
  const copy = activityMessages[useAppLocale()];
  return (
    <Section title={copy.impact}>
      <Copy>{copy.deleteHint}</Copy>
      <ActivityDetails context={context} target={target} />
    </Section>
  );
}
