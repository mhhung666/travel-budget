'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingStateProps {
  message?: string;
  size?: number;
  fullScreen?: boolean;
}

/**
 * Loading state component
 *
 * @example
 * // Simple loading
 * if (loading) return <LoadingState />;
 *
 * // With message
 * if (loading) return <LoadingState message="Loading trips..." />;
 *
 * // Full screen
 * if (loading) return <LoadingState fullScreen />;
 */
export function LoadingState({ message, size = 60, fullScreen = false }: LoadingStateProps) {
  // Convert 'size' number roughly to rem or px classes if needed, but
  // lucide icons take numbers directly for pixels.

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        fullScreen
          ? 'fixed inset-0 z-[9999] min-h-screen bg-background'
          : 'py-16'
      )}
    >
      <Loader2 className="animate-spin text-primary" size={size} />
      {message && (
        <p className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
