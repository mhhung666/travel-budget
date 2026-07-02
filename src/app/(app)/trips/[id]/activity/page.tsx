'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { ActivityFeed } from '@/components/activity';
import { useTrip } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function TripActivityPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tActivity = useTranslations('activity');
  const tCommon = useTranslations('common');

  const { data: trip } = useTrip(tripId);

  return (
    <div className="container mx-auto max-w-2xl py-6 px-4 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => router.push(`/trips/${tripId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {trip?.name || tCommon('back')}
        </Button>
      </div>

      <h1 className="mb-4 text-xl font-semibold">{tActivity('title')}</h1>
      <Card>
        <CardContent className="p-2 sm:p-3">
          <ActivityFeed tripId={tripId} />
        </CardContent>
      </Card>
    </div>
  );
}
