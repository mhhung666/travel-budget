'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TripArchiveProps {
  isArchived: boolean;
  onToggle: () => void;
  isToggling?: boolean;
}

/**
 * Per-member archive control. Archiving only collapses this trip from the
 * current user's list (others are unaffected) and is fully reversible, so this
 * lives outside the admin-only danger zone and is available to every member.
 */
export default function TripArchive({
  isArchived,
  onToggle,
  isToggling = false,
}: TripArchiveProps) {
  const tTrip = useTranslations('trip');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {isArchived ? tTrip('unarchive') : tTrip('archive')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full gap-2" onClick={onToggle} disabled={isToggling}>
          {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {isArchived ? tTrip('unarchive') : tTrip('archive')}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {isArchived ? tTrip('archivedNote') : tTrip('archiveHint')}
        </p>
      </CardContent>
    </Card>
  );
}
