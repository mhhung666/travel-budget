import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Loading skeletons (IMPROVEMENTS.md #11).
 *
 * These replace the single full-screen spinners with layout-shaped placeholders
 * so the page structure is visible while data loads, reducing layout shift and
 * improving perceived performance. The App Shell (navbar/tab bar) is rendered by
 * the (app) layout and never unmounts, so each skeleton is content-area only,
 * mirroring that page's real layout.
 */

/** A single expense-row placeholder. */
function ExpenseRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
        <div className="space-y-2 min-w-0 flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-5 w-20 shrink-0" />
    </div>
  );
}

export function TripsPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-0 sm:px-6">
          <Skeleton className="h-8 w-40" />
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Skeleton className="h-10 w-full sm:w-28" />
            <Skeleton className="h-10 w-full sm:w-28" />
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** 支出分頁（行程空間預設落點）：行程資訊卡 + 工具列 + 支出列表。殼（頁首/分頁列/摘要條）由 layout 供應。 */
export function TripDetailSkeleton() {
  return (
    <div className="container mx-auto max-w-3xl py-4 px-4 sm:px-6">
      {/* Trip info card */}
      <Card className="mb-6">
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Expense rows */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <ExpenseRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function SettlementSkeleton() {
  return (
    <div className="container mx-auto max-w-6xl py-4 px-4 sm:px-6">
      {/* Summary */}
      <Card className="mb-6">
        <CardContent className="py-6 flex flex-col items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-40" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ItinerarySkeleton() {
  return (
    <div className="container mx-auto max-w-4xl py-4 px-4 sm:px-6">
      <div className="mb-4 flex items-center justify-end">
        <Skeleton className="h-9 w-24" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function TripSettingsSkeleton() {
  return (
    <div className="container mx-auto max-w-3xl py-4 px-4 sm:px-6">
      <Skeleton className="h-6 w-24 mb-6" />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AccountSettingsSkeleton() {
  return (
    <div className="py-6 container mx-auto px-4 max-w-2xl">
      <Skeleton className="h-9 w-28 mb-6" />
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Content-area skeleton for the stats dashboard. */
export function StatsDashboardSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6 pb-12 max-w-7xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>

        {/* Date filter */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-5 w-28" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-20" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32 max-w-full" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Full-width chart */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-80 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
