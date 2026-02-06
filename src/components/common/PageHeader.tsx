'use client';

import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backButton?: boolean;
  backButtonLabel?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

/**
 * Page header component with optional back button and actions
 *
 * @example
 * <PageHeader
 *   title="Trip Details"
 *   subtitle="Manage your trip expenses"
 *   backButton
 *   onBack={() => router.push('/trips')}
 *   actions={
 *     <Button variant="default" className="gap-2">
*       <Plus size={16} />
 *       Add Expense
 *     </Button>
 *   }
 * />
 */
export function PageHeader({
  title,
  subtitle,
  backButton,
  backButtonLabel = 'Back',
  onBack,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-8">
      {backButton && onBack && (
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-4 text-muted-foreground hover:text-foreground pl-0 hover:bg-transparent"
        >
          <ArrowLeft size={20} className="mr-2" />
          {backButtonLabel}
        </Button>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
