import type { PropsWithChildren } from 'react';
import { Card, Notice, Section } from './ui';

/** Status stays visible; child actions retain separate accessible focus targets. */
export function RecoveryCard({
  title,
  message,
  tone = 'info',
  testID,
  children,
}: PropsWithChildren<{
  title?: string;
  message: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  testID?: string;
}>) {
  const content = (
    <>
      <Notice tone={tone} announce={tone === 'danger' ? 'polite' : 'none'}>
        {message}
      </Notice>
      {children}
    </>
  );
  return (
    <Card testID={testID}>{title ? <Section title={title}>{content}</Section> : content}</Card>
  );
}
