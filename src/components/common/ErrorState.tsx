'use client';

import { RefreshCcw, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  message: string;
  title?: string;
  onRetry?: () => void;
  onBack?: () => void;
  retryText?: string;
  backText?: string;
  fullScreen?: boolean;
}

/**
 * Error state component
 *
 * @example
 * // Simple error
 * if (error) return <ErrorState message={error} />;
 *
 * // With retry button
 * if (error) return <ErrorState message={error} onRetry={refetch} />;
 *
 * // With back button
 * if (error) return <ErrorState message={error} onBack={() => router.back()} />;
 *
 * // Full screen
 * if (error) return <ErrorState message={error} fullScreen />;
 */
export function ErrorState({
  message,
  title,
  onRetry,
  onBack,
  retryText = 'Retry',
  backText = 'Go Back',
  fullScreen = false,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6',
        fullScreen ? 'min-h-screen' : 'py-16'
      )}
    >
      <div className="text-center max-w-md w-full px-4">
        {title && (
          <h2 className="text-xl font-semibold mb-4">{title}</h2>
        )}

        <Alert variant="destructive" className="mb-6 flex flex-col items-center text-center">
          <AlertCircle className="h-5 w-5 mb-2" />
          <AlertDescription className="text-sm">
            {message}
          </AlertDescription>
        </Alert>

        <div className="flex gap-4 justify-center">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="gap-2">
              <ArrowLeft size={16} />
              {backText}
            </Button>
          )}
          {onRetry && (
            <Button onClick={onRetry} className="gap-2">
              <RefreshCcw size={16} />
              {retryText}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
