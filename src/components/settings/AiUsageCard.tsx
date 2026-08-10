'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getAiUsageSummary } from '@/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const AI_USAGE_QUERY_KEY = ['settings', 'ai-usage'] as const;

export function AiUsageCard() {
  const t = useTranslations('settings.aiUsage');
  const locale = useLocale();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: AI_USAGE_QUERY_KEY,
    queryFn: async () => {
      const result = await getAiUsageSummary();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return <Skeleton className="mb-6 h-36 w-full rounded-xl" data-testid="ai-usage-loading" />;
  }

  if (isError || !data) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center gap-3 p-4">
          <Sparkles className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t('title')}</p>
            <p className="text-xs text-muted-foreground">{t('loadFailed')}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            {isFetching ? t('loading') : t('retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const percentage = Math.min(100, (data.used_requests / data.request_limit) * 100);
  const resetTime = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(data.resets_at));

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{t('title')}</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {t('usage', {
                  used: data.used_requests,
                  limit: data.request_limit,
                })}
              </p>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={t('progressLabel')}
              aria-valuemin={0}
              aria-valuemax={data.request_limit}
              aria-valuenow={Math.min(data.used_requests, data.request_limit)}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{t('remaining', { count: data.remaining_requests })}</span>
              <span>{t('resetsAt', { time: resetTime })}</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('description')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
