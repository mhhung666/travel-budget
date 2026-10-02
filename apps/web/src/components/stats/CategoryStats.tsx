'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Grid2X2, Receipt, Calendar } from 'lucide-react';
import { getCategoryIcon } from '@/constants/categories';
import type { CategoryStat } from '@/types';

interface CategoryStatsProps {
  categoryStats: CategoryStat[];
  cardGradient: string; // Not strictly needed with Tailwind but kept for API compatibility if needed (or removed)
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  t: (key: string) => string;
  tCategory: (key: string) => string;
}

export default function CategoryStats({
  categoryStats,
  formatCurrency,
  formatDate,
  t,
  tCategory,
}: CategoryStatsProps) {
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Grid2X2 size={20} />
        </div>
        <h2 className="text-lg font-semibold">{t('categoryStats')}</h2>
      </div>

      <div className="flex flex-col gap-3">
        {categoryStats.length > 0 ? (
          <Accordion type="single" collapsible className="space-y-3">
            {categoryStats.map((cat) => (
              <AccordionItem
                key={cat.category}
                value={cat.category}
                className="border rounded-2xl bg-card border-none shadow-sm px-1 data-[state=open]:shadow-md transition-all duration-200"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-3 [&[data-state=open]>div>svg]:rotate-180">
                  <div className="flex w-full items-center justify-between pr-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
                        {getCategoryIcon(cat.category)}
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-base leading-tight">
                          {tCategory(cat.category)}
                        </div>
                        <div className="text-xs text-muted-foreground font-medium mt-0.5">
                          {cat.count} {t('expenses')}
                        </div>
                      </div>
                    </div>
                    <div className="font-bold text-lg text-primary">
                      {formatCurrency(cat.total)}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 pt-0">
                  <div className="my-2 border-t border-dashed border-border/50" />
                  <div className="space-y-2">
                    {cat.details.map((detail) => (
                      <div
                        key={detail.id}
                        className="flex justify-between items-center p-3 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="font-medium text-sm truncate">
                            {detail.description || t('noDescription')}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Calendar size={12} />
                            <span>{formatDate(detail.date)}</span>
                            <span>·</span>
                            <span className="truncate">{detail.tripName}</span>
                          </div>
                        </div>
                        <div className="font-bold text-sm">{formatCurrency(detail.amount)}</div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="text-center py-12 opacity-60 flex flex-col items-center">
            <Receipt size={48} strokeWidth={1} className="mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">{t('noData')}</p>
          </div>
        )}
      </div>
    </>
  );
}
