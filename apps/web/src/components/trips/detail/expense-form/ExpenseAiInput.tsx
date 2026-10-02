'use client';

import { useState } from 'react';
import { lazyPanel } from '@/components/common/lazyDialog';
import type { ExpenseAiInputProps } from './ExpenseAiInputContent';
import { ExpenseAiModeButtons, type AiMode } from './ExpenseAiModeButtons';

const AiContent = lazyPanel(() => import('./ExpenseAiInputContent'));

/** Manual entry needs no AI code. Keep the loaded tool's existing state until this form closes. */
export function ExpenseAiInput({ open, ...props }: ExpenseAiInputProps) {
  return open ? <ModePicker {...props} /> : null;
}

function ModePicker(props: Omit<ExpenseAiInputProps, 'open'>) {
  const [requestedMode, setRequestedMode] = useState<AiMode | null>(null);
  if (requestedMode) return <AiContent {...props} initialMode={requestedMode} />;
  return <ExpenseAiModeButtons mode={null} onSelect={setRequestedMode} />;
}
