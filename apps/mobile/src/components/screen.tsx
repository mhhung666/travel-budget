import { KeyboardAvoidingView, Platform, View } from 'react-native';
import type { PropsWithChildren } from 'react';
import { Action, Page, Title } from './ui';
import { spacing } from '@/theme/tokens';

export type HeaderProps = {
  title?: string;
  backLabel: string;
  onBack: () => void;
  busy?: boolean;
  backTestID?: string;
};
export function PageHeader({ title, backLabel, onBack, busy = false, backTestID }: HeaderProps) {
  return (
    <View style={{ gap: spacing.small }}>
      <Action
        variant="ghost"
        icon="chevron-left"
        label={backLabel}
        disabled={busy}
        testID={backTestID}
        onPress={onBack}
      />
      {!!title && <Title>{title}</Title>}
    </View>
  );
}
/** No global navigation in a form; all ways to leave still pass through its route guard. */
export function FormPage({ children, ...header }: PropsWithChildren<HeaderProps>) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Page form>
        <PageHeader {...header} />
        {children}
      </Page>
    </KeyboardAvoidingView>
  );
}
