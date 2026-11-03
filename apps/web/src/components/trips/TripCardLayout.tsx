'use client';

import { useEffect, useRef, useState, type ReactNode, type ComponentProps } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function TripCardFrame(props: Omit<ComponentProps<typeof Card>, 'className'>) {
  return (
    <Card
      {...props}
      className="trip-card relative isolate flex h-full flex-col rounded-[14px] border-border bg-card shadow-sm transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none"
    />
  );
}

/** Shared real/loading slots: only the title reserves space for the independent menu. */
export function TripCardLayout({
  title,
  more,
  status,
  dates,
  members,
  summary,
  open,
  shortcut,
}: {
  title: ReactNode;
  more: ReactNode;
  status: ReactNode;
  dates: ReactNode;
  members: ReactNode;
  summary: ReactNode;
  open: ReactNode;
  shortcut?: ReactNode;
}) {
  return (
    <div className="pointer-events-none flex h-full flex-col">
      <div className="space-y-3 p-4">
        <div className="flex min-h-12 items-start gap-2">
          <div className="min-w-0 flex-1 pt-2">{title}</div>
          <div className="pointer-events-auto relative z-10 shrink-0">{more}</div>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>{status}</div>
          <div>{dates}</div>
          <div>{members}</div>
        </div>
        {summary}
      </div>
      <div className="relative mt-auto flex min-h-12 flex-wrap items-center justify-between gap-2 border-t border-border p-4">
        <span className="flex min-h-12 min-w-0 items-center gap-2 text-sm text-muted-foreground">
          {open}
        </span>
        {shortcut && (
          <div className="pointer-events-auto relative z-10 min-w-0 max-w-full">{shortcut}</div>
        )}
      </div>
    </div>
  );
}

/** Intrinsic columns use the actual content width and tabular-digit width, including text zoom. */
export function TripCardSummary({
  left,
  right,
  characters = 9,
}: {
  left: ReactNode;
  right: ReactNode;
  characters?: number;
}) {
  const ref = useRef<HTMLDListElement>(null);
  const [stacked, setStacked] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const [first, second] = Array.from(element.children) as HTMLElement[];
      setStacked(second.offsetTop > first.offsetTop);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <dl
      ref={ref}
      data-trip-summary
      data-stacked={stacked}
      className="trip-card-summary relative grid gap-3 text-xl tabular-nums"
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, calc(${Math.max(9, characters + 1)}ch + 12px)), 1fr))`,
      }}
    >
      <div className="min-w-0 space-y-1">{left}</div>
      <div className="relative min-w-0 space-y-1">{right}</div>
    </dl>
  );
}

export function TripCardSkeleton({ archived = false }: { archived?: boolean }) {
  const line = (width: string, height = 'h-5') => (
    <Skeleton className={`${height} ${width} max-w-full animate-none`} />
  );
  return (
    <TripCardFrame aria-hidden="true" data-trip-card-skeleton>
      <TripCardLayout
        title={line('w-3/4', 'h-7')}
        more={<div className="flex h-12 w-12 items-center justify-center">{line('w-5')}</div>}
        status={line('w-20')}
        dates={line('w-40')}
        members={line('w-28')}
        summary={
          <TripCardSummary
            left={
              <>
                {line('w-20')}
                {line('w-28', 'h-7')}
              </>
            }
            right={
              <>
                {line('w-16')}
                {line('w-24', 'h-6')}
              </>
            }
          />
        }
        open={line('w-24')}
        shortcut={!archived && line('w-24', 'h-12')}
      />
    </TripCardFrame>
  );
}
