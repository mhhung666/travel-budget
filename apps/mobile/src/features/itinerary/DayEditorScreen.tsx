import { Action, Copy, DetailRow, Section, TextField } from '@/components/ui';
import { useMessages, useAppLocale } from '@/i18n/useMessages';
import { itineraryMessages } from '@/i18n/itineraryMessages';
import {
  dayFields,
  prepareDay,
  restoreDayFields,
  sameDaySnapshot,
  type DayFields,
  type DayCommand,
} from './dayForm';
import {
  ItineraryEditorScreen,
  type EditorTarget,
  type EditorDefinition,
} from './ItineraryEditorScreen';

const definition: EditorDefinition<DayFields, DayCommand> = {
  messages: itineraryMessages,
  testId: 'itinerary-day',
  editing: (t) => !!t.dayId,
  exists: (c, t) => !t.dayId || c.days.some((d) => d.id === t.dayId),
  fields: (c, t) =>
    dayFields(
      c,
      c.days.find((d) => d.id === t.dayId)
    ),
  prepare: (c, f, t) =>
    prepareDay(
      c,
      f,
      c.days.find((d) => d.id === t.dayId),
      t.remove
    ),
  restore: restoreDayFields,
  accepts: (c, t): c is DayCommand =>
    c.operation.startsWith('day.') &&
    ('dayId' in c ? c.dayId === t.dayId : !t.dayId) &&
    (c.operation === 'day.delete') === !!t.remove,
  same: (a, b, t) => sameDaySnapshot(a, b, t.dayId, t.remove),
  Fields: DayFieldsForm,
  renderLatest: (context, target) => <LatestDay context={context} target={target} />,
  renderReview: (context, target) => <DeleteImpact context={context} target={target} />,
};
export function DayEditorScreen(props: Omit<EditorTarget, 'activityId'>) {
  return <ItineraryEditorScreen {...props} definition={definition} />;
}
type FieldsProps = Parameters<typeof definition.Fields>[0];
function DayFieldsForm({ fields, context, target, frozen, change, clearPlace }: FieldsProps) {
  const copy = itineraryMessages[useAppLocale()];
  return (
    <>
      <TextField
        label={copy.title}
        value={fields.title}
        editable={!frozen && !target.remove}
        maxLength={1000}
        onChangeText={(v) => change('title', v)}
      />
      <TextField
        label={context.startDate ? copy.date : copy.number}
        value={context.startDate ? fields.date : fields.dayNumber}
        editable={!frozen && !target.remove}
        keyboardType={context.startDate ? 'default' : 'number-pad'}
        onChangeText={(v) => change(context.startDate ? 'date' : 'dayNumber', v)}
      />
      {!target.remove && (
        <>
          <TextField
            label={copy.content}
            value={fields.content}
            multiline
            maxLength={50000}
            editable={!frozen}
            onChangeText={(v) => change('content', v)}
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
        </>
      )}
    </>
  );
}
type ContextProps = {
  context: Parameters<typeof definition.renderLatest>[0];
  target: EditorTarget;
};
function LatestDay({ context, target }: ContextProps) {
  const copy = itineraryMessages[useAppLocale()];
  const t = useMessages();
  const day = context.days.find((d) => d.id === target.dayId);
  return (
    <>
      <DetailRow label={t.startDate} value={context.startDate ?? '—'} />
      <DetailRow label={t.endDate} value={context.endDate ?? '—'} />
      {target.dayId && <DetailRow label={copy.title} value={day?.title ?? copy.missing} />}
      {day && (
        <>
          <DetailRow
            label={day.date ? copy.date : copy.number}
            value={day.date ?? String(day.dayNumber)}
          />
          <DetailRow label={copy.content} value={day.content || '—'} />
          <DetailRow label={copy.place} value={day.location?.name || '—'} />
          {day.location && (
            <>
              <DetailRow label={copy.address} value={day.location.display_name || '—'} />
              <DetailRow label={copy.latitude} value={String(day.location.lat)} />
              <DetailRow label={copy.longitude} value={String(day.location.lon)} />
            </>
          )}
        </>
      )}
    </>
  );
}
function DeleteImpact({ context, target }: ContextProps) {
  const copy = itineraryMessages[useAppLocale()];
  const day = context.days.find((d) => d.id === target.dayId);
  if (!target.remove || !day) return null;
  return (
    <Section title={copy.impact}>
      <Copy>{copy.deleteHint}</Copy>
      <DetailRow label={copy.activities} value={String(day.deleteImpact.activityCount)} />
      <DetailRow label={copy.tickets} value={String(day.deleteImpact.attachmentCount)} />
      <DetailRow label={copy.expenses} value={String(day.deleteImpact.expenseCount)} />
      <DetailRow label={copy.photos} value={String(day.deleteImpact.photoCount)} />
    </Section>
  );
}
