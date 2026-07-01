'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tag, Calendar } from 'lucide-react';
import type { TagStat } from '@/types';

interface TagStatsProps {
  tagStats: TagStat[];
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  t: (key: string) => string;
}

/**
 * 標籤統計（ROADMAP #18）——與 CategoryStats 同結構，但 key 為自由文字的 tag
 * 而非固定分類，故用單一 Tag 圖示（tag 無圖示對照表）。
 */
export default function TagStats({ tagStats, formatCurrency, formatDate, t }: TagStatsProps) {
  if (tagStats.length === 0) return null;

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Tag size={20} />
        </div>
        <h2 className="text-xl font-bold">{t('tagStats')}</h2>
      </div>

      <div className="flex flex-col gap-3">
        <Accordion type="single" collapsible className="space-y-3">
          {tagStats.map((tagStat) => (
            <AccordionItem
              key={tagStat.tag}
              value={tagStat.tag}
              className="border rounded-2xl bg-card border-none shadow-sm px-1 data-[state=open]:shadow-md transition-all duration-200"
            >
              <AccordionTrigger className="hover:no-underline px-4 py-3 [&[data-state=open]>div>svg]:rotate-180">
                <div className="flex w-full items-center justify-between pr-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Tag size={18} />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-base leading-tight">{tagStat.tag}</div>
                      <div className="text-xs text-muted-foreground font-medium mt-0.5">
                        {tagStat.count} {t('expenses')}
                      </div>
                    </div>
                  </div>
                  <div className="font-bold text-lg text-primary">
                    {formatCurrency(tagStat.total)}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-0">
                <div className="my-2 border-t border-dashed border-border/50" />
                <div className="space-y-2">
                  {tagStat.details.map((detail) => (
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
      </div>
    </>
  );
}
