'use client';

import { useEffect, useMemo } from 'react';
import { ArrowLeft, History, MoreHorizontal, Plus, Settings, Wallet } from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { formatCurrency } from '@/constants/currencies';
import { useTripSpace } from '@/hooks/useTripSpace';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BudgetDialog } from '@/components/trips/detail/dialogs';
import { ExpenseFormSheet } from '@/components/trips/detail/expense-form';
import { TripSpaceProvider, type AddExpensePrefill } from './TripSpaceContext';

/**
 * 行程空間殼（trips/[id]/layout.tsx 掛載，換分頁不重繪）：
 * - 頁首列：返回鍵 + 行程名 + 鈴鐺（行動端，AppShell 頂列在空間內隱藏）+「更多」選單
 *   （預算／活動紀錄／行程設定 — 低頻功能不佔分頁）。
 * - 分頁列：支出／行程／結算／統計／清單，取代舊的 7 顆入口按鈕；可橫向滑動、
 *   `aria-current` 標記現在位置。URL 與各子頁 route 不變，只是掛進這個殼。
 * - 常駐摘要條：總支出（有預算時加進度條），跨分頁常駐。
 * - FAB：行動端「新增支出」，行程空間內永遠在場（成員限定）。
 */
export function TripSpaceShell({
  tripId,
  children,
}: {
  tripId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');
  const tExpense = useTranslations('expense');
  const tBudget = useTranslations('budget');

  const {
    trip,
    isLoading,
    members,
    currentUser,
    isMember,
    isAdmin,
    itineraryDays,
    existingTags,
    budgetProgress,
    addExpenseDialog,
    budgetDialog,
    handleAddExpense,
    handleSetBudget,
  } = useTripSpace(tripId);

  // 隨手記為成員限定（無公開分享路由），分享連結訪客不顯示該分頁
  const tabs: { href: string; label: string; exact?: boolean }[] = [
    { href: ROUTES.TRIP_DETAIL(tripId), label: tTrip('tabs.expenses'), exact: true },
    ...(isMember ? [{ href: ROUTES.TRIP_NOTES(tripId), label: tTrip('tabs.notes') }] : []),
    { href: ROUTES.TRIP_ITINERARY(tripId), label: tTrip('tabs.itinerary') },
    { href: ROUTES.TRIP_SETTLEMENT(tripId), label: tTrip('tabs.settlement') },
    { href: ROUTES.TRIP_STATS(tripId), label: tTrip('tabs.stats') },
    { href: ROUTES.TRIP_CHECKLISTS(tripId), label: tTrip('tabs.checklists') },
  ];

  const isTabActive = (tab: (typeof tabs)[number]) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

  // 「更多」頁（活動紀錄／行程設定）不在分頁列上，返回鍵先回行程空間；
  // 分頁本身互為同層，返回鍵離開空間回行程列表。
  const onMorePage =
    pathname.startsWith(ROUTES.TRIP_ACTIVITY(tripId)) ||
    pathname.startsWith(ROUTES.TRIP_SETTINGS(tripId));
  const backTarget = onMorePage ? ROUTES.TRIP_DETAIL(tripId) : ROUTES.TRIPS;

  const openAddExpense = addExpenseDialog.openDialog;
  const contextValue = useMemo(
    () => ({ openAddExpense: (prefill?: AddExpensePrefill) => openAddExpense(prefill) }),
    [openAddExpense]
  );

  // PWA「記一筆」捷徑（/quick-add → /trips/[id]?add=expense）：成員身分確認後
  // 直接開新增支出，並把參數自網址剝掉避免重整/分享時重複觸發。
  // 用 window.location 而非 useSearchParams，免去 Suspense 邊界需求。
  const isMemberReady = isMember;
  useEffect(() => {
    if (!isMemberReady) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('add') === 'expense') {
      url.searchParams.delete('add');
      window.history.replaceState(null, '', url);
      openAddExpense();
    }
  }, [isMemberReady, openAddExpense]);

  const { total, totalSpent } = budgetProgress;
  const overBudget = total !== null && totalSpent > total;
  const percent = total !== null && total > 0 ? Math.min((totalSpent / total) * 100, 100) : 0;

  return (
    <TripSpaceProvider value={contextValue}>
      <div className="flex min-h-full flex-col">
        {/* 空間頁首 + 分頁列 + 摘要條：sticky（行動端置頂；桌機貼在 AppShell 頂列下方） */}
        <div className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:top-16">
          <div className="container mx-auto max-w-6xl px-2 sm:px-4">
            {/* 頁首列 */}
            <div className="flex h-12 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={onMorePage ? tTrips('detail.backToTrip') : tTrips('detail.backToTrips')}
                onClick={() => router.push(backTarget)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              {trip ? (
                <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{trip.name}</h1>
              ) : (
                <div className="min-w-0 flex-1">
                  {isLoading && <Skeleton className="h-5 w-32" />}
                </div>
              )}

              <div className="flex shrink-0 items-center gap-1">
                {/* AppShell 頂列在行程空間內於行動端隱藏，鈴鐺移到這裡（桌機仍在頂列） */}
                <span className="md:hidden">
                  <NotificationBell />
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11"
                      aria-label={tTrip('more')}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isMember && (
                      <DropdownMenuItem onClick={() => budgetDialog.openDialog()}>
                        <Wallet className="mr-2 h-4 w-4" />
                        {tBudget('title')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => router.push(ROUTES.TRIP_ACTIVITY(tripId))}>
                      <History className="mr-2 h-4 w-4" />
                      {tTrip('viewActivity')}
                    </DropdownMenuItem>
                    {isMember && (
                      <DropdownMenuItem onClick={() => router.push(ROUTES.TRIP_SETTINGS(tripId))}>
                        <Settings className="mr-2 h-4 w-4" />
                        {tTrip('settings')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* 分頁列：可橫向滑動 */}
            <nav
              aria-label={tTrip('tabs.label')}
              className="-mb-px flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((tab) => {
                const active = isTabActive(tab);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-11 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* 常駐摘要條：總支出 /（若有）預算進度 */}
          <div className="border-t bg-muted/40">
            <div className="container mx-auto flex h-9 max-w-6xl items-center justify-between gap-3 px-4 text-sm">
              <span className="shrink-0 text-muted-foreground">
                {tTrips('detail.totalSpent')}{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(totalSpent, 'TWD')}
                </span>
              </span>
              {total !== null ? (
                <span
                  className={cn(
                    'truncate text-xs tabular-nums',
                    overBudget ? 'font-medium text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {tBudget('total')} {formatCurrency(total, 'TWD')} ·{' '}
                  {overBudget
                    ? `${tBudget('overBudget')} ${formatCurrency(totalSpent - total, 'TWD')}`
                    : `${tBudget('remaining')} ${formatCurrency(total - totalSpent, 'TWD')}`}
                </span>
              ) : (
                isAdmin && (
                  <button
                    type="button"
                    onClick={() => budgetDialog.openDialog()}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    {tBudget('empty.cta')}
                  </button>
                )
              )}
            </div>
            {total !== null && (
              <div
                role="progressbar"
                aria-label={tBudget('title')}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={Math.min(totalSpent, total)}
                className="h-1 w-full bg-muted"
              >
                <div
                  className={cn('h-full', overBudget ? 'bg-destructive' : 'bg-primary')}
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">{children}</div>

        {/* FAB：新增支出（行動端；桌機用支出分頁工具列按鈕） */}
        {isMember && (
          <Button
            onClick={() => addExpenseDialog.openDialog()}
            aria-label={tExpense('add')}
            className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden [&_svg]:size-6"
          >
            <Plus />
          </Button>
        )}

        {/* 空間層級 Dialogs：新增支出（FAB／工具列共用）、預算 */}
        <ExpenseFormSheet
          mode="add"
          tripId={tripId}
          open={addExpenseDialog.open}
          onClose={addExpenseDialog.closeDialog}
          onSubmit={handleAddExpense}
          members={members}
          currentUser={currentUser}
          itineraryDays={itineraryDays}
          existingTags={existingTags}
          initialDescription={addExpenseDialog.data?.description}
        />

        <BudgetDialog
          open={budgetDialog.open}
          onClose={budgetDialog.closeDialog}
          onSubmit={handleSetBudget}
          budget={trip?.budget ?? null}
        />
      </div>
    </TripSpaceProvider>
  );
}
