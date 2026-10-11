import { useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Action, Card, DetailRow, Section } from '@/components/ui';
import type { Messages } from '@/i18n/messages';
import { spacing } from '@/theme/tokens';

/** Keep related inputs within one surface, with no extra page-sized gap between fields. */
export function ExpenseFormSection({
  title,
  testID,
  children,
}: PropsWithChildren<{ title: string; testID: string }>) {
  return (
    <Card testID={testID}>
      <Section title={title}>{children}</Section>
    </Card>
  );
}

/** Selection only: per-person amounts, errors and confirmation must remain outside. */
export function ExpenseMemberSelection({
  payer,
  count,
  t,
  testID,
  disabled,
  needsAttention,
  children,
}: PropsWithChildren<{
  payer: string;
  count: number;
  t: Messages;
  testID: string;
  disabled: boolean;
  needsAttention: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const expanded = open || needsAttention;
  return (
    <View
      testID={`${testID}-${expanded ? 'expanded' : 'collapsed'}`}
      style={{ gap: spacing.compact }}
    >
      <DetailRow label={t.paidBy} value={payer} />
      <DetailRow label={t.splitMembers} value={String(count)} />
      <Action
        testID={testID}
        variant="ghost"
        label={t.chooseExpenseMembers}
        expanded={expanded}
        disabled={disabled || needsAttention}
        onPress={() => setOpen((value) => !value)}
      />
      {expanded && children}
    </View>
  );
}
