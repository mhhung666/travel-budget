'use client';

import { MapPin } from 'lucide-react';
import { useLocale } from 'next-intl';
import type { Location } from '@/types';
import { cn, pickLocalizedName } from '@/lib/utils';

interface TripRouteProps {
  departure?: Location | null;
  destination?: Location | null;
  /** MapPin 圖示大小（px）。 */
  iconSize?: number;
  /** 外層容器額外樣式（可覆寫 gap / margin 等）。 */
  className?: string;
  /** 地名過長時截斷（卡片等窄容器用）。 */
  truncate?: boolean;
}

/**
 * 顯示一趟旅行的「出發地 → 目的地」（依當前語系挑在地化地名）。
 * 兩端皆空時不渲染。TripCard / TripHeader 共用。
 */
export default function TripRoute({
  departure,
  destination,
  iconSize = 14,
  className,
  truncate,
}: TripRouteProps) {
  const locale = useLocale();
  if (!departure && !destination) return null;

  const text = [departure, destination]
    .filter((loc): loc is Location => Boolean(loc))
    .map((loc) => pickLocalizedName(loc.names, locale, loc.name))
    .join(' → ');

  return (
    <div className={cn('flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
      <MapPin size={iconSize} className="shrink-0 text-muted-foreground" />
      <span className={cn(truncate && 'truncate')}>{text}</span>
    </div>
  );
}
