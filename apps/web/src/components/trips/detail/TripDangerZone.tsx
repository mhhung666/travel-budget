'use client';

import { Trash2, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TripDangerZoneProps {
  onDelete: () => void;
}

export default function TripDangerZone({ onDelete }: TripDangerZoneProps) {
  const tTrip = useTranslations('trip');

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-destructive text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {tTrip('dangerZone')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" className="w-full gap-2" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          {tTrip('deleteTrip')}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">{tTrip('deleteWarning')}</p>
      </CardContent>
    </Card>
  );
}
