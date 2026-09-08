'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Keyboard, ScanLine, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { lazyPanel } from '@/components/common/lazyDialog';
import type { ExpenseAiInputProps } from './ExpenseAiInputContent';

const AiContent = lazyPanel(() => import('./ExpenseAiInputContent'));

/** Manual entry needs no AI code. Keep the loaded tool's existing state until this form closes. */
export function ExpenseAiInput({ open, ...props }: ExpenseAiInputProps) {
  return open ? <ModePicker {...props} /> : null;
}

function ModePicker(props: Omit<ExpenseAiInputProps, 'open'>) {
  const t = useTranslations('expense.form.ai');
  const [requestedMode, setRequestedMode] = useState<string | null>(null);
  if (requestedMode) return <AiContent {...props} initialMode={requestedMode} />;
  return (
    <section
      className="space-y-3 rounded-xl border bg-muted/20 p-3"
      aria-labelledby="expense-ai-title"
    >
      <div className="flex items-start gap-2">
        <span className="rounded-lg bg-primary/10 p-2 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 id="expense-ai-title" className="text-sm font-semibold">
            {t('title')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
      </div>
      <Tabs value="manual" onValueChange={(mode) => mode !== 'manual' && setRequestedMode(mode)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual">
            <Keyboard className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('modes.manual')}
          </TabsTrigger>
          <TabsTrigger value="text">
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('modes.text')}
          </TabsTrigger>
          <TabsTrigger value="receipt">
            <ScanLine className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('modes.receipt')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="mb-0 text-sm text-muted-foreground">
          {t('manualHint')}
        </TabsContent>
      </Tabs>
    </section>
  );
}
