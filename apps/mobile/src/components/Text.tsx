import type { Ref } from 'react';
import { Platform, Text as NativeText, useWindowDimensions, type TextProps } from 'react-native';

export type TextHandle = NativeText;

/**
 * Refresh only the iOS native paragraph when Dynamic Type changes. CD4 observed
 * stale text bounds after a live change even though glyphs already used the new size.
 * Keeping the key here leaves the control, list, modal and all form state mounted.
 */
export function Text({ ref, ...props }: TextProps & { ref?: Ref<NativeText> }) {
  const { fontScale } = useWindowDimensions();
  return <NativeText {...props} ref={ref} key={Platform.OS === 'ios' ? fontScale : 'text'} />;
}
