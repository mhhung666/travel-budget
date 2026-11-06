import { Action, Copy, DetailRow, Notice, TextField } from '@/components/ui';
import { NavigationMenu } from '@/components/NavigationMenu';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { activityMessages } from '@/i18n/activityMessages';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { itineraryActivityInput, type ItineraryEditContext } from '@travel-budget/contracts';
import { activityEndDayOffset, type ActivityFields } from './activityForm';
import { activityTiming } from './presentation';

export function ActivityTimeFields({
  fields,
  context,
  dayId,
  frozen,
  change,
}: {
  fields: ActivityFields;
  context: ItineraryEditContext;
  dayId: string;
  frozen: boolean;
  change: (key: keyof ActivityFields, value: string) => void;
}) {
  const locale = useAppLocale(),
    t = useMessages();
  const copy = itineraryPresentationMessages[locale],
    labels = activityMessages[locale];
  const day = context.days.find((d) => d.id === dayId);
  if (!day) return null;
  const supported = context.capabilities?.activityEndDayOffset === true;
  let offset: number | null = null,
    invalid = false;
  try {
    offset = activityEndDayOffset(fields, day);
  } catch {
    invalid = true;
  }
  const timing = !invalid
    ? activityTiming(
        {
          time: fields.time,
          endTime: fields.endTime,
          endDayOffset: offset,
          type: itineraryActivityInput.shape.type.parse(fields.type),
        },
        day,
        t,
        copy,
        context
      )
    : null;
  const options = [
    { value: '0', label: copy.sameDay },
    { value: '1', label: copy.nextDay },
    { value: 'other', label: day.date ? copy.otherDate : copy.otherDay },
    { value: 'unknown', label: copy.unconfirmed },
  ];
  return (
    <>
      {(['time', 'endTime'] as const).map((key) => (
        <TextField
          key={key}
          label={labels[key]}
          value={fields[key]}
          editable={!frozen}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={5}
          keyboardType="numbers-and-punctuation"
          onChangeText={(v) => change(key, v)}
        />
      ))}
      {frozen || !supported ? (
        <DetailRow
          label={copy.endsOn}
          value={options.find((o) => o.value === fields.endDayMode)?.label ?? copy.unconfirmed}
        />
      ) : (
        <NavigationMenu
          title={copy.endsOn}
          label={options.find((o) => o.value === fields.endDayMode)?.label ?? copy.unconfirmed}
          closeLabel={t.closeNavigation}
          testID="activity-ends-on"
          choices={options.map((o) => ({
            label: o.label,
            selected: fields.endDayMode === o.value,
            testID: `activity-end-${o.value}`,
            onPress: () => change('endDayMode', o.value),
          }))}
        />
      )}
      {fields.endDayMode === 'other' && (
        <TextField
          label={day.date ? copy.endDate : copy.endDay}
          value={fields.endDayValue}
          editable={!frozen && supported}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          onChangeText={(v) => change('endDayValue', v)}
        />
      )}
      {!supported && <Notice>{copy.unsupported}</Notice>}
      {invalid ? (
        <Notice tone="warning">{copy.invalidDate}</Notice>
      ) : (
        timing && <DetailRow label={copy.summary} value={timing.summary} />
      )}
      {timing?.outsideRange && <Notice tone="warning">{copy.outsideRange}</Notice>}
      {!frozen &&
        supported &&
        fields.time &&
        fields.endTime &&
        fields.endTime < fields.time &&
        ['0', 'unknown'].includes(fields.endDayMode) && (
          <Action
            testID="activity-adopt-next-day"
            variant="secondary"
            label={copy.suggestNextDay}
            onPress={() => change('endDayMode', '1')}
          />
        )}
      <Copy>{labels.timeHint}</Copy>
    </>
  );
}
