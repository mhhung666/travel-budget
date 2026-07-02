'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ActivityFeed } from '@/components/activity';
import { Card, CardContent } from '@/components/ui/card';

export default function TripActivityPage() {
  const params = useParams();
  const tripId = params.id as string;
  const tActivity = useTranslations('activity');

  // 返回鍵由行程空間殼提供（「更多」頁返回行程空間）
  return (
    <div className="container mx-auto max-w-2xl py-4 px-4 sm:px-6">
      <h2 className="mb-4 text-lg font-semibold">{tActivity('title')}</h2>
      <Card>
        <CardContent className="p-2 sm:p-3">
          <ActivityFeed tripId={tripId} />
        </CardContent>
      </Card>
    </div>
  );
}
