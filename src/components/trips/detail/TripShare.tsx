'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { ShareCode } from '../ShareCode';
import { Button } from '@/components/ui/button';

interface TripShareProps {
  tripHashCode: string;
  /** Admin-only: show the "regenerate share link" control (revokes the old link). */
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export default function TripShare({
  tripHashCode,
  canRegenerate = false,
  onRegenerate,
  isRegenerating = false,
}: TripShareProps) {
  const tTrip = useTranslations('trip');

  return (
    <div className="flex flex-col gap-2">
      <ShareCode hashCode={tripHashCode} title={tTrip('share')} description={tTrip('shareHint')} />
      {canRegenerate && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground hover:text-foreground"
          onClick={onRegenerate}
          disabled={isRegenerating}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
          {tTrip('regenerateShare')}
        </Button>
      )}
    </div>
  );
}
