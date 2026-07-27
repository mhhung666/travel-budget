'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export interface ShareCodeProps {
  hashCode: string;
  title?: string;
  description?: string;
}

/**
 * Share code component for inviting others to join a trip
 *
 * @example
 * <ShareCode
 *   hashCode={trip.hash_code}
 *   title="Share this trip"
 *   description="Share this code with friends to let them join"
 * />
 */
export function ShareCode({
  hashCode,
  title = 'Share Code',
  description = 'Share this code to let others join',
}: ShareCodeProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const tCommon = useTranslations('common');

  const getShareUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/join/${hashCode}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      toast({
        description: tCommon('copied'),
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy', err);
    }
  };

  return (
    <Card className="border-info/30 bg-info/5">
      <CardContent className="p-4">
        <h4 className="font-semibold text-sm mb-2 text-foreground">{title}</h4>
        <div className="flex gap-2 items-center">
          <Input value={getShareUrl()} readOnly className="flex-1 bg-background h-9" />
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
            className="h-9 w-9 shrink-0"
            aria-label={tCommon('copy')}
          >
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}
