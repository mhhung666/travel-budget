import { Keyboard, View } from 'react-native';
import { Chip, Copy, Notice, Section, TextField } from '@/components/ui';
import type { ExpenseDraft } from '@/storage/expenseDrafts';
import type { Messages } from '@/i18n/messages';
import { splitLabel, splitModeOf, splitModes, splitNumber } from './splitInput';

/** Raw text only. The backend owns balance, rounding and every member's final share. */
export function SplitFields({
  draft,
  members,
  t,
  disabled,
  attempted,
  available,
  accessoryId,
  onChange,
  requireSelection = false,
}: {
  draft: ExpenseDraft;
  members: { id: string; label: string }[];
  t: Messages;
  disabled: boolean;
  attempted: boolean;
  available: boolean;
  accessoryId?: string;
  onChange: (patch: Partial<ExpenseDraft>) => void;
  requireSelection?: boolean;
}) {
  const mode = splitModeOf(draft);
  const values = mode === 'equal' ? {} : (draft.splitValues?.[mode] ?? {});
  return (
    <Section title={t.splitMode}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {splitModes.map((value) => (
          <Chip
            key={value}
            testID={`expense-split-mode-${value}`}
            label={splitLabel(value, t)}
            selected={(!requireSelection || draft.splitMode !== undefined) && mode === value}
            disabled={disabled}
            onPress={() => onChange({ splitMode: value })}
          />
        ))}
      </View>
      {requireSelection && draft.splitMode === undefined ? (
        <Notice>{t.chooseNewSplit}</Notice>
      ) : (
        <Copy>
          {mode === 'equal'
            ? t.splitEqualHint
            : mode === 'amount'
              ? t.splitAmountHint
              : mode === 'percent'
                ? t.splitPercentHint
                : t.splitSharesHint}
        </Copy>
      )}
      {mode !== 'equal' && !available && <Notice tone="warning">{t.splitUnavailable}</Notice>}
      {mode !== 'equal' &&
        members
          .filter((m) => draft.memberIds.includes(m.id))
          .map((m) => (
            <TextField
              key={m.id}
              testID={`expense-split-value-${m.id}`}
              label={`${m.label} · ${mode === 'amount' ? (draft.currency ?? 'TWD') : splitLabel(mode, t)}`}
              value={values[m.id] ?? ''}
              placeholder={mode === 'shares' ? t.splitDefaultOne : t.splitRemainder}
              editable={!disabled}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              inputAccessoryViewID={accessoryId}
              autoCorrect={false}
              error={
                attempted && splitNumber(values[m.id] ?? '', mode) === undefined
                  ? t.splitInvalid
                  : undefined
              }
              onChangeText={(text) =>
                onChange({
                  splitValues: {
                    ...draft.splitValues,
                    [mode]: { ...values, [m.id]: text },
                  },
                })
              }
            />
          ))}
    </Section>
  );
}
